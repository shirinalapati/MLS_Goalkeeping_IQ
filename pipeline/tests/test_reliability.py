"""Empirical-Bayes shrinkage behaviour."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from keeperiq.rates import TOTAL_KEY
from keeperiq.reliability import apply_shrinkage, reliability_weight


def test_reliability_weight_is_zero_with_no_opportunities() -> None:
    weights = reliability_weight(np.array([0.0, 100.0, 200.0]), k=100.0)
    assert weights[0] == pytest.approx(0.0)
    assert weights[1] == pytest.approx(0.5)
    assert weights[2] == pytest.approx(2.0 / 3.0)


def test_zero_minute_keeper_is_regressed_to_league_mean(cfg, fixed_model) -> None:
    row = {
        "player_id": "tiny",
        "season": 2025,
        "team_id": "t",
        "minutes": 10.0,
    }
    for key in cfg.component_keys:
        # Absurd observed rates that must not survive shrinkage.
        row[f"ga_{key}"] = 5.0
        row[f"ga_raw_{key}"] = 5.0
        row[f"opp_{key}"] = 1
    frame = pd.DataFrame([row])
    from keeperiq.rates import add_rates

    frame = add_rates(cfg, frame)
    shrunk = apply_shrinkage(cfg, frame, fixed_model)
    # With 10 minutes and one opportunity the adjusted rate must sit near the
    # league mean of zero (the fixture's per-opportunity mean) times a heavily
    # regressed workload, i.e. close to zero and nowhere near the observed 5*6.
    assert abs(shrunk.loc[0, f"adj_{TOTAL_KEY}_p96"]) < 1.0
    assert shrunk.loc[0, f"reliability_{cfg.component_keys[0]}"] < 0.05


def test_full_season_keeper_keeps_most_of_the_signal(cfg, fixed_model) -> None:
    row = {
        "player_id": "starter",
        "season": 2025,
        "team_id": "t",
        "minutes": 3000.0,
    }
    for key in cfg.component_keys:
        row[f"ga_{key}"] = 1.0
        row[f"ga_raw_{key}"] = 1.0
        row[f"opp_{key}"] = 400
    from keeperiq.rates import add_rates

    frame = add_rates(cfg, pd.DataFrame([row]))
    shrunk = apply_shrinkage(cfg, frame, fixed_model)
    assert shrunk.loc[0, f"reliability_{cfg.component_keys[0]}"] > 0.6
    # Observed total per 96 is 6 * 1.0 / 3000 * 96 = 0.192; adjusted must stay
    # in the same neighbourhood rather than collapsing to zero.
    assert shrunk.loc[0, f"adj_{TOTAL_KEY}_p96"] > 0.05


def test_missing_values_are_not_treated_as_zero(cfg, fixed_model) -> None:
    row = {
        "player_id": "missing",
        "season": 2025,
        "team_id": "t",
        "minutes": 1000.0,
    }
    for key in cfg.component_keys:
        row[f"ga_{key}"] = np.nan
        row[f"ga_raw_{key}"] = np.nan
        row[f"opp_{key}"] = np.nan
    from keeperiq.rates import add_rates

    frame = add_rates(cfg, pd.DataFrame([row]))
    shrunk = apply_shrinkage(cfg, frame, fixed_model)
    # No opportunities means the adjusted rate is exactly the league baseline.
    assert shrunk.loc[0, f"reliability_{cfg.component_keys[0]}"] == pytest.approx(0.0)
    assert math_is_close_to_baseline(shrunk.loc[0, f"adj_{TOTAL_KEY}_p96"], fixed_model, cfg)


def math_is_close_to_baseline(value: float, model, cfg) -> bool:
    expected = sum(model.league_mean(key) * model.league_rate(key) for key in cfg.component_keys)
    return abs(float(value) - expected) < 1e-9
