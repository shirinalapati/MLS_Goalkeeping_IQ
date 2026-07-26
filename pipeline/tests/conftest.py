"""Shared fixtures for the KeeperIQ pipeline tests."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from keeperiq.config import Config, load_config
from keeperiq.rates import add_rates, add_traditional_metrics
from keeperiq.reliability import (
    ComponentReliability,
    ReliabilityModel,
    TotalReliability,
    VolumeReliability,
)

REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def cfg() -> Config:
    return load_config(REPO_ROOT / "pipeline" / "config" / "keeperiq.yml")


@pytest.fixture
def toy_seasons(cfg: Config) -> pd.DataFrame:
    """A small, fully specified goalkeeper-season frame for unit tests."""
    rng = np.random.default_rng(7)
    records = []
    for season in (2024, 2025, 2026):
        for index in range(12):
            player_id = f"p{index:02d}"
            minutes = float([120, 400, 1000, 1800, 2700, 3200][index % 6])
            row = {
                "player_id": player_id,
                "player_name": f"Keeper {index}",
                "slug": f"keeper-{index}",
                "season": season,
                "team_id": f"t{index % 4}",
                "minutes": minutes,
                "shots_faced": int(minutes / 30),
                "goals_conceded": int(minutes / 80),
                "saves": int(minutes / 45),
                "xgoals_faced": minutes / 70.0,
                "nationality": "USA",
                "birth_date": "1995-01-01",
            }
            for key_index, key in enumerate(cfg.component_keys):
                opportunities = max(1, int(minutes / (20 + 5 * key_index)))
                # A small true talent signal so shrinkage has something to work with.
                talent = (index - 5.5) * 0.01 / (key_index + 1)
                noise = rng.normal(0, 0.05)
                row[f"ga_{key}"] = opportunities * talent + noise
                row[f"ga_raw_{key}"] = row[f"ga_{key}"]
                row[f"opp_{key}"] = opportunities
            records.append(row)
    frame = pd.DataFrame(records)
    frame = add_rates(cfg, frame)
    frame = add_traditional_metrics(frame, cfg.minutes_basis)
    return frame


@pytest.fixture
def toy_matches(cfg: Config, toy_seasons: pd.DataFrame) -> pd.DataFrame:
    records = []
    for _, season_row in toy_seasons.iterrows():
        n_matches = max(1, int(season_row["minutes"] // 90))
        for match_index in range(n_matches):
            minutes = min(96.0, float(season_row["minutes"]) / n_matches)
            row = {
                "player_id": season_row["player_id"],
                "season": int(season_row["season"]),
                "game_id": f"g{season_row['season']}-{season_row['player_id']}-{match_index}",
                "team_id": season_row["team_id"],
                "date_utc": f"{season_row['season']}-{(match_index % 12) + 1:02d}-15",
                "matchday": match_index + 1,
                "minutes": minutes,
                "shots_faced": max(1, int(minutes / 30)),
                "goals_conceded": 1 if match_index % 3 == 0 else 0,
                "saves": max(0, int(minutes / 45)),
                "xgoals_faced": minutes / 70.0,
            }
            for key in cfg.component_keys:
                opportunities = max(0, int(season_row[f"opp_{key}"] / n_matches))
                value = float(season_row[f"ga_{key}"]) / n_matches
                row[f"ga_{key}"] = value
                row[f"ga_raw_{key}"] = value
                row[f"opp_{key}"] = opportunities
            records.append(row)
    frame = pd.DataFrame(records)
    return add_rates(cfg, frame)


@pytest.fixture
def fixed_model(cfg: Config) -> ReliabilityModel:
    """A fully specified reliability model that does not require estimation."""
    components = {
        key: ComponentReliability(
            component=key,
            k=200.0,
            source="test",
            per_opportunity_variance=0.05,
            talent_variance=0.00025,
            league_mean_per_opportunity=0.0,
            n_players=40,
            n_matches=400,
            median_opportunities=100.0,
            reliability_at_median=100.0 / 300.0,
            split_half_correlation=0.2,
            spearman_brown_reliability=0.33,
            year_over_year_correlation=0.1,
            drift_variance=0.00005,
            drift_source="test",
            note="fixture",
        )
        for key in cfg.component_keys
    }
    volumes = {
        key: VolumeReliability(
            component=key,
            k_minutes=900.0,
            source="test",
            sampling_variance=1.0,
            talent_variance=0.001,
            league_rate_p96=5.0,
            n_players=40,
            reliability_at_900_minutes=0.5,
            note="fixture",
        )
        for key in cfg.component_keys
    }
    return ReliabilityModel(
        components=components,
        volumes=volumes,
        total=TotalReliability(
            talent_variance=0.04,
            drift_variance=0.01,
            drift_source="test",
            source="test",
            note="fixture",
        ),
        seasons_used=[2021, 2022, 2023, 2024, 2025],
        volume_shrinkage_enabled=True,
    )


@pytest.fixture
def public_season_2025() -> dict:
    path = REPO_ROOT / "public" / "data" / "season-2025.json"
    if not path.exists():
        pytest.skip("Generated season-2025.json is not present; run the pipeline first.")
    import json

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture
def public_season_2026() -> dict:
    path = REPO_ROOT / "public" / "data" / "season-2026.json"
    if not path.exists():
        pytest.skip("Generated season-2026.json is not present; run the pipeline first.")
    import json

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
