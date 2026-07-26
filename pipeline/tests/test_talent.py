"""Current-talent weighting rules."""

from __future__ import annotations

import pandas as pd
import pytest

from keeperiq.rates import add_rates, add_traditional_metrics
from keeperiq.reliability import apply_shrinkage
from keeperiq.talent import PRIOR_SOURCE_NEW, estimate_current_talent


def _season_frame(cfg, fixed_model, *, season: int, rows: list[dict]) -> pd.DataFrame:
    frame = pd.DataFrame(rows)
    for key in cfg.component_keys:
        if f"ga_{key}" not in frame:
            frame[f"ga_{key}"] = 0.0
            frame[f"ga_raw_{key}"] = 0.0
            frame[f"opp_{key}"] = 100
    frame["season"] = season
    frame["team_id"] = "t"
    frame["shots_faced"] = 50
    frame["goals_conceded"] = 10
    frame["saves"] = 40
    frame["xgoals_faced"] = 12.0
    frame = add_rates(cfg, frame)
    frame = add_traditional_metrics(frame, cfg.minutes_basis)
    return apply_shrinkage(cfg, frame, fixed_model)


def test_new_player_uses_league_prior_not_penalty(cfg, fixed_model) -> None:
    prior = _season_frame(
        cfg,
        fixed_model,
        season=2025,
        rows=[{"player_id": "veteran", "minutes": 3000.0, **_component_burst(cfg, 0.5)}],
    )
    live = _season_frame(
        cfg,
        fixed_model,
        season=2026,
        rows=[
            {"player_id": "veteran", "minutes": 1500.0, **_component_burst(cfg, 0.2)},
            {"player_id": "rookie", "minutes": 400.0, **_component_burst(cfg, 0.0)},
        ],
    )
    talent = estimate_current_talent(cfg, prior, live, fixed_model).set_index("player_id")
    assert talent.loc["rookie", "prior_source"] == PRIOR_SOURCE_NEW
    assert talent.loc["rookie", "weight_prior_season"] == pytest.approx(0.0)
    assert talent.loc["rookie", "weight_prior_league"] > 0.0
    # A rookie with little evidence stays near the league prior rather than being
    # treated as worse than a missing history would imply.
    assert abs(talent.loc["rookie", "talent_total_p96"] - talent.loc["rookie", "league_prior_rate"]) < 0.2


def test_substantial_live_evidence_dominates_prior(cfg, fixed_model) -> None:
    prior = _season_frame(
        cfg,
        fixed_model,
        season=2025,
        rows=[{"player_id": "p", "minutes": 3000.0, **_component_burst(cfg, 1.0)}],
    )
    live = _season_frame(
        cfg,
        fixed_model,
        season=2026,
        rows=[{"player_id": "p", "minutes": 3000.0, **_component_burst(cfg, -1.0)}],
    )
    talent = estimate_current_talent(cfg, prior, live, fixed_model).iloc[0]
    assert talent["weight_live_season"] > talent["weight_prior_season"]
    # The estimate must move toward the live season, not stay glued to 2025.
    assert talent["talent_total_p96"] < talent["prior_season_rate"]


def test_little_live_evidence_stays_near_prior(cfg, fixed_model) -> None:
    prior = _season_frame(
        cfg,
        fixed_model,
        season=2025,
        rows=[{"player_id": "p", "minutes": 3000.0, **_component_burst(cfg, 1.0)}],
    )
    live = _season_frame(
        cfg,
        fixed_model,
        season=2026,
        rows=[{"player_id": "p", "minutes": 90.0, **_component_burst(cfg, -5.0)}],
    )
    talent = estimate_current_talent(cfg, prior, live, fixed_model).iloc[0]
    assert talent["weight_prior_season"] > talent["weight_live_season"]
    assert abs(talent["talent_total_p96"] - talent["prior_season_rate"]) < abs(
        talent["talent_total_p96"] - talent["live_season_rate"]
    )


def _component_burst(cfg, total: float) -> dict:
    per = total / len(cfg.component_keys)
    payload = {}
    for key in cfg.component_keys:
        payload[f"ga_{key}"] = per
        payload[f"ga_raw_{key}"] = per
        payload[f"opp_{key}"] = 200
    return payload
