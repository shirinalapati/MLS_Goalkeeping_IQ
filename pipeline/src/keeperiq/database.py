"""DuckDB system of record for MLS KeeperIQ.

The Next.js app continues to read static JSON from ``public/data`` so Vercel
deployments stay serverless. This module builds a relational DuckDB database
that is the analytical source of truth for SQL scouting, data-quality checks,
and the R report.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import pandas as pd

from .config import REPO_ROOT, Config
from .logging_utils import get_logger
from .rates import TOTAL_KEY
from .transform import CanonicalData

LOG = get_logger("database")

SQL_DIR = REPO_ROOT / "pipeline" / "sql"


@dataclass
class DatabaseLoadResult:
    path: Path
    refresh_id: str
    table_counts: dict[str, int]
    quality_issues: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": str(self.path.relative_to(REPO_ROOT)),
            "refresh_id": self.refresh_id,
            "table_counts": self.table_counts,
            "quality_issues": self.quality_issues,
        }


def default_db_path(cfg: Config) -> Path:
    configured = cfg.raw.get("output", {}).get("duckdb_path")
    return REPO_ROOT / (configured or "data/keeperiq.duckdb")


def connect(path: Path) -> duckdb.DuckDBPyConnection:
    path.parent.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(path))


def apply_schema(con: duckdb.DuckDBPyConnection) -> None:
    for name in ("schema.sql", "views.sql"):
        sql_path = SQL_DIR / name
        con.execute(sql_path.read_text(encoding="utf-8"))


def _split_sql_statements(text: str) -> list[str]:
    """Split a SQL script into statements, ignoring comment-only lines."""
    lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("--"):
            continue
        lines.append(line)
    blob = "\n".join(lines)
    return [part.strip() for part in blob.split(";") if part.strip()]


def run_data_quality(con: duckdb.DuckDBPyConnection) -> list[dict[str, str]]:
    """Execute ``data_quality.sql`` and collect any failing checks."""
    issues: list[dict[str, str]] = []
    script = (SQL_DIR / "data_quality.sql").read_text(encoding="utf-8")
    for statement in _split_sql_statements(script):
        try:
            frame = con.execute(statement).fetchdf()
        except duckdb.Error as exc:
            issues.append(
                {
                    "severity": "error",
                    "check_id": "sql_execution",
                    "detail": f"{exc}; statement starts: {statement[:80]}",
                }
            )
            continue
        if frame.empty:
            continue
        for row in frame.to_dict(orient="records"):
            issues.append(
                {
                    "severity": str(row.get("severity", "warning")),
                    "check_id": str(row.get("check_id", "unknown")),
                    "detail": str(row.get("detail", "")),
                }
            )
    return issues


def _players_frame(data: CanonicalData) -> pd.DataFrame:
    frame = data.players.copy()
    if "birth_date" in frame:
        frame["birth_date"] = pd.to_datetime(frame["birth_date"], errors="coerce").dt.date
    cols = [
        "player_id",
        "player_name",
        "slug",
        "birth_date",
        "nationality",
        "height_ft",
        "height_in",
    ]
    for col in cols:
        if col not in frame:
            frame[col] = None
    return frame[cols]


def _teams_frame(data: CanonicalData, *extra_frames: pd.DataFrame) -> pd.DataFrame:
    """Build the teams dimension, synthesising any ids referenced but missing.

    ASA match payloads can mention historical or temporary club ids that are
    absent from the current ``teams`` endpoint. Rather than drop those matches
    (or disable foreign keys), we insert honest placeholder rows.
    """
    base = data.teams[
        ["team_id", "team_name", "team_abbreviation", "team_short_name"]
    ].drop_duplicates()
    known = set(base["team_id"].astype(str))
    referenced: set[str] = set()
    for frame in extra_frames:
        if frame is None or frame.empty:
            continue
        for column in ("team_id", "home_team_id", "away_team_id"):
            if column in frame.columns:
                referenced.update(
                    str(value) for value in frame[column].dropna().unique() if str(value)
                )
    missing = sorted(referenced - known)
    if missing:
        placeholders = pd.DataFrame(
            {
                "team_id": missing,
                "team_name": [f"Unknown club ({team_id})" for team_id in missing],
                "team_abbreviation": ["UNK"] * len(missing),
                "team_short_name": ["Unknown"] * len(missing),
            }
        )
        base = pd.concat([base, placeholders], ignore_index=True)
    return base.drop_duplicates(subset=["team_id"])


def _matches_frame(data: CanonicalData) -> pd.DataFrame:
    if data.games.empty:
        return pd.DataFrame(
            columns=[
                "game_id",
                "season",
                "date_utc",
                "home_team_id",
                "away_team_id",
                "matchday",
                "status",
                "home_score",
                "away_score",
            ]
        )
    frame = data.games.copy()
    frame["date_utc"] = pd.to_datetime(frame["date_utc"], errors="coerce").dt.date
    return frame


def _season_stats_frame(result_frames: list[pd.DataFrame]) -> pd.DataFrame:
    if not result_frames:
        return pd.DataFrame()
    frame = pd.concat(result_frames, ignore_index=True)
    out = pd.DataFrame(
        {
            "player_id": frame["player_id"],
            "season": frame["season"].astype(int),
            "team_id": frame["team_id"],
            "minutes": frame["minutes"].astype(float),
            "appearances": frame.get("appearances"),
            "shots_faced": frame.get("shots_faced"),
            "goals_conceded": frame.get("goals_conceded"),
            "saves": frame.get("saves"),
            "xgoals_faced": frame.get("xgoals_faced"),
            "save_pct": frame.get("save_pct"),
            "goals_prevented": frame.get("goals_prevented"),
            "goals_conceded_p96": frame.get("goals_conceded_p96"),
            "shots_faced_p96": frame.get("shots_faced_p96"),
            "goals_prevented_p96": frame.get("goals_prevented_p96"),
            "ga_total": frame.get(f"ga_{TOTAL_KEY}"),
            "ga_total_p96": frame.get(f"ga_{TOTAL_KEY}_p96"),
            "components_complete": frame.get("components_complete"),
        }
    )
    return out


def _match_stats_frame(matches: pd.DataFrame) -> pd.DataFrame:
    if matches.empty:
        return pd.DataFrame(
            columns=[
                "player_id",
                "game_id",
                "season",
                "team_id",
                "date_utc",
                "matchday",
                "minutes",
                "shots_faced",
                "goals_conceded",
                "saves",
                "xgoals_faced",
                "goals_prevented",
                "ga_total",
                "ga_total_p96",
            ]
        )
    frame = matches.copy()
    frame["date_utc"] = pd.to_datetime(frame.get("date_utc"), errors="coerce").dt.date
    return pd.DataFrame(
        {
            "player_id": frame["player_id"],
            "game_id": frame["game_id"],
            "season": frame["season"].astype(int),
            "team_id": frame["team_id"],
            "date_utc": frame["date_utc"],
            "matchday": frame.get("matchday"),
            "minutes": frame["minutes"].astype(float),
            "shots_faced": frame.get("shots_faced"),
            "goals_conceded": frame.get("goals_conceded"),
            "saves": frame.get("saves"),
            "xgoals_faced": frame.get("xgoals_faced"),
            "goals_prevented": frame.get("goals_prevented"),
            "ga_total": frame.get(f"ga_{TOTAL_KEY}"),
            "ga_total_p96": frame.get(f"ga_{TOTAL_KEY}_p96"),
        }
    )


def _components_frame(cfg: Config, result_frames: list[pd.DataFrame]) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    action_map = {spec.key: spec.source_action_type for spec in cfg.components}
    for frame in result_frames:
        for _, row in frame.iterrows():
            for key in cfg.component_keys:
                records.append(
                    {
                        "player_id": row["player_id"],
                        "season": int(row["season"]),
                        "game_id": None,
                        "component_key": key,
                        "source_action_type": action_map[key],
                        "goals_added": row.get(f"ga_{key}"),
                        "goals_added_raw": row.get(f"ga_raw_{key}"),
                        "opportunities": row.get(f"opp_{key}"),
                        "ga_p96": row.get(f"ga_{key}_p96"),
                        "opportunities_p96": row.get(f"opp_{key}_p96"),
                        "adjusted_p96": row.get(f"adj_{key}_p96"),
                        "reliability": row.get(f"reliability_{key}"),
                        "percentile": row.get(f"pct_adj_{key}"),
                    }
                )
    return pd.DataFrame(records)


def _ratings_frame(
    result_frames: list[pd.DataFrame], *, methodology_version: str, generated_at: str
) -> pd.DataFrame:
    frame = pd.concat(result_frames, ignore_index=True)
    generated = pd.to_datetime(generated_at, utc=True)
    return pd.DataFrame(
        {
            "player_id": frame["player_id"],
            "season": frame["season"].astype(int),
            "sample_status": frame["sample_status"],
            "keeperiq": frame.get("keeperiq"),
            "adjusted_total_p96": frame.get(f"adj_{TOTAL_KEY}_p96"),
            "observed_total_p96": frame.get(f"ga_{TOTAL_KEY}_p96"),
            "reliability_total": frame.get(f"reliability_{TOTAL_KEY}"),
            "interval_low": frame.get("adj_total_p96_low"),
            "interval_high": frame.get("adj_total_p96_high"),
            "rank_adjusted": frame.get("rank_adjusted"),
            "rank_observed": frame.get("rank_observed"),
            "rank_goals_conceded": frame.get("rank_goals_conceded"),
            "rank_disagreement": frame.get("rank_disagreement"),
            "archetype_label": frame.get("archetype_label"),
            "changed_teams": frame.get("changed_teams"),
            "methodology_version": methodology_version,
            "generated_at": generated,
        }
    )


def _talent_frame(
    talent: pd.DataFrame, *, methodology_version: str, generated_at: str
) -> pd.DataFrame:
    generated = pd.to_datetime(generated_at, utc=True)
    return pd.DataFrame(
        {
            "player_id": talent["player_id"],
            "talent_total_p96": talent.get("talent_total_p96"),
            "talent_low": talent.get("talent_total_p96_low"),
            "talent_high": talent.get("talent_total_p96_high"),
            "talent_sd": talent.get("talent_posterior_sd"),
            "talent_percentile": talent.get("talent_percentile"),
            "talent_rank": talent.get("talent_rank"),
            "weight_league_prior": talent.get("weight_prior_league"),
            "weight_prior_season": talent.get("weight_prior_season"),
            "weight_live_season": talent.get("weight_live_season"),
            "prior_season_rate": talent.get("prior_season_rate"),
            "live_season_rate": talent.get("live_season_rate"),
            "prior_season_minutes": talent.get("prior_season_minutes"),
            "live_season_minutes": talent.get("live_season_minutes"),
            "league_prior_rate": talent.get("league_prior_rate"),
            "prior_source": talent.get("prior_source"),
            "in_live_season": talent.get("in_live_season"),
            "methodology_version": methodology_version,
            "generated_at": generated,
        }
    )


def _snapshots_frame(cfg: Config) -> pd.DataFrame:
    root = cfg.path_for("snapshot_dir")
    records: list[dict[str, Any]] = []
    for season in (cfg.final_season, cfg.live_season):
        directory = root / f"season-{season}"
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            captured = pd.to_datetime(payload.get("captured_at"), utc=True)
            max_date = pd.to_datetime(payload.get("max_match_date"), errors="coerce")
            max_date_value = None if pd.isna(max_date) else max_date.date()
            for entry in payload.get("entries", []):
                records.append(
                    {
                        "season": int(payload["season"]),
                        "captured_at": captured,
                        "source_fingerprint": payload.get("source_fingerprint"),
                        "max_match_date": max_date_value,
                        "methodology_version": payload.get("methodology_version"),
                        "player_id": entry["player_id"],
                        "slug": entry.get("slug"),
                        "rank_adjusted": entry.get("rank"),
                        "keeperiq": entry.get("keeperiq"),
                        "adj_total_p96": entry.get("adj_total_p96"),
                        "minutes": entry.get("minutes"),
                    }
                )
    return pd.DataFrame(records)


def _nan_to_none(frame: pd.DataFrame) -> pd.DataFrame:
    """Convert NaN/NA to None so DuckDB nullable columns stay honest."""
    if frame.empty:
        return frame
    cleaned = frame.copy()
    cleaned = cleaned.replace({np.nan: None})
    # pandas NA / NaT
    for column in cleaned.columns:
        cleaned[column] = cleaned[column].where(pd.notna(cleaned[column]), None)
    return cleaned


def load_database(
    cfg: Config,
    data: CanonicalData,
    *,
    final_frame: pd.DataFrame,
    live_frame: pd.DataFrame,
    match_frames: list[pd.DataFrame],
    talent: pd.DataFrame,
    status: dict[str, Any],
    generated_at: str,
    db_path: Path | None = None,
) -> DatabaseLoadResult:
    """Rebuild the DuckDB database from the current pipeline artefacts."""
    path = db_path or default_db_path(cfg)
    refresh_id = uuid.uuid4().hex[:12]
    con = connect(path)
    try:
        apply_schema(con)

        season_frames = [final_frame, live_frame]
        matches = _matches_frame(data)
        match_stats = _match_stats_frame(
            pd.concat(match_frames, ignore_index=True) if match_frames else pd.DataFrame()
        )
        season_stats = _season_stats_frame(season_frames)
        tables = {
            "teams": _teams_frame(data, matches, match_stats, season_stats, *season_frames),
            "players": _players_frame(data),
            "matches": matches,
            "goalkeeper_season_stats": season_stats,
            "goalkeeper_match_stats": match_stats,
            "goalkeeper_components": _components_frame(cfg, season_frames),
            "keeperiq_ratings": _ratings_frame(
                season_frames,
                methodology_version=cfg.methodology_version,
                generated_at=generated_at,
            ),
            "talent_estimates": _talent_frame(
                talent,
                methodology_version=cfg.methodology_version,
                generated_at=generated_at,
            ),
            "ranking_snapshots": _snapshots_frame(cfg),
        }

        # Preserve scrape tables across rebuilds. Delete children before parents
        # so foreign keys stay satisfied during the reload.
        delete_order = [
            "ranking_snapshots",
            "talent_estimates",
            "keeperiq_ratings",
            "goalkeeper_components",
            "goalkeeper_match_stats",
            "goalkeeper_season_stats",
            "matches",
            "players",
            "teams",
            "data_refreshes",
        ]
        for table in delete_order:
            con.execute(f"DELETE FROM {table}")
        insert_order = [
            "teams",
            "players",
            "matches",
            "goalkeeper_season_stats",
            "goalkeeper_match_stats",
            "goalkeeper_components",
            "keeperiq_ratings",
            "talent_estimates",
            "ranking_snapshots",
        ]
        for table in insert_order:
            frame = _nan_to_none(tables[table])
            if frame.empty:
                continue
            con.register("_load_frame", frame)
            con.execute(f"INSERT INTO {table} SELECT * FROM _load_frame")
            con.unregister("_load_frame")

        refresh = pd.DataFrame(
            [
                {
                    "refresh_id": refresh_id,
                    "attempted_at": pd.to_datetime(status.get("last_attempted_update"), utc=True),
                    "successful_at": pd.to_datetime(status.get("last_successful_update"), utc=True),
                    "generated_at": pd.to_datetime(generated_at, utc=True),
                    "data_is_current": bool(status.get("data_is_current")),
                    "validation_status": status.get("validation_status"),
                    "source_fingerprint": status.get("source_fingerprint"),
                    "methodology_version": cfg.methodology_version,
                    "network_error_count": len(status.get("network_errors") or []),
                    "notes": status.get("fallback_reason"),
                }
            ]
        )
        con.execute("DELETE FROM data_refreshes")
        con.register("_refresh", refresh)
        con.execute("INSERT INTO data_refreshes SELECT * FROM _refresh")
        con.unregister("_refresh")

        quality = run_data_quality(con)
        error_count = sum(1 for issue in quality if issue["severity"] == "error")
        if error_count:
            raise RuntimeError(
                "DuckDB data-quality checks failed with "
                f"{error_count} error(s): {quality[:5]}"
            )

        counts = {
            table: int(con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in [
                "teams",
                "players",
                "matches",
                "goalkeeper_season_stats",
                "goalkeeper_match_stats",
                "goalkeeper_components",
                "keeperiq_ratings",
                "talent_estimates",
                "ranking_snapshots",
                "data_refreshes",
                "scraped_rosters",
                "scrape_runs",
            ]
        }
        LOG.info("DuckDB loaded at %s :: %s", path, counts)
        return DatabaseLoadResult(
            path=path, refresh_id=refresh_id, table_counts=counts, quality_issues=quality
        )
    finally:
        con.close()


def upsert_scraped_rosters(
    cfg: Config,
    *,
    scrape_run: dict[str, Any],
    roster_rows: list[dict[str, Any]],
    db_path: Path | None = None,
) -> None:
    """Append scrape audit + roster rows without rebuilding modelled tables."""
    path = db_path or default_db_path(cfg)
    con = connect(path)
    try:
        apply_schema(con)
        run_frame = _nan_to_none(pd.DataFrame([scrape_run]))
        roster_frame = _nan_to_none(pd.DataFrame(roster_rows))
        con.register("_scrape_run", run_frame)
        con.execute("INSERT INTO scrape_runs SELECT * FROM _scrape_run")
        con.unregister("_scrape_run")
        if not roster_frame.empty:
            con.register("_scraped", roster_frame)
            con.execute("INSERT INTO scraped_rosters SELECT * FROM _scraped")
            con.unregister("_scraped")
        LOG.info(
            "Stored scrape run %s with %d roster rows",
            scrape_run["scrape_run_id"],
            len(roster_rows),
        )
    finally:
        con.close()
