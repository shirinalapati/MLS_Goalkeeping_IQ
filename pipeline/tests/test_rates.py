"""Per-96 rates, totals, and traditional metrics."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from keeperiq.rates import TOTAL_KEY, add_rates, add_traditional_metrics, per_96


def test_per_96_protects_against_zero_minutes() -> None:
    values = pd.Series([1.0, 2.0, 3.0])
    minutes = pd.Series([96.0, 0.0, 48.0])
    rates = per_96(values, minutes, 96)
    assert rates.iloc[0] == pytest.approx(1.0)
    assert math.isnan(rates.iloc[1])
    assert rates.iloc[2] == pytest.approx(6.0)


def test_total_is_sum_of_components(cfg, toy_seasons) -> None:
    components = [f"ga_{key}" for key in cfg.component_keys]
    expected = toy_seasons[components].sum(axis=1)
    assert np.allclose(toy_seasons[f"ga_{TOTAL_KEY}"], expected, equal_nan=True)


def test_missing_component_blocks_total(cfg) -> None:
    row = {
        "player_id": "p",
        "season": 2025,
        "team_id": "t",
        "minutes": 1000.0,
    }
    for key in cfg.component_keys:
        row[f"ga_{key}"] = 0.1
        row[f"ga_raw_{key}"] = 0.1
        row[f"opp_{key}"] = 10
    row[f"ga_{cfg.component_keys[0]}"] = np.nan
    frame = add_rates(cfg, pd.DataFrame([row]))
    assert math.isnan(frame.loc[0, f"ga_{TOTAL_KEY}"])


def test_save_percentage_undefined_without_shots(cfg) -> None:
    frame = pd.DataFrame(
        [
            {
                "minutes": 96.0,
                "shots_faced": 0,
                "goals_conceded": 0,
                "saves": 0,
                "xgoals_faced": 0.0,
            },
            {
                "minutes": 96.0,
                "shots_faced": 10,
                "goals_conceded": 3,
                "saves": 7,
                "xgoals_faced": 2.5,
            },
        ]
    )
    frame = add_traditional_metrics(frame, cfg.minutes_basis)
    assert math.isnan(frame.loc[0, "save_pct"])
    assert frame.loc[1, "save_pct"] == 70.0
    assert frame.loc[1, "goals_prevented"] == pytest.approx(-0.5)
