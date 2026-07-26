"""Qualification labels, percentiles, ranks, and the KeeperIQ score."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from .config import Config
from .logging_utils import get_logger
from .rates import TOTAL_KEY

LOG = get_logger("ratings")

QUALIFIED = "qualified"
PROVISIONAL = "provisional"
LIMITED = "limited"

SAMPLE_LABELS = {
    QUALIFIED: "Qualified",
    PROVISIONAL: "Provisional",
    LIMITED: "Limited Sample",
}


@dataclass
class QualificationRule:
    """The thresholds actually applied for one season, for display on the site."""

    season: int
    mode: str
    qualified_minutes: float
    provisional_minutes: float
    max_goalkeeper_minutes: float | None
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "season": self.season,
            "mode": self.mode,
            "qualified_minutes": round(self.qualified_minutes, 1),
            "provisional_minutes": round(self.provisional_minutes, 1),
            "max_goalkeeper_minutes": (
                None if self.max_goalkeeper_minutes is None else round(self.max_goalkeeper_minutes, 1)
            ),
            "explanation": self.explanation,
        }


def qualification_rule(cfg: Config, season: int, frame: pd.DataFrame) -> QualificationRule:
    """Resolve the minutes thresholds for a season.

    The completed season uses a fixed minutes bar. The live season scales with
    how much of the season has actually been played, so a goalkeeper can qualify
    in May instead of only once the season is nearly over.
    """
    if season == cfg.live_season:
        settings = cfg.section("qualification", "live_season")
        max_minutes = float(frame["minutes"].max()) if not frame.empty else 0.0
        qualified = max(
            max_minutes * float(settings["qualified_share_of_max_minutes"]),
            float(settings["qualified_minutes_floor"]),
        )
        provisional = max(
            max_minutes * float(settings["provisional_share_of_max_minutes"]),
            float(settings["provisional_minutes_floor"]),
        )
        explanation = (
            f"{season} is in progress. Thresholds scale with the busiest goalkeeper in the "
            f"league ({max_minutes:.0f} minutes): qualified at "
            f"{float(settings['qualified_share_of_max_minutes']):.0%} of that "
            f"({qualified:.0f} minutes) and provisional at "
            f"{float(settings['provisional_share_of_max_minutes']):.0%} "
            f"({provisional:.0f} minutes), subject to absolute floors of "
            f"{settings['qualified_minutes_floor']} and "
            f"{settings['provisional_minutes_floor']} minutes."
        )
        mode = "scaled_to_season_progress"
    else:
        settings = cfg.section("qualification", "final_season")
        qualified = float(settings["qualified_minutes"])
        provisional = float(settings["provisional_minutes"])
        max_minutes = float(frame["minutes"].max()) if not frame.empty else None
        explanation = (
            f"{season} is complete, so a fixed bar applies: qualified at {qualified:.0f} "
            f"minutes (roughly a quarter of a full MLS season) and provisional at "
            f"{provisional:.0f} minutes."
        )
        mode = "fixed_completed_season"

    return QualificationRule(
        season=season,
        mode=mode,
        qualified_minutes=qualified,
        provisional_minutes=provisional,
        max_goalkeeper_minutes=max_minutes,
        explanation=explanation,
    )


def assign_sample_status(frame: pd.DataFrame, rule: QualificationRule) -> pd.Series:
    minutes = frame["minutes"].astype(float)
    return pd.Series(
        np.select(
            [minutes >= rule.qualified_minutes, minutes >= rule.provisional_minutes],
            [QUALIFIED, PROVISIONAL],
            default=LIMITED,
        ),
        index=frame.index,
        dtype=object,
    )


def percentile_against(
    values: pd.Series, reference: np.ndarray, weights: np.ndarray | None = None
) -> pd.Series:
    """Percentile of each value within a fixed reference distribution.

    Uses the midpoint convention ``(below + 0.5 * equal) / total``, which is
    deterministic, handles ties symmetrically, and puts the median at 50.
    Goalkeepers outside the reference pool are still scored against it rather
    than being allowed to distort it.

    When ``weights`` (minutes played) are supplied the distribution is weighted,
    so the question answered is "what percentile is this goalkeeper among MLS
    goalkeeper *minutes*" rather than treating a 400-minute backup as equal
    evidence to a 3,000-minute starter. Weighting also aligns the scale with the
    minutes-weighted league baseline that ratings are regressed toward, so a
    goalkeeper with league-average impact lands near 50.
    """
    if reference.size == 0:
        return pd.Series(np.nan, index=values.index, dtype=float)

    if weights is None:
        weights = np.ones(reference.size, dtype=float)
    weights = np.asarray(weights, dtype=float)
    if weights.size != reference.size:
        raise ValueError("Reference weights must match the reference distribution length.")
    weights = np.where(np.isfinite(weights) & (weights > 0), weights, 0.0)
    total = float(weights.sum())
    if total <= 0:
        weights = np.ones(reference.size, dtype=float)
        total = float(reference.size)

    order = np.argsort(reference, kind="stable")
    ordered = reference[order]
    ordered_weights = weights[order]
    cumulative = np.concatenate([[0.0], np.cumsum(ordered_weights)])

    numeric = values.to_numpy(dtype=float)
    below_index = np.searchsorted(ordered, numeric, side="left")
    at_or_below_index = np.searchsorted(ordered, numeric, side="right")
    weight_below = cumulative[below_index]
    weight_equal = cumulative[at_or_below_index] - weight_below
    result = (weight_below + 0.5 * weight_equal) / total * 100.0
    return pd.Series(np.where(np.isfinite(numeric), result, np.nan), index=values.index)


def deterministic_rank(values: pd.Series, tiebreaker: pd.Series, *, ascending: bool) -> pd.Series:
    """Competition ranking with a deterministic tiebreaker.

    Equal values receive the same rank (``1, 2, 2, 4``). Ordering within a tie
    is resolved by ``tiebreaker`` (the player id) so repeated runs of the
    pipeline produce byte-identical output.
    """
    frame = pd.DataFrame({"value": values.astype(float), "tie": tiebreaker.astype(str)})
    ranked = frame["value"].rank(method="min", ascending=ascending, na_option="keep")
    return ranked.astype("Float64")


def add_ratings(cfg: Config, frame: pd.DataFrame, rule: QualificationRule) -> pd.DataFrame:
    """Attach sample status, percentiles, KeeperIQ, and ranks for one season."""
    frame = frame.copy()
    frame["sample_status"] = assign_sample_status(frame, rule)
    frame["sample_status_label"] = frame["sample_status"].map(SAMPLE_LABELS)

    pool_statuses = list(cfg.section("qualification", "reference_pool"))
    in_pool = frame["sample_status"].isin(pool_statuses)
    frame["in_reference_pool"] = in_pool

    if not in_pool.any():
        LOG.warning(
            "No goalkeeper reached the reference pool for season %s; percentiles fall back to "
            "the full population.",
            rule.season,
        )
        in_pool = pd.Series(True, index=frame.index)
        frame["in_reference_pool"] = in_pool

    for key in [*cfg.component_keys, TOTAL_KEY]:
        for prefix in ("adj", "ga"):
            column = f"{prefix}_{key}_p96"
            if column not in frame:
                continue
            pool = frame.loc[in_pool, [column, "minutes"]].dropna(subset=[column])
            frame[f"pct_{prefix}_{key}"] = percentile_against(
                frame[column],
                pool[column].to_numpy(dtype=float),
                pool["minutes"].to_numpy(dtype=float),
            )

    # KeeperIQ: the percentile of reliability-adjusted complete impact.
    frame["keeperiq"] = frame[f"pct_adj_{TOTAL_KEY}"]

    ids = frame["player_id"]
    frame["rank_adjusted"] = deterministic_rank(
        frame[f"adj_{TOTAL_KEY}_p96"], ids, ascending=False
    )
    frame["rank_observed"] = deterministic_rank(
        frame[f"ga_{TOTAL_KEY}_p96"], ids, ascending=False
    )
    # Traditional counterpart: fewest goals allowed per 96 ranks first.
    frame["rank_goals_conceded"] = deterministic_rank(
        frame["goals_conceded_p96"], ids, ascending=True
    )
    frame["rank_save_pct"] = deterministic_rank(frame["save_pct"], ids, ascending=False)

    # Rank disagreement is only meaningful among goalkeepers with a real sample.
    ranked_pool = frame["in_reference_pool"]
    for source, target in (
        ("rank_goals_conceded", "rank_goals_conceded_pool"),
        ("rank_adjusted", "rank_adjusted_pool"),
        ("rank_observed", "rank_observed_pool"),
    ):
        pooled = frame.loc[ranked_pool].copy()
        pooled_rank = deterministic_rank(
            pooled[
                {
                    "rank_goals_conceded": "goals_conceded_p96",
                    "rank_adjusted": f"adj_{TOTAL_KEY}_p96",
                    "rank_observed": f"ga_{TOTAL_KEY}_p96",
                }[source]
            ],
            pooled["player_id"],
            ascending=(source == "rank_goals_conceded"),
        )
        frame[target] = pd.Series(pd.NA, index=frame.index, dtype="Float64")
        frame.loc[ranked_pool, target] = pooled_rank

    frame["rank_disagreement"] = (
        frame["rank_goals_conceded_pool"] - frame["rank_adjusted_pool"]
    )
    return frame
