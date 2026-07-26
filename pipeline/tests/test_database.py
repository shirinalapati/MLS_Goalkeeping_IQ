"""DuckDB load and data-quality tests."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pytest

from keeperiq.config import REPO_ROOT, load_config
from keeperiq.database import apply_schema, connect, run_data_quality


def test_schema_applies_cleanly(tmp_path: Path) -> None:
    db = tmp_path / "test.duckdb"
    con = connect(db)
    try:
        apply_schema(con)
        tables = {
            row[0]
            for row in con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
            ).fetchall()
        }
        for required in (
            "players",
            "teams",
            "matches",
            "goalkeeper_match_stats",
            "goalkeeper_season_stats",
            "goalkeeper_components",
            "keeperiq_ratings",
            "talent_estimates",
            "ranking_snapshots",
            "data_refreshes",
            "scraped_rosters",
            "scrape_runs",
        ):
            assert required in tables
        views = {
            row[0]
            for row in con.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_type = 'VIEW'"
            ).fetchall()
        }
        assert "v_season_leaderboard" in views
        assert "v_match_form" in views
    finally:
        con.close()


def test_generated_duckdb_passes_quality_checks() -> None:
    path = REPO_ROOT / "data" / "keeperiq.duckdb"
    if not path.exists():
        pytest.skip("DuckDB not built yet; run the pipeline first")
    con = duckdb.connect(str(path), read_only=True)
    try:
        issues = run_data_quality(con)
        errors = [issue for issue in issues if issue["severity"] == "error"]
        assert errors == []
        n_ratings = con.execute("SELECT COUNT(*) FROM keeperiq_ratings").fetchone()[0]
        assert n_ratings >= 40
        n_matches = con.execute("SELECT COUNT(*) FROM goalkeeper_match_stats").fetchone()[0]
        assert n_matches >= 100
    finally:
        con.close()


def test_scouting_leaderboard_view_works() -> None:
    path = REPO_ROOT / "data" / "keeperiq.duckdb"
    if not path.exists():
        pytest.skip("DuckDB not built yet; run the pipeline first")
    cfg = load_config()
    con = duckdb.connect(str(path), read_only=True)
    try:
        frame = con.execute(
            """
            SELECT player_name, keeperiq, rank_adjusted
            FROM v_season_leaderboard
            WHERE season = ?
              AND sample_status IN ('qualified', 'provisional')
            ORDER BY rank_adjusted
            LIMIT 5
            """,
            [cfg.live_season],
        ).fetchdf()
        assert len(frame) >= 1
        assert frame.iloc[0]["rank_adjusted"] == 1
    finally:
        con.close()
