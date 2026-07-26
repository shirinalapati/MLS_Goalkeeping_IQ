"""Current-talent estimation.

The question this answers is not "who played best in 2026" but "how good is
this goalkeeper right now". Three independent sources of information are
combined with normal-normal (precision-weighted) updating:

======================  ===========================================================
League prior            Every MLS goalkeeper starts at the league mean with
                        precision ``1 / tau^2``, where ``tau^2`` is the spread of
                        true ability across goalkeepers.
Prior-season evidence   The 2025 observed rate, with precision
                        ``1 / (sampling variance + drift variance)``. The drift
                        term is what a year of ageing, tactical change, and
                        genuine talent change costs the old evidence.
Live-season evidence    The 2026 observed rate, with precision
                        ``1 / sampling variance``.
======================  ===========================================================

    talent = (P_prior * mu + P_2025 * y_2025 + P_2026 * y_2026)
             / (P_prior + P_2025 + P_2026)

The three normalised precisions are exported so the site can show exactly how
much of a goalkeeper's estimate comes from each source.

Note that the *observed* rates enter the combination, not the shrunk ones. The
league-prior term already performs the regression to the mean; feeding in
pre-shrunk inputs as well would regress the same evidence twice.

Consequences, which are the behaviour we want:

* A goalkeeper with barely any 2026 minutes keeps an estimate close to his 2025
  form, because ``P_2026`` is tiny.
* A goalkeeper with a full 2026 workload moves decisively toward 2026.
* A goalkeeper new to MLS has ``P_2025 = 0`` and simply starts from the league
  prior updated by whatever 2026 evidence exists. He is not penalised for
  having no MLS history; he is treated as unknown, which is what he is.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from .config import Config
from .logging_utils import get_logger
from .rates import TOTAL_KEY
from .reliability import ReliabilityModel

LOG = get_logger("talent")

PRIOR_SOURCE_NEW = "no_prior_season"
PRIOR_SOURCE_HISTORY = "prior_season_available"


def _league_mean_total_p96(frame: pd.DataFrame, minimum_minutes: float) -> float:
    """Minutes-weighted league mean Total G+ per 96 among real workloads."""
    usable = frame[(frame["minutes"] >= minimum_minutes)].dropna(subset=[f"ga_{TOTAL_KEY}_p96"])
    if usable.empty:
        usable = frame.dropna(subset=[f"ga_{TOTAL_KEY}_p96"])
    if usable.empty:
        return 0.0
    weights = usable["minutes"].to_numpy(dtype=float)
    values = usable[f"ga_{TOTAL_KEY}_p96"].to_numpy(dtype=float)
    if weights.sum() <= 0:
        return float(np.mean(values))
    return float(np.average(values, weights=weights))


def estimate_current_talent(
    cfg: Config,
    prior_season: pd.DataFrame,
    live_season: pd.DataFrame,
    model: ReliabilityModel,
) -> pd.DataFrame:
    """Combine prior-season and live-season evidence into a talent estimate.

    ``prior_season`` and ``live_season`` must already carry ``ga_total_p96`` and
    ``sampling_variance_total_p96`` (added by :func:`reliability.apply_shrinkage`).
    """
    talent_variance = float(model.total.talent_variance)
    drift_variance = float(model.total.drift_variance)
    if talent_variance <= 0:
        raise ValueError(
            "Total talent variance is not positive; the current-talent model cannot be "
            "identified. Check the reliability diagnostics in the generated metadata."
        )

    league_mean = _league_mean_total_p96(prior_season, 900.0)

    prior = prior_season.set_index("player_id")
    live = live_season.set_index("player_id")
    player_ids = sorted(set(prior.index) | set(live.index))

    records: list[dict[str, Any]] = []
    prior_precision = 1.0 / talent_variance

    for player_id in player_ids:
        has_prior = player_id in prior.index
        has_live = player_id in live.index

        precision_2025 = 0.0
        value_2025 = np.nan
        minutes_2025 = 0.0
        if has_prior:
            row = prior.loc[player_id]
            value_2025 = float(row[f"ga_{TOTAL_KEY}_p96"])
            minutes_2025 = float(row["minutes"])
            sampling = float(row["sampling_variance_total_p96"])
            if np.isfinite(value_2025) and np.isfinite(sampling) and sampling >= 0:
                precision_2025 = 1.0 / (sampling + drift_variance)
            else:
                value_2025 = np.nan

        precision_2026 = 0.0
        value_2026 = np.nan
        minutes_2026 = 0.0
        if has_live:
            row = live.loc[player_id]
            value_2026 = float(row[f"ga_{TOTAL_KEY}_p96"])
            minutes_2026 = float(row["minutes"])
            sampling = float(row["sampling_variance_total_p96"])
            if np.isfinite(value_2026) and np.isfinite(sampling) and sampling > 0:
                precision_2026 = 1.0 / sampling
            else:
                value_2026 = np.nan

        total_precision = prior_precision + precision_2025 + precision_2026
        numerator = prior_precision * league_mean
        if precision_2025 > 0 and np.isfinite(value_2025):
            numerator += precision_2025 * value_2025
        if precision_2026 > 0 and np.isfinite(value_2026):
            numerator += precision_2026 * value_2026
        estimate = numerator / total_precision

        # Posterior standard deviation of the talent estimate.
        posterior_sd = float(np.sqrt(1.0 / total_precision))

        records.append(
            {
                "player_id": player_id,
                "talent_total_p96": float(estimate),
                "talent_posterior_sd": posterior_sd,
                "weight_prior_league": float(prior_precision / total_precision),
                "weight_prior_season": float(precision_2025 / total_precision),
                "weight_live_season": float(precision_2026 / total_precision),
                "prior_season_rate": None if not np.isfinite(value_2025) else float(value_2025),
                "live_season_rate": None if not np.isfinite(value_2026) else float(value_2026),
                "prior_season_minutes": minutes_2025,
                "live_season_minutes": minutes_2026,
                "league_prior_rate": float(league_mean),
                "prior_source": PRIOR_SOURCE_HISTORY if precision_2025 > 0 else PRIOR_SOURCE_NEW,
            }
        )

    frame = pd.DataFrame(records)
    LOG.info(
        "Current talent for %d goalkeepers (league prior %.3f G+/96, drift variance %.5f)",
        len(frame),
        league_mean,
        drift_variance,
    )
    return frame


def talent_context(cfg: Config, model: ReliabilityModel, prior_season: pd.DataFrame) -> dict[str, Any]:
    """Model constants exported for the methodology and data-status pages."""
    return {
        "league_prior_rate": round(_league_mean_total_p96(prior_season, 900.0), 4),
        "talent_variance": round(float(model.total.talent_variance), 6),
        "talent_sd": round(float(np.sqrt(max(model.total.talent_variance, 0.0))), 4),
        "drift_variance": round(float(model.total.drift_variance), 6),
        "drift_sd": round(float(np.sqrt(max(model.total.drift_variance, 0.0))), 4),
        "drift_source": model.total.drift_source,
        "variance_source": model.total.source,
        "prior_season": cfg.final_season,
        "live_season": cfg.live_season,
        "note": model.total.note,
    }
