"""Empirical-Bayes reliability estimation.

The unit of evidence
--------------------
A goalkeeper's Goals Added for a component is the sum of the value of the
individual actions he took::

    G = v_1 + v_2 + ... + v_n

so the natural quantity to regress toward the mean is the **value per
opportunity**, ``g = G / n``. Its sampling variance is exactly ``s^2 / n``,
which makes the empirical-Bayes weight the familiar::

    reliability = tau^2 / (tau^2 + s^2 / n) = n / (n + k),  k = s^2 / tau^2

``n`` is the number of opportunities the goalkeeper actually had for that
component (shots faced on target, claim attempts, passes attempted, ...), and
``k`` is estimated from data rather than chosen by hand:

* ``s^2`` — the per-opportunity value variance — from within-goalkeeper,
  match-to-match variation.
* ``tau^2`` — the spread of true per-opportunity ability across goalkeepers —
  from between-goalkeeper season variation, net of the sampling noise implied
  by ``s^2``.

Shrinking the *rate per 96 minutes* directly would be wrong here, because
match-level opportunity counts do not scale with minutes played: every start is
about 90 minutes but may contain one shot or ten. Working per opportunity keeps
the noise model exact.

Converting back to a per-96 rate
--------------------------------
::

    adjusted_p96 = adjusted_per_opportunity * opportunities_per_96

Because volume is kept as observed and only the per-action quality is
regressed, a goalkeeper is shrunk toward *what an average MLS goalkeeper would
have produced with his workload*, not toward a global average unrelated to the
defence in front of him.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd

from .config import Config
from .logging_utils import get_logger
from .rates import TOTAL_KEY

LOG = get_logger("reliability")

MIN_MINUTES_FOR_ESTIMATION = 180.0
MIN_SEASON_OPPORTUNITIES = 5


@dataclass
class ComponentReliability:
    """Estimated shrinkage parameters and diagnostics for one component."""

    component: str
    k: float
    source: str
    per_opportunity_variance: float | None
    talent_variance: float | None
    league_mean_per_opportunity: float
    n_players: int
    n_matches: int
    median_opportunities: float | None
    reliability_at_median: float | None
    split_half_correlation: float | None
    spearman_brown_reliability: float | None
    year_over_year_correlation: float | None
    drift_variance: float
    drift_source: str
    note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class VolumeReliability:
    """Shrinkage parameters for a component's per-96 opportunity rate.

    Opportunity counts *do* grow with minutes played, so the observed rate
    ``96 n / minutes`` has sampling variance of the form ``v^2 / minutes`` and
    the reliability weight is ``minutes / (minutes + k)`` with ``k`` in minutes.
    """

    component: str
    k_minutes: float
    source: str
    sampling_variance: float | None
    talent_variance: float | None
    league_rate_p96: float
    n_players: int
    reliability_at_900_minutes: float | None
    note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TotalReliability:
    """Variance components for Total G+ per 96, used by the talent model."""

    talent_variance: float
    drift_variance: float
    drift_source: str
    source: str
    note: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class ReliabilityModel:
    components: dict[str, ComponentReliability]
    volumes: dict[str, VolumeReliability]
    total: TotalReliability
    seasons_used: list[int]
    volume_shrinkage_enabled: bool

    def k(self, component: str) -> float:
        return self.components[component].k

    def league_mean(self, component: str) -> float:
        return self.components[component].league_mean_per_opportunity

    def volume_k(self, component: str) -> float:
        return self.volumes[component].k_minutes

    def league_rate(self, component: str) -> float:
        return self.volumes[component].league_rate_p96

    def to_dict(self) -> dict[str, Any]:
        return {
            "components": {key: value.to_dict() for key, value in self.components.items()},
            "volumes": {key: value.to_dict() for key, value in self.volumes.items()},
            "total": self.total.to_dict(),
            "seasons_used": self.seasons_used,
            "volume_shrinkage_enabled": self.volume_shrinkage_enabled,
        }


# ---------------------------------------------------------------------------
# Estimators
# ---------------------------------------------------------------------------


def _weighted_mean(values: np.ndarray, weights: np.ndarray) -> float:
    total = float(weights.sum())
    if total <= 0:
        return float("nan")
    return float((values * weights).sum() / total)


def estimate_per_opportunity_variance(
    matches: pd.DataFrame, component: str, min_matches: int
) -> tuple[float | None, int, int]:
    """Within-goalkeeper variance of a single action's value.

    For player ``i`` with per-opportunity mean ``g_i``, the match residual
    ``G_ij - n_ij * g_i`` has variance ``n_ij * s^2``, so dividing the squared
    residual by ``n_ij`` gives an unbiased contribution to ``s^2``.
    """
    ga_col = f"ga_{component}"
    opp_col = f"opp_{component}"
    usable = matches.dropna(subset=[ga_col, opp_col])
    usable = usable[usable[opp_col] > 0]
    if usable.empty:
        return None, 0, 0

    numerator = 0.0
    denominator = 0
    players = 0
    used_matches = 0
    for _, group in usable.groupby(["player_id", "season"], sort=True):
        totals = group[ga_col].to_numpy(dtype=float)
        counts = group[opp_col].to_numpy(dtype=float)
        if len(group) < min_matches or counts.sum() <= 0:
            continue
        per_opportunity_mean = totals.sum() / counts.sum()
        residuals = totals - counts * per_opportunity_mean
        numerator += float((residuals**2 / counts).sum())
        denominator += len(group) - 1
        players += 1
        used_matches += len(group)

    if denominator <= 0 or numerator <= 0:
        return None, players, used_matches
    return numerator / denominator, players, used_matches


def estimate_talent_variance(
    seasons: pd.DataFrame, component: str, per_opportunity_variance: float
) -> tuple[float | None, float, int]:
    """Between-goalkeeper variance of true per-opportunity ability.

    Returns ``(tau2, league_mean_per_opportunity, n_used)``.
    """
    ga_col = f"ga_{component}"
    opp_col = f"opp_{component}"
    usable = seasons.dropna(subset=[ga_col, opp_col])
    usable = usable[
        (usable["minutes"] >= MIN_MINUTES_FOR_ESTIMATION)
        & (usable[opp_col] >= MIN_SEASON_OPPORTUNITIES)
    ]
    if len(usable) < 2:
        return None, 0.0, len(usable)

    counts = usable[opp_col].to_numpy(dtype=float)
    values = usable[ga_col].to_numpy(dtype=float) / counts
    weights = counts
    weight_sum = float(weights.sum())
    mean = _weighted_mean(values, weights)
    observed_variance = float((weights * (values - mean) ** 2).sum() / weight_sum)

    # Correct for having estimated the mean from the same weighted sample.
    correction = 1.0 - float((weights**2).sum()) / (weight_sum**2)
    if correction <= 0:
        return None, mean, len(usable)

    expected_noise = float(
        (weights * (per_opportunity_variance / counts)).sum() / weight_sum
    )
    tau2 = (observed_variance - expected_noise) / correction
    return tau2, mean, len(usable)


def league_mean_per_opportunity(seasons: pd.DataFrame, component: str) -> float:
    """Opportunity-weighted league mean value per action."""
    ga_col = f"ga_{component}"
    opp_col = f"opp_{component}"
    usable = seasons.dropna(subset=[ga_col, opp_col])
    usable = usable[usable[opp_col] > 0]
    if usable.empty:
        return 0.0
    total_value = float(usable[ga_col].sum())
    total_opportunities = float(usable[opp_col].sum())
    if total_opportunities <= 0:
        return 0.0
    return total_value / total_opportunities


def split_half_correlation(
    matches: pd.DataFrame, component: str, min_matches: int
) -> float | None:
    """Odd/even match split-half correlation of per-opportunity value."""
    ga_col = f"ga_{component}"
    opp_col = f"opp_{component}"
    usable = matches.dropna(subset=[ga_col, opp_col])
    if usable.empty:
        return None

    first: list[float] = []
    second: list[float] = []
    for _, group in usable.groupby(["player_id", "season"], sort=True):
        ordered = group.sort_values(["date_utc", "game_id"], kind="stable")
        if len(ordered) < max(min_matches * 2, 6):
            continue
        odd = ordered.iloc[::2]
        even = ordered.iloc[1::2]
        odd_opportunities = float(odd[opp_col].sum())
        even_opportunities = float(even[opp_col].sum())
        if odd_opportunities <= 0 or even_opportunities <= 0:
            continue
        first.append(float(odd[ga_col].sum()) / odd_opportunities)
        second.append(float(even[ga_col].sum()) / even_opportunities)

    if len(first) < 10:
        return None
    matrix = np.corrcoef(np.asarray(first), np.asarray(second))
    value = float(matrix[0, 1])
    return value if np.isfinite(value) else None


def year_over_year_correlation(seasons: pd.DataFrame, component: str) -> float | None:
    """Season-to-season correlation of per-opportunity value for regular starters."""
    ga_col = f"ga_{component}"
    opp_col = f"opp_{component}"
    usable = seasons.dropna(subset=[ga_col, opp_col])
    usable = usable[(usable["minutes"] >= 900) & (usable[opp_col] > 0)].copy()
    if usable.empty:
        return None
    usable["value"] = usable[ga_col] / usable[opp_col]
    indexed = usable.set_index(["player_id", "season"])["value"]
    pairs_x: list[float] = []
    pairs_y: list[float] = []
    for (player_id, season), value in indexed.items():
        following = (player_id, season + 1)
        if following in indexed.index:
            pairs_x.append(float(value))
            pairs_y.append(float(indexed.loc[following]))
    if len(pairs_x) < 10:
        return None
    matrix = np.corrcoef(np.asarray(pairs_x), np.asarray(pairs_y))
    value = float(matrix[0, 1])
    return value if np.isfinite(value) else None


def estimate_drift_variance(
    seasons: pd.DataFrame,
    component: str,
    per_opportunity_variance: float | None,
    talent_variance: float | None,
    cfg: Config,
) -> tuple[float, str]:
    """Year-over-year drift in true ability, for the current-talent model.

    ``Var(g_{t+1} - g_t) = delta^2 + s^2/n_t + s^2/n_{t+1}``.
    """
    min_share = float(cfg.section("talent", "drift", "min_drift_share_of_tau2"))
    fallback_share = float(cfg.section("talent", "drift", "fallback_drift_share_of_tau2"))
    if talent_variance is None or talent_variance <= 0:
        return 0.0, "unavailable"
    if per_opportunity_variance is None or per_opportunity_variance <= 0:
        return talent_variance * fallback_share, "fallback_share_of_talent_variance"

    ga_col = f"ga_{component}"
    opp_col = f"opp_{component}"
    usable = seasons.dropna(subset=[ga_col, opp_col])
    usable = usable[(usable["minutes"] >= 450) & (usable[opp_col] >= MIN_SEASON_OPPORTUNITIES)].copy()
    if usable.empty:
        return talent_variance * fallback_share, "fallback_share_of_talent_variance"
    usable["value"] = usable[ga_col] / usable[opp_col]
    indexed = usable.set_index(["player_id", "season"])[["value", opp_col]]

    diffs: list[float] = []
    noise: list[float] = []
    for (player_id, season), row in indexed.iterrows():
        following_key = (player_id, season + 1)
        if following_key not in indexed.index:
            continue
        following = indexed.loc[following_key]
        diffs.append(float(following["value"]) - float(row["value"]))
        noise.append(
            per_opportunity_variance / float(row[opp_col])
            + per_opportunity_variance / float(following[opp_col])
        )

    if len(diffs) < 10:
        return talent_variance * fallback_share, "fallback_share_of_talent_variance"

    difference_variance = float(np.var(np.asarray(diffs), ddof=1))
    delta2 = difference_variance - float(np.mean(noise))
    floor = talent_variance * min_share
    if delta2 < floor:
        return floor, "clamped_to_floor"
    if delta2 > talent_variance:
        # Drift cannot plausibly exceed the entire between-goalkeeper spread.
        return talent_variance, "clamped_to_talent_variance"
    return delta2, "empirical"


def estimate_volume_reliability(
    cfg: Config, seasons: pd.DataFrame, matches: pd.DataFrame, component: str, basis: int
) -> VolumeReliability:
    """Variance components for a component's per-96 opportunity rate."""
    settings = cfg.section("volume_reliability", "estimation")
    min_matches = int(settings["min_matches_per_player"])
    min_players = int(settings["min_players"])
    min_k = float(settings["min_k"])
    max_k = float(settings["max_k"])
    fallback = float(cfg.section("volume_reliability", "fallback_k_minutes")[component])

    opp_col = f"opp_{component}"
    league_rate = _league_opportunity_rate(seasons, opp_col, basis)

    sampling: float | None = None
    n_players = 0
    if not matches.empty:
        usable = matches.dropna(subset=[opp_col])
        usable = usable[usable["minutes"] > 0]
        numerator = 0.0
        denominator = 0
        for _, group in usable.groupby(["player_id", "season"], sort=True):
            minutes = group["minutes"].to_numpy(dtype=float)
            counts = group[opp_col].to_numpy(dtype=float)
            if len(group) < min_matches or minutes.sum() <= 0:
                continue
            rates = counts / minutes * basis
            mean = _weighted_mean(rates, minutes)
            if not np.isfinite(mean):
                continue
            numerator += float((minutes * (rates - mean) ** 2).sum())
            denominator += len(group) - 1
            n_players += 1
        if denominator > 0 and numerator > 0:
            sampling = numerator / denominator

    talent: float | None = None
    if sampling is not None and sampling > 0:
        pool = seasons.dropna(subset=[opp_col])
        pool = pool[pool["minutes"] >= MIN_MINUTES_FOR_ESTIMATION]
        if len(pool) >= 2:
            minutes = pool["minutes"].to_numpy(dtype=float)
            rates = pool[opp_col].to_numpy(dtype=float) / minutes * basis
            weight_sum = float(minutes.sum())
            mean = _weighted_mean(rates, minutes)
            observed = float((minutes * (rates - mean) ** 2).sum() / weight_sum)
            correction = 1.0 - float((minutes**2).sum()) / (weight_sum**2)
            expected_noise = float((minutes * (sampling / minutes)).sum() / weight_sum)
            if correction > 0:
                talent = (observed - expected_noise) / correction

    if sampling is None or sampling <= 0:
        k, source = fallback, "fallback"
        note = "Match-level workload variation was insufficient; the configured constant is used."
    elif talent is None or talent <= 0:
        k, source = fallback, "fallback"
        note = (
            "Workload differences between goalkeepers were indistinguishable from sampling "
            "noise; the configured constant is used."
        )
    elif n_players < min_players:
        k, source = fallback, "fallback"
        note = (
            f"Only {n_players} goalkeepers met the match minimum, below the required "
            f"{min_players}; the configured constant is used."
        )
    else:
        candidate = sampling / talent
        if not np.isfinite(candidate) or candidate < min_k or candidate > max_k:
            k, source = fallback, "fallback"
            note = (
                f"The empirical estimate ({candidate:.0f} minutes) fell outside the plausible "
                f"range [{min_k:g}, {max_k:g}] and was replaced by the configured constant."
            )
        else:
            k, source = candidate, "empirical"
            note = (
                "Estimated as sampling variance divided by between-goalkeeper variance of the "
                "per-96 workload rate."
            )

    return VolumeReliability(
        component=component,
        k_minutes=float(k),
        source=source,
        sampling_variance=None if sampling is None else float(sampling),
        talent_variance=None if talent is None else float(talent),
        league_rate_p96=float(league_rate),
        n_players=n_players,
        reliability_at_900_minutes=float(900.0 / (900.0 + k)) if (900.0 + k) > 0 else None,
        note=note,
    )


def _league_opportunity_rate(seasons: pd.DataFrame, opp_col: str, basis: int) -> float:
    """Minutes-weighted league mean opportunity rate per 96 minutes."""
    usable = seasons.dropna(subset=[opp_col])
    usable = usable[usable["minutes"] > 0]
    if usable.empty:
        return 0.0
    total_minutes = float(usable["minutes"].sum())
    if total_minutes <= 0:
        return 0.0
    return float(usable[opp_col].sum()) / total_minutes * basis


def _estimate_total(
    cfg: Config,
    seasons: pd.DataFrame,
    components: dict[str, ComponentReliability],
) -> TotalReliability:
    """Variance components for Total G+ per 96.

    Under independence across components the sampling variance of a
    goalkeeper's observed Total per 96 is::

        Var = (96 / minutes)^2 * sum_c n_c * s_c^2
    """
    basis = cfg.minutes_basis
    usable = seasons[seasons["minutes"] >= MIN_MINUTES_FOR_ESTIMATION].copy()
    usable = usable.dropna(subset=[f"ga_{TOTAL_KEY}_p96"])
    variances = {
        key: components[key].per_opportunity_variance
        for key in cfg.component_keys
        if components[key].per_opportunity_variance is not None
    }
    if len(usable) < 5 or len(variances) < len(cfg.component_keys):
        return TotalReliability(
            talent_variance=0.0,
            drift_variance=0.0,
            drift_source="unavailable",
            source="unavailable",
            note=(
                "Total G+ variance components could not be estimated because one or more "
                "component variances were unavailable."
            ),
        )

    noise = np.zeros(len(usable), dtype=float)
    for key, variance in variances.items():
        counts = usable[f"opp_{key}"].fillna(0.0).to_numpy(dtype=float)
        noise += counts * float(variance)
    minutes = usable["minutes"].to_numpy(dtype=float)
    noise = (basis / minutes) ** 2 * noise

    values = usable[f"ga_{TOTAL_KEY}_p96"].to_numpy(dtype=float)
    weights = 1.0 / np.where(noise > 0, noise, np.nan)
    finite = np.isfinite(values) & np.isfinite(weights)
    values, weights, noise = values[finite], weights[finite], noise[finite]
    if len(values) < 5:
        return TotalReliability(
            talent_variance=0.0,
            drift_variance=0.0,
            drift_source="unavailable",
            source="unavailable",
            note="Too few goalkeeper-seasons had a complete Total G+ and noise estimate.",
        )

    weight_sum = float(weights.sum())
    mean = float((values * weights).sum() / weight_sum)
    observed_variance = float((weights * (values - mean) ** 2).sum() / weight_sum)
    correction = 1.0 - float((weights**2).sum()) / (weight_sum**2)
    expected_noise = float((weights * noise).sum() / weight_sum)
    tau2 = (observed_variance - expected_noise) / correction if correction > 0 else -1.0

    if tau2 <= 0:
        # Fall back to the component decomposition: the talent variance of a sum
        # of independent component talents is the sum of their variances,
        # translated from per-opportunity units into per-96 units.
        median_minutes = float(np.median(usable["minutes"]))
        derived = 0.0
        for key in cfg.component_keys:
            component = components[key]
            if component.talent_variance is None or component.talent_variance <= 0:
                continue
            median_opportunities = float(usable[f"opp_{key}"].median() or 0.0)
            scale = (basis * median_opportunities / max(median_minutes, 1.0)) ** 2
            derived += component.talent_variance * scale
        if derived <= 0:
            return TotalReliability(
                talent_variance=0.0,
                drift_variance=0.0,
                drift_source="unavailable",
                source="unavailable",
                note="Neither the direct nor the component-derived Total talent variance was positive.",
            )
        return TotalReliability(
            talent_variance=derived,
            drift_variance=derived
            * float(cfg.section("talent", "drift", "fallback_drift_share_of_tau2")),
            drift_source="fallback_share_of_talent_variance",
            source="component_derived",
            note=(
                "The direct moment estimate of Total talent variance was not positive, so it "
                "was rebuilt as the sum of the component talent variances scaled to per-96 units."
            ),
        )

    drift_share = float(cfg.section("talent", "drift", "min_drift_share_of_tau2"))
    return TotalReliability(
        talent_variance=float(tau2),
        drift_variance=float(tau2 * drift_share),
        drift_source="share_of_talent_variance",
        source="empirical",
        note=(
            "Estimated by the method of moments on Total G+ per 96 using precision weights "
            "derived from the component per-opportunity variances."
        ),
    )


def estimate_reliability(
    cfg: Config, seasons: pd.DataFrame, matches: pd.DataFrame
) -> ReliabilityModel:
    """Estimate shrinkage constants and drift variances for every component."""
    estimation = cfg.section("reliability", "estimation")
    min_matches = int(estimation["min_matches_per_player"])
    min_players = int(estimation["min_players"])
    min_k = float(estimation["min_k"])
    max_k = float(estimation["max_k"])
    fallbacks = cfg.section("reliability", "fallback_k")

    history = sorted(set(cfg.history_seasons) & set(seasons["season"].unique()))
    season_pool = seasons[seasons["season"].isin(history)].copy()
    match_pool = (
        matches[matches["season"].isin(history)].copy() if not matches.empty else pd.DataFrame()
    )

    components: dict[str, ComponentReliability] = {}

    for key in cfg.component_keys:
        variance: float | None = None
        n_players = 0
        n_matches = 0
        if not match_pool.empty:
            variance, n_players, n_matches = estimate_per_opportunity_variance(
                match_pool, key, min_matches
            )

        tau2: float | None = None
        mean_value = league_mean_per_opportunity(season_pool, key)
        if variance is not None and variance > 0:
            tau2, mean_value, _ = estimate_talent_variance(season_pool, key, variance)

        median_opportunities = float(
            season_pool.loc[season_pool["minutes"] >= 900, f"opp_{key}"].median()
        )

        fallback_k = float(fallbacks[key])
        half_correlation = (
            split_half_correlation(match_pool, key, min_matches) if not match_pool.empty else None
        )
        # Tiny negative correlations (e.g. -0.0016) should serialize/display as 0.00,
        # not -0.00.
        if half_correlation is not None and abs(half_correlation) < 5e-3:
            half_correlation = 0.0

        min_split_half = float(estimation.get("min_split_half_correlation", 0.05))
        empirical_candidate: float | None = None

        if variance is None or variance <= 0:
            k, source = fallback_k, "fallback"
            note = (
                "Match-level variation was insufficient to estimate the per-opportunity "
                "variance, so the conservative constant from pipeline/config/keeperiq.yml is used."
            )
        elif tau2 is None or tau2 <= 0:
            k, source = fallback_k, "fallback"
            note = (
                "The estimated between-goalkeeper variance was not positive: at these sample "
                "sizes this component's spread is indistinguishable from sampling noise. The "
                "conservative constant from configuration is used, which regresses heavily. "
                "Any non-zero reliability-at-median figure for this component is therefore a "
                "configuration weight, not evidence of repeatable skill."
            )
        elif n_players < min_players:
            k, source = fallback_k, "fallback"
            note = (
                f"Only {n_players} goalkeepers met the {min_matches}-match minimum, below the "
                f"required {min_players}; the configured constant is used instead."
            )
        else:
            candidate = variance / tau2
            empirical_candidate = float(candidate)
            if not np.isfinite(candidate) or candidate < min_k or candidate > max_k:
                k, source = fallback_k, "fallback"
                note = (
                    f"The empirical estimate ({candidate:.1f}) fell outside the plausible range "
                    f"[{min_k:g}, {max_k:g}] and was replaced by the configured constant."
                )
            else:
                k, source = candidate, "empirical"
                note = (
                    "Estimated as s^2 / tau^2 from match-level per-opportunity variance and "
                    f"between-goalkeeper season variance over {history[0]}-{history[-1]}."
                )

        # Reject empirical k when within-season repeatability is essentially zero.
        # A tiny positive tau^2 can invent a finite k even when odd/even match halves
        # do not agree (fielding is the usual case: rare high-magnitude events).
        if source == "empirical" and (
            half_correlation is None or half_correlation < min_split_half
        ):
            rejected = empirical_candidate if empirical_candidate is not None else k
            split_text = (
                "unavailable"
                if half_correlation is None
                else f"{half_correlation:.3f}"
            )
            k, source = fallback_k, "fallback"
            note = (
                f"Empirical k ({rejected:.1f}) was rejected because the split-half correlation "
                f"({split_text}) is below the minimum {min_split_half:.2f}, indicating "
                "essentially no within-season repeatability. The conservative configured "
                "constant is used instead; reliability-at-median is therefore a configuration "
                "weight, not evidence that the component is that reliable."
            )

        drift, drift_source = estimate_drift_variance(season_pool, key, variance, tau2, cfg)
        # Spearman-Brown steps a half-sample correlation up to a full-sample
        # reliability, giving an independent check on n / (n + k).
        spearman_brown = (
            float(2 * half_correlation / (1 + half_correlation))
            if half_correlation is not None and half_correlation > -1
            else None
        )

        components[key] = ComponentReliability(
            component=key,
            k=float(k),
            source=source,
            per_opportunity_variance=None if variance is None else float(variance),
            talent_variance=None if tau2 is None else float(tau2),
            league_mean_per_opportunity=float(mean_value),
            n_players=n_players,
            n_matches=n_matches,
            median_opportunities=median_opportunities,
            reliability_at_median=(
                float(median_opportunities / (median_opportunities + k))
                if np.isfinite(median_opportunities) and (median_opportunities + k) > 0
                else None
            ),
            split_half_correlation=half_correlation,
            spearman_brown_reliability=spearman_brown,
            year_over_year_correlation=year_over_year_correlation(season_pool, key),
            drift_variance=float(drift),
            drift_source=drift_source,
            note=note,
        )

        LOG.info(
            "%-14s k=%8.1f (%-9s) s2=%-10s tau2=%-11s rel@median(%d)=%s",
            key,
            components[key].k,
            source,
            "n/a" if variance is None else f"{variance:.5f}",
            "n/a" if tau2 is None else f"{tau2:.7f}",
            int(median_opportunities) if np.isfinite(median_opportunities) else 0,
            (
                "n/a"
                if components[key].reliability_at_median is None
                else f"{components[key].reliability_at_median:.2f}"
            ),
        )

    volume_enabled = bool(cfg.section("volume_reliability")["enabled"])
    volumes: dict[str, VolumeReliability] = {}
    for key in cfg.component_keys:
        volume = estimate_volume_reliability(cfg, season_pool, match_pool, key, cfg.minutes_basis)
        if not volume_enabled:
            volume = VolumeReliability(
                component=key,
                k_minutes=0.0,
                source="disabled",
                sampling_variance=volume.sampling_variance,
                talent_variance=volume.talent_variance,
                league_rate_p96=volume.league_rate_p96,
                n_players=volume.n_players,
                reliability_at_900_minutes=1.0,
                note="Workload shrinkage is disabled in configuration; rates are used as observed.",
            )
        volumes[key] = volume
        LOG.info(
            "%-14s workload k=%7.0f min (%-9s) league_rate=%6.2f/96 rel@900=%s",
            key,
            volume.k_minutes,
            volume.source,
            volume.league_rate_p96,
            "n/a"
            if volume.reliability_at_900_minutes is None
            else f"{volume.reliability_at_900_minutes:.2f}",
        )

    total = _estimate_total(cfg, season_pool, components)
    LOG.info(
        "total          talent_var=%.5f drift_var=%.5f (%s)",
        total.talent_variance,
        total.drift_variance,
        total.source,
    )
    return ReliabilityModel(
        components=components,
        volumes=volumes,
        total=total,
        seasons_used=history,
        volume_shrinkage_enabled=volume_enabled,
    )


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------


@dataclass
class LeagueBaseline:
    """The "average MLS goalkeeper" a season's ratings are regressed toward.

    Shrinkage constants are estimated once from history, but the *target* of the
    regression is season-specific: it is the average qualified goalkeeper in the
    season being displayed. That keeps a no-information goalkeeper at the centre
    of the distribution he is ranked against instead of at a historical average
    the league may have drifted away from.
    """

    season: int
    value_per_opportunity: dict[str, float]
    workload_p96: dict[str, float]
    pool_size: int
    pool_statuses: list[str]
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "season": self.season,
            "value_per_opportunity": {k: round(v, 6) for k, v in self.value_per_opportunity.items()},
            "workload_p96": {k: round(v, 3) for k, v in self.workload_p96.items()},
            "pool_size": self.pool_size,
            "pool_statuses": self.pool_statuses,
            "source": self.source,
        }


def build_league_baseline(
    cfg: Config,
    seasons: pd.DataFrame,
    model: ReliabilityModel,
    *,
    season: int,
    pool_mask: pd.Series,
    pool_statuses: list[str],
    min_pool_size: int = 12,
) -> LeagueBaseline:
    """Compute the season's regression target from its reference pool."""
    pool = seasons[pool_mask]
    if len(pool) < min_pool_size:
        return LeagueBaseline(
            season=season,
            value_per_opportunity={key: model.league_mean(key) for key in cfg.component_keys},
            workload_p96={key: model.league_rate(key) for key in cfg.component_keys},
            pool_size=len(pool),
            pool_statuses=pool_statuses,
            source="historical_pool",
        )
    return LeagueBaseline(
        season=season,
        value_per_opportunity={
            key: league_mean_per_opportunity(pool, key) for key in cfg.component_keys
        },
        workload_p96={
            key: _league_opportunity_rate(pool, f"opp_{key}", cfg.minutes_basis)
            for key in cfg.component_keys
        },
        pool_size=len(pool),
        pool_statuses=pool_statuses,
        source="season_reference_pool",
    )


def reliability_weight(opportunities: pd.Series | np.ndarray, k: float) -> np.ndarray:
    """``n / (n + k)``, with no opportunities meaning zero reliability."""
    n = np.nan_to_num(np.asarray(opportunities, dtype=float), nan=0.0)
    n = np.clip(n, 0.0, None)
    return n / (n + k)


def apply_shrinkage(
    cfg: Config,
    frame: pd.DataFrame,
    model: ReliabilityModel,
    baseline: LeagueBaseline | None = None,
) -> pd.DataFrame:
    """Add reliability weights and adjusted per-96 rates for every component.

    ``adjusted_p96 = [mu + w * (g - mu)] * adjusted_opportunities_per_96`` where
    ``g`` is the goalkeeper's observed value per opportunity and ``mu`` the
    league mean value per opportunity. Equivalently the observed rate is blended
    with the rate an average goalkeeper would have posted on the same workload.

    The workload itself is also an estimate, so it is regressed toward the
    league workload with a minutes-based weight. Without that step a goalkeeper
    with twenty minutes keeps a wildly extrapolated workload and never returns
    to the league average even after his quality has been fully regressed.
    """
    frame = frame.copy()
    basis = cfg.minutes_basis
    minutes = frame["minutes"].astype(float)
    safe_minutes = minutes.where(minutes > 0)

    adjusted_total = np.zeros(len(frame), dtype=float)
    baseline_total = np.zeros(len(frame), dtype=float)
    has_all = np.ones(len(frame), dtype=bool)

    for key in cfg.component_keys:
        k = model.k(key)
        mu = baseline.value_per_opportunity[key] if baseline else model.league_mean(key)
        league_rate = baseline.workload_p96[key] if baseline else model.league_rate(key)
        opportunities = frame[f"opp_{key}"].astype(float)
        weight = reliability_weight(opportunities, k)
        observed_value = np.where(
            opportunities.to_numpy() > 0,
            frame[f"ga_{key}"].to_numpy(dtype=float)
            / np.where(opportunities.to_numpy() > 0, opportunities.to_numpy(), 1.0),
            np.nan,
        )
        adjusted_value = np.where(
            np.isfinite(observed_value), mu + weight * (observed_value - mu), mu
        )
        opportunities_p96 = (opportunities / safe_minutes * basis).to_numpy(dtype=float)
        adjusted_opportunities_p96 = _shrink_workload(
            opportunities_p96, minutes.to_numpy(dtype=float), model.volume_k(key), league_rate
        )

        adjusted_p96 = adjusted_value * adjusted_opportunities_p96
        baseline_p96 = mu * adjusted_opportunities_p96

        frame[f"reliability_{key}"] = weight
        frame[f"workload_reliability_{key}"] = minutes.to_numpy(dtype=float) / (
            minutes.to_numpy(dtype=float) + model.volume_k(key)
        )
        frame[f"value_per_opportunity_{key}"] = observed_value
        frame[f"adj_opp_{key}_p96"] = adjusted_opportunities_p96
        frame[f"adj_{key}_p96"] = adjusted_p96
        frame[f"baseline_{key}_p96"] = baseline_p96

        component_present = np.isfinite(adjusted_p96)
        has_all &= component_present
        adjusted_total += np.nan_to_num(adjusted_p96, nan=0.0)
        baseline_total += np.nan_to_num(baseline_p96, nan=0.0)

    frame[f"adj_{TOTAL_KEY}_p96"] = np.where(has_all, adjusted_total, np.nan)
    frame[f"baseline_{TOTAL_KEY}_p96"] = np.where(has_all, baseline_total, np.nan)

    frame["sampling_variance_total_p96"] = _total_sampling_variance(cfg, frame, model)
    talent_variance = model.total.talent_variance
    if talent_variance > 0:
        frame[f"reliability_{TOTAL_KEY}"] = talent_variance / (
            talent_variance + frame["sampling_variance_total_p96"]
        )
    else:
        frame[f"reliability_{TOTAL_KEY}"] = np.nan
    return frame


def _shrink_workload(
    observed_rate_p96: np.ndarray, minutes: np.ndarray, k: float, league_rate: float
) -> np.ndarray:
    """``league_rate + minutes / (minutes + k) * (observed_rate - league_rate)``."""
    if k <= 0:
        return np.where(np.isfinite(observed_rate_p96), observed_rate_p96, league_rate)
    safe_minutes = np.clip(np.nan_to_num(minutes, nan=0.0), 0.0, None)
    weight = safe_minutes / (safe_minutes + k)
    centred = np.where(np.isfinite(observed_rate_p96), observed_rate_p96 - league_rate, 0.0)
    return league_rate + weight * centred


def _total_sampling_variance(
    cfg: Config, frame: pd.DataFrame, model: ReliabilityModel
) -> np.ndarray:
    """``(96 / minutes)^2 * sum_c n_c * s_c^2`` — the noise in observed Total per 96."""
    basis = cfg.minutes_basis
    minutes = frame["minutes"].to_numpy(dtype=float)
    accumulator = np.zeros(len(frame), dtype=float)
    for key in cfg.component_keys:
        variance = model.components[key].per_opportunity_variance
        if variance is None or variance <= 0:
            continue
        counts = np.nan_to_num(frame[f"opp_{key}"].to_numpy(dtype=float), nan=0.0)
        accumulator += counts * float(variance)
    with np.errstate(divide="ignore", invalid="ignore"):
        scaled = np.where(minutes > 0, (basis / minutes) ** 2 * accumulator, np.inf)
    return scaled
