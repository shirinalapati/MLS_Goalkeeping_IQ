"""Match-level bootstrap intervals.

A goalkeeper's season is resampled at the match level, which is the natural
independent unit and keeps within-match correlation intact. Two different
intervals come out of it, because they answer two different questions.

**Observed rate interval** — the ordinary bootstrap percentile interval for
Total G+ per 96. It answers "how much would this goalkeeper's recorded output
have moved if the season had broken differently?"

**Adjusted rate interval** — a posterior credible interval for the goalkeeper's
underlying ability. The bootstrap supplies a non-parametric estimate of the
sampling variance ``sigma_y^2`` of the observed rate, which combines with the
between-goalkeeper talent variance ``tau^2`` in the standard normal-normal
result::

    reliability w = tau^2 / (tau^2 + sigma_y^2)
    posterior variance = (1 - w) * tau^2

Bootstrapping the *shrunk* estimate directly would be a mistake: shrinkage pins
a twenty-minute goalkeeper to the league mean, so resampling him produces an
extremely tight interval that would imply confidence we do not have. The
posterior interval behaves correctly, widening as the sample shrinks.

The random seed comes from configuration, so a rebuild on the same data
produces byte-identical intervals.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from .config import Config
from .logging_utils import get_logger
from .rates import TOTAL_KEY
from .reliability import LeagueBaseline, ReliabilityModel

LOG = get_logger("uncertainty")


@dataclass
class BootstrapSettings:
    enabled: bool
    resamples: int
    seed: int
    interval: float
    min_matches: int

    @classmethod
    def from_config(cls, cfg: Config) -> BootstrapSettings:
        section = cfg.section("uncertainty", "bootstrap")
        return cls(
            enabled=bool(section["enabled"]),
            resamples=int(section["resamples"]),
            seed=int(section["seed"]),
            interval=float(section["interval"]),
            min_matches=int(section["min_matches"]),
        )

    @property
    def lower_quantile(self) -> float:
        return (1.0 - self.interval) / 2.0

    @property
    def upper_quantile(self) -> float:
        return 1.0 - self.lower_quantile

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "resamples": self.resamples,
            "seed": self.seed,
            "interval": self.interval,
            "min_matches": self.min_matches,
            "method": "match-level nonparametric bootstrap with shrinkage re-applied",
        }


def bootstrap_season(
    cfg: Config,
    season_frame: pd.DataFrame,
    matches: pd.DataFrame,
    model: ReliabilityModel,
    settings: BootstrapSettings,
    baseline: LeagueBaseline | None = None,
) -> pd.DataFrame:
    """Bootstrap adjusted Total G+ per 96 for every goalkeeper in a season.

    Returns one row per ``player_id`` with the interval bounds and the standard
    error of the adjusted rate.
    """
    columns = [
        "player_id",
        "adj_total_p96_low",
        "adj_total_p96_high",
        "adj_total_p96_se",
        "observed_total_p96_low",
        "observed_total_p96_high",
        "observed_total_p96_se",
        "bootstrap_reliability",
        "bootstrap_resamples",
    ]
    if not settings.enabled or matches.empty:
        return pd.DataFrame(columns=columns)

    talent_variance = float(model.total.talent_variance)
    if talent_variance <= 0:
        LOG.warning(
            "Total talent variance is not positive; adjusted-rate intervals are suppressed."
        )

    component_keys = cfg.component_keys
    basis = float(cfg.minutes_basis)
    ks = np.array([model.k(key) for key in component_keys], dtype=float)
    volume_ks = np.array([model.volume_k(key) for key in component_keys], dtype=float)
    mus = np.array(
        [
            baseline.value_per_opportunity[key] if baseline else model.league_mean(key)
            for key in component_keys
        ],
        dtype=float,
    )
    league_rates = np.array(
        [
            baseline.workload_p96[key] if baseline else model.league_rate(key)
            for key in component_keys
        ],
        dtype=float,
    )

    rng = np.random.default_rng(settings.seed)
    records: list[dict[str, Any]] = []
    z = _normal_quantile(settings.upper_quantile)

    grouped = matches.groupby("player_id", sort=True)
    centres = season_frame.set_index("player_id")[f"adj_{TOTAL_KEY}_p96"].to_dict()
    eligible = set(season_frame["player_id"])

    for player_id, group in grouped:
        if player_id not in eligible:
            continue
        n_matches = len(group)
        if n_matches < settings.min_matches:
            continue

        minutes = group["minutes"].to_numpy(dtype=float)
        # (matches x components) matrices of Goals Added and opportunities.
        values = np.column_stack(
            [np.nan_to_num(group[f"ga_{key}"].to_numpy(dtype=float), nan=0.0) for key in component_keys]
        )
        counts = np.column_stack(
            [np.nan_to_num(group[f"opp_{key}"].to_numpy(dtype=float), nan=0.0) for key in component_keys]
        )

        # Draw resample indices once, then aggregate with matrix products.
        picks = rng.integers(0, n_matches, size=(settings.resamples, n_matches))
        multiplicity = _one_hot_counts(picks, n_matches)
        total_minutes = multiplicity @ minutes
        summed_values = multiplicity @ values
        summed_counts = multiplicity @ counts

        valid = total_minutes > 0
        if not valid.any():
            continue

        with np.errstate(divide="ignore", invalid="ignore"):
            observed_total = np.nansum(summed_values, axis=1) / total_minutes * basis

            # The shrunk resample is retained only as a diagnostic of how the
            # published figure moves; the interval itself comes from the
            # posterior, for the reason set out in the module docstring.
            per_opportunity = np.where(summed_counts > 0, summed_values / summed_counts, np.nan)
            weight = summed_counts / (summed_counts + ks)
            adjusted_value = np.where(
                np.isfinite(per_opportunity), mus + weight * (per_opportunity - mus), mus
            )
            opportunities_p96 = summed_counts / total_minutes[:, None] * basis
            workload_weight = total_minutes[:, None] / (total_minutes[:, None] + volume_ks)
            adjusted_opportunities_p96 = league_rates + workload_weight * (
                opportunities_p96 - league_rates
            )
            _ = np.nansum(adjusted_value * adjusted_opportunities_p96, axis=1)

        sample = observed_total[valid & np.isfinite(observed_total)]
        if sample.size < 2:
            continue

        observed_low, observed_high = np.quantile(
            sample, [settings.lower_quantile, settings.upper_quantile]
        )
        sampling_variance = float(np.var(sample, ddof=1))
        centre = centres.get(player_id, float("nan"))

        if talent_variance > 0 and sampling_variance >= 0 and np.isfinite(centre):
            reliability = talent_variance / (talent_variance + sampling_variance)
            posterior_sd = float(np.sqrt(max((1.0 - reliability) * talent_variance, 0.0)))
            adjusted_low = float(centre - z * posterior_sd)
            adjusted_high = float(centre + z * posterior_sd)
        else:
            reliability = float("nan")
            posterior_sd = float("nan")
            adjusted_low = float("nan")
            adjusted_high = float("nan")

        records.append(
            {
                "player_id": player_id,
                "adj_total_p96_low": adjusted_low,
                "adj_total_p96_high": adjusted_high,
                "adj_total_p96_se": posterior_sd,
                "observed_total_p96_low": float(observed_low),
                "observed_total_p96_high": float(observed_high),
                "observed_total_p96_se": float(np.sqrt(sampling_variance)),
                "bootstrap_reliability": float(reliability),
                "bootstrap_resamples": int(sample.size),
            }
        )

    LOG.info("Bootstrapped %d goalkeepers with %d resamples each", len(records), settings.resamples)
    return pd.DataFrame(records, columns=columns)


def _one_hot_counts(picks: np.ndarray, n_matches: int) -> np.ndarray:
    """Turn resample indices into a (resamples x matches) multiplicity matrix."""
    resamples = picks.shape[0]
    counts = np.zeros((resamples, n_matches), dtype=float)
    rows = np.repeat(np.arange(resamples), picks.shape[1])
    np.add.at(counts, (rows, picks.ravel()), 1.0)
    return counts


def talent_interval(
    talent: pd.DataFrame, settings: BootstrapSettings
) -> pd.DataFrame:
    """Normal interval for the current-talent estimate from its posterior SD.

    The posterior of a normal-normal update is itself normal, so an analytic
    interval is exact here and no resampling is required.
    """
    z = float(_normal_quantile(settings.upper_quantile))
    frame = talent.copy()
    frame["talent_total_p96_low"] = frame["talent_total_p96"] - z * frame["talent_posterior_sd"]
    frame["talent_total_p96_high"] = frame["talent_total_p96"] + z * frame["talent_posterior_sd"]
    return frame


def _normal_quantile(p: float) -> float:
    """Inverse standard normal CDF (Acklam's rational approximation).

    Implemented here so the pipeline does not need SciPy for a single value.
    Accurate to about 1e-9, far beyond the precision the site displays.
    """
    if not 0.0 < p < 1.0:
        raise ValueError(f"Quantile must lie strictly between 0 and 1, received {p}")
    a = [-3.969683028665376e01, 2.209460984245205e02, -2.759285104469687e02,
         1.383577518672690e02, -3.066479806614716e01, 2.506628277459239e00]
    b = [-5.447609879822406e01, 1.615858368580409e02, -1.556989798598866e02,
         6.680131188771972e01, -1.328068155288572e01]
    c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e00,
         -2.549732539343734e00, 4.374664141464968e00, 2.938163982698783e00]
    d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e00,
         3.754408661907416e00]
    plow, phigh = 0.02425, 1 - 0.02425
    if p < plow:
        q = float(np.sqrt(-2 * np.log(p)))
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    if p > phigh:
        q = float(np.sqrt(-2 * np.log(1 - p)))
        return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1
        )
    q = p - 0.5
    r = q * q
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (
        ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1
    )
