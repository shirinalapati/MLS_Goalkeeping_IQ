"""Qualification, percentiles, ranks, and KeeperIQ bounds."""

from __future__ import annotations

import pandas as pd
import pytest

from keeperiq.rates import TOTAL_KEY, add_traditional_metrics
from keeperiq.ratings import (
    LIMITED,
    PROVISIONAL,
    QUALIFIED,
    add_ratings,
    assign_sample_status,
    deterministic_rank,
    percentile_against,
    qualification_rule,
)
from keeperiq.reliability import apply_shrinkage


def test_percentile_median_is_fifty() -> None:
    values = pd.Series([1.0, 2.0, 3.0, 4.0, 5.0])
    result = percentile_against(values, values.to_numpy())
    assert result.iloc[2] == pytest.approx(50.0)


def test_percentile_is_deterministic_and_bounded() -> None:
    values = pd.Series([0.1, 0.2, 0.2, 0.9])
    reference = values.to_numpy()
    first = percentile_against(values, reference)
    second = percentile_against(values, reference)
    assert first.equals(second)
    assert first.min() >= 0.0
    assert first.max() <= 100.0
    # Tied values share a percentile.
    assert first.iloc[1] == first.iloc[2]


def test_deterministic_rank_breaks_ties_by_id() -> None:
    values = pd.Series([3.0, 3.0, 1.0])
    ids = pd.Series(["b", "a", "c"])
    ranks = deterministic_rank(values, ids, ascending=False)
    assert list(ranks) == [1.0, 1.0, 3.0]


def test_sample_status_thresholds_for_completed_season(cfg, toy_seasons) -> None:
    frame = toy_seasons[toy_seasons["season"] == 2025].copy()
    rule = qualification_rule(cfg, 2025, frame)
    assert rule.mode == "fixed_completed_season"
    assert rule.qualified_minutes == 900
    status = assign_sample_status(frame, rule)
    assert set(status.unique()) <= {QUALIFIED, PROVISIONAL, LIMITED}
    assert (frame.loc[status == QUALIFIED, "minutes"] >= 900).all()


def test_live_season_thresholds_scale_with_progress(cfg, toy_seasons) -> None:
    frame = toy_seasons[toy_seasons["season"] == 2026].copy()
    # Cap every goalkeeper so the busiest workload is known exactly.
    frame["minutes"] = frame["minutes"].clip(upper=1600)
    rule = qualification_rule(cfg, 2026, frame)
    assert rule.mode == "scaled_to_season_progress"
    assert rule.qualified_minutes == pytest.approx(max(1600 * 0.5, 270))


def test_keeperiq_bounds_and_average(cfg, toy_seasons, fixed_model) -> None:
    frame = toy_seasons[toy_seasons["season"] == 2025].copy()
    frame = add_traditional_metrics(frame, cfg.minutes_basis)
    frame = apply_shrinkage(cfg, frame, fixed_model)
    rule = qualification_rule(cfg, 2025, frame)
    rated = add_ratings(cfg, frame, rule)
    assert rated["keeperiq"].between(0, 100).all()
    pool = rated[rated["in_reference_pool"]]
    # Under the midpoint convention the keeper with the median adjusted rate
    # lands at 50, and the pool mean stays near the centre of the scale.
    ordered = pool.sort_values(f"adj_{TOTAL_KEY}_p96").reset_index(drop=True)
    median_keeper = ordered.iloc[len(ordered) // 2]
    assert median_keeper["keeperiq"] == pytest.approx(50.0, abs=20.0)
    assert pool["keeperiq"].mean() == pytest.approx(50.0, abs=15.0)
