"""Invariants on the real generated artefacts the site serves."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
PUBLIC = REPO_ROOT / "public" / "data"


def _load(name: str) -> dict:
    path = PUBLIC / name
    if not path.exists():
        pytest.skip(f"{path} is not present; run the pipeline first")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def test_both_seasons_have_real_goalkeepers() -> None:
    for season in (2025, 2026):
        payload = _load(f"season-{season}.json")
        assert len(payload["players"]) >= 20
        assert payload["max_match_date"]
        names = {player["name"] for player in payload["players"]}
        assert "Sample Keeper" not in names
        assert not any(name.startswith("Player ") for name in names)


def test_keeperiq_bounds_on_generated_data() -> None:
    for season in (2025, 2026):
        payload = _load(f"season-{season}.json")
        for player in payload["players"]:
            assert 0.0 <= player["keeperiq"] <= 100.0
            assert player["sample_status"] in {"qualified", "provisional", "limited"}
            for key, component in player["components"].items():
                assert key
                if component["reliability"] is not None:
                    assert 0.0 <= component["reliability"] <= 1.0


def test_limited_sample_is_regressed() -> None:
    payload = _load("season-2025.json")
    limited = [p for p in payload["players"] if p["sample_status"] == "limited"]
    assert limited
    for player in limited:
        # A limited-sample observed rate that is extreme must not survive intact.
        if player["observed_total_p96"] is None or player["adjusted_total_p96"] is None:
            continue
        if abs(player["observed_total_p96"]) > 1.0:
            assert abs(player["adjusted_total_p96"]) < abs(player["observed_total_p96"])


def test_component_total_matches_sum() -> None:
    payload = _load("season-2025.json")
    for player in payload["players"]:
        if player["observed_total_p96"] is None:
            continue
        component_sum = sum(
            component["observed_p96"]
            for component in player["components"].values()
            if component["observed_p96"] is not None
        )
        assert component_sum == pytest.approx(player["observed_total_p96"], abs=0.02)


def test_talent_weights_sum_to_one() -> None:
    payload = _load("talent.json")
    assert len(payload["players"]) >= 20
    for player in payload["players"]:
        weights = player["weights"]
        total = weights["league_prior"] + weights["prior_season"] + weights["live_season"]
        # Weights are rounded to three decimals in the public JSON.
        assert total == pytest.approx(1.0, abs=1e-2)
        if player["prior_source"] == "no_prior_season":
            assert weights["prior_season"] == pytest.approx(0.0)


def test_player_profiles_exist_for_every_slug() -> None:
    index = _load("players-index.json")
    for entry in index["players"]:
        path = PUBLIC / "players" / f"{entry['slug']}.json"
        assert path.exists(), entry["slug"]
        with path.open("r", encoding="utf-8") as handle:
            profile = json.load(handle)
        assert profile["slug"] == entry["slug"]
        assert profile["seasons"]


def test_data_status_reports_current_snapshot() -> None:
    status = _load("data-status.json")
    assert status["validation_status"] in {"passed", "warnings"}
    assert status["last_successful_update"]
    assert status["seasons"]["2025"]["goalkeepers"] >= 20
    assert status["seasons"]["2026"]["goalkeepers"] >= 20
    assert status["seasons"]["2026"]["max_match_date"]


def test_slugs_are_stable_across_seasons() -> None:
    s2025 = {p["player_id"]: p["slug"] for p in _load("season-2025.json")["players"]}
    s2026 = {p["player_id"]: p["slug"] for p in _load("season-2026.json")["players"]}
    for player_id in set(s2025) & set(s2026):
        assert s2025[player_id] == s2026[player_id]


def test_shot_stopping_reconciles_with_goals_prevented() -> None:
    payload = _load("season-2025.json")
    checked = 0
    for player in payload["players"]:
        if player["goals_prevented"] is None:
            continue
        raw = player["components"]["shot_stopping"]["raw_total"]
        if raw is None:
            continue
        assert raw == pytest.approx(player["goals_prevented"], abs=0.06)
        checked += 1
    assert checked >= 20
