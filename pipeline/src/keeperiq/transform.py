"""Transform raw ASA payloads into the canonical KeeperIQ tables.

Two long-format frames come out of this stage:

``seasons``  one row per goalkeeper-season
``matches``  one row per goalkeeper-match

Both carry every component's Goals Added value and opportunity count in wide
columns, plus the traditional shot-volume metrics. Missing performance values
stay missing: they are never coerced to zero unless zero is the semantically
correct value (for example, "zero claim attempts" really is zero attempts).
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd

from .config import Config
from .fetch import FetchResult
from .logging_utils import get_logger
from .schema import (
    SchemaError,
    build_slugs,
    validate_action_types,
    validate_payload,
)

LOG = get_logger("transform")


@dataclass
class ValidationIssue:
    """A single non-fatal data-quality observation, surfaced on /data-status."""

    severity: str
    check: str
    detail: str


@dataclass
class CanonicalData:
    seasons: pd.DataFrame
    matches: pd.DataFrame
    players: pd.DataFrame
    teams: pd.DataFrame
    games: pd.DataFrame
    issues: list[ValidationIssue] = field(default_factory=list)

    def add_issue(self, severity: str, check: str, detail: str) -> None:
        self.issues.append(ValidationIssue(severity=severity, check=check, detail=detail))


def _to_float(value: Any) -> float | None:
    """Parse a source number, mapping absent/NaN to ``None`` rather than zero."""
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(parsed):
        return None
    return parsed


def _to_int(value: Any) -> int | None:
    parsed = _to_float(value)
    return None if parsed is None else round(parsed)


def _component_columns(cfg: Config, row_data: list[dict[str, Any]]) -> dict[str, Any]:
    """Flatten the source ``data`` array into canonical wide columns."""
    mapping = cfg.action_type_to_key
    out: dict[str, Any] = {}
    for key in cfg.component_keys:
        out[f"ga_{key}"] = np.nan
        out[f"ga_raw_{key}"] = np.nan
        out[f"opp_{key}"] = np.nan
    value_field = cfg.primary_value_field
    for action in row_data or []:
        key = mapping.get(str(action.get("action_type")))
        if key is None:
            continue
        value = _to_float(action.get(value_field))
        raw = _to_float(action.get("goals_added_raw"))
        opportunities = _to_int(action.get("count_actions"))
        out[f"ga_{key}"] = np.nan if value is None else value
        out[f"ga_raw_{key}"] = np.nan if raw is None else raw
        # A count of zero is semantically meaningful ("no claim attempts"), so it
        # is kept as zero; only a genuinely absent count becomes missing.
        out[f"opp_{key}"] = np.nan if opportunities is None else opportunities
    return out


def _build_teams(rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(
        [
            {
                "team_id": str(row["team_id"]),
                "team_name": str(row["team_name"]).strip(),
                "team_abbreviation": str(row.get("team_abbreviation") or "").strip(),
                "team_short_name": str(row.get("team_short_name") or row["team_name"]).strip(),
            }
            for row in rows
        ]
    )
    return frame.drop_duplicates(subset=["team_id"]).reset_index(drop=True)


def _build_players(rows: list[dict[str, Any]]) -> pd.DataFrame:
    records: dict[str, dict[str, Any]] = {}
    for row in rows:
        player_id = str(row["player_id"])
        name = str(row.get("player_name") or "").strip()
        if not name:
            continue
        # The source can repeat a player id; last non-empty wins deterministically
        # after sorting, which keeps the output stable between runs.
        records[player_id] = {
            "player_id": player_id,
            "player_name": name,
            "birth_date": (str(row["birth_date"]) if row.get("birth_date") else None),
            "nationality": (str(row["nationality"]) if row.get("nationality") else None),
            "height_ft": _to_int(row.get("height_ft")),
            "height_in": _to_int(row.get("height_in")),
        }
    frame = pd.DataFrame(sorted(records.values(), key=lambda r: r["player_id"]))
    slugs = build_slugs({r["player_id"]: r["player_name"] for r in records.values()})
    frame["slug"] = frame["player_id"].map(slugs)
    return frame


def _parse_game_date(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).replace(" UTC", "")
    parsed = pd.to_datetime(text, utc=True, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y-%m-%d")


def _build_games(rows: list[dict[str, Any]], season: int) -> pd.DataFrame:
    records = []
    for row in rows:
        records.append(
            {
                "game_id": str(row["game_id"]),
                "season": season,
                "date_utc": _parse_game_date(row.get("date_time_utc")),
                "home_team_id": str(row.get("home_team_id") or ""),
                "away_team_id": str(row.get("away_team_id") or ""),
                "matchday": _to_int(row.get("matchday")),
                "status": str(row.get("status") or ""),
                "home_score": _to_int(row.get("home_score")),
                "away_score": _to_int(row.get("away_score")),
            }
        )
    return pd.DataFrame(records)


def _merge_xgoals(
    frame: pd.DataFrame, xg_rows: list[dict[str, Any]], keys: list[str]
) -> pd.DataFrame:
    records = []
    for row in xg_rows:
        record: dict[str, Any] = {
            "player_id": str(row["player_id"]),
            "shots_faced": _to_int(row.get("shots_faced")),
            "goals_conceded": _to_int(row.get("goals_conceded")),
            "saves": _to_int(row.get("saves")),
            "xgoals_faced": _to_float(row.get("xgoals_gk_faced")),
            "share_headed_shots": _to_float(row.get("share_headed_shots")),
        }
        if "game_id" in keys:
            record["game_id"] = str(row["game_id"])
        records.append(record)
    xg = pd.DataFrame(records)
    if xg.empty:
        for column in ("shots_faced", "goals_conceded", "saves", "xgoals_faced", "share_headed_shots"):
            frame[column] = np.nan
        return frame
    xg = xg.drop_duplicates(subset=keys, keep="first")
    return frame.merge(xg, on=keys, how="left", validate="one_to_one")


def _season_frame(
    cfg: Config,
    ga_rows: list[dict[str, Any]],
    xg_rows: list[dict[str, Any]],
    season: int,
    data: CanonicalData | None = None,
) -> pd.DataFrame:
    records = []
    for row in ga_rows:
        record: dict[str, Any] = {
            "player_id": str(row["player_id"]),
            "season": season,
            "team_id": str(row.get("team_id") or ""),
            "minutes": _to_float(row.get("minutes_played")) or 0.0,
        }
        record.update(_component_columns(cfg, row.get("data") or []))
        records.append(record)
    frame = pd.DataFrame(records)
    # Duplicates must be resolved before the merge, both so the join stays
    # one-to-one and so a repeated upstream row cannot double a keeper's totals.
    frame = _check_duplicates(data, frame, ["player_id", "season"], "player-season")
    return _merge_xgoals(frame, xg_rows, ["player_id"])


def _match_frame(
    cfg: Config,
    ga_rows: list[dict[str, Any]],
    xg_rows: list[dict[str, Any]],
    season: int,
    data: CanonicalData | None = None,
) -> pd.DataFrame:
    records = []
    for row in ga_rows:
        record: dict[str, Any] = {
            "player_id": str(row["player_id"]),
            "season": season,
            "game_id": str(row["game_id"]),
            "team_id": str(row.get("team_id") or ""),
            "minutes": _to_float(row.get("minutes_played")) or 0.0,
        }
        record.update(_component_columns(cfg, row.get("data") or []))
        records.append(record)
    frame = pd.DataFrame(records)
    frame = _check_duplicates(data, frame, ["player_id", "game_id"], "player-match")
    return _merge_xgoals(frame, xg_rows, ["player_id", "game_id"])


def _check_duplicates(
    data: CanonicalData | None, frame: pd.DataFrame, keys: list[str], label: str
) -> pd.DataFrame:
    if frame.empty:
        return frame
    duplicated = frame.duplicated(subset=keys, keep=False)
    count = int(duplicated.sum())
    if count:
        examples = (
            frame.loc[duplicated, keys].astype(str).agg("/".join, axis=1).unique()[:5].tolist()
        )
        if data is not None:
            data.add_issue(
                "warning",
                f"duplicate_{label}",
                f"{count} duplicate {label} rows collapsed to the first occurrence "
                f"(examples: {examples}).",
            )
        LOG.warning("Collapsed %d duplicate %s rows", count, label)
        return frame.drop_duplicates(subset=keys, keep="first").reset_index(drop=True)
    return frame


def build_canonical(
    cfg: Config,
    fetched: FetchResult,
    *,
    seasons: Iterable[int] | None = None,
    required_seasons: Collection[int] | None = None,
) -> CanonicalData:
    """Validate raw payloads and assemble the canonical frames.

    ``required_seasons`` defaults to the two seasons the product cannot render
    without; a missing payload for any of them is fatal, while a missing history
    season only reduces the data available for reliability estimation.
    """
    season_list = list(cfg.all_seasons if seasons is None else seasons)
    required = set(
        (cfg.final_season, cfg.live_season) if required_seasons is None else required_seasons
    )
    teams_raw = fetched.require("teams")
    players_raw = fetched.require("players")
    validate_payload("teams", teams_raw, context="teams")
    validate_payload("players", players_raw, context="players")

    teams = _build_teams(teams_raw)
    players = _build_players(players_raw)

    season_frames: list[pd.DataFrame] = []
    match_frames: list[pd.DataFrame] = []
    game_frames: list[pd.DataFrame] = []
    data = CanonicalData(
        seasons=pd.DataFrame(),
        matches=pd.DataFrame(),
        players=players,
        teams=teams,
        games=pd.DataFrame(),
    )

    for season in season_list:
        core = season in required
        ga_key = f"gk_goals_added:{season}"
        xg_key = f"gk_xgoals:{season}"
        if ga_key not in fetched.payloads or xg_key not in fetched.payloads:
            if core:
                raise SchemaError(
                    f"Season {season} is a core product season but its goalkeeper payloads "
                    "are unavailable."
                )
            data.add_issue(
                "info",
                "missing_history_season",
                f"Season {season} goalkeeper data unavailable; excluded from reliability estimation.",
            )
            continue

        ga_rows = fetched.payloads[ga_key]
        xg_rows = fetched.payloads[xg_key]
        validate_payload("gk_goals_added", ga_rows, context=f"season {season}")
        validate_payload("gk_xgoals", xg_rows, context=f"season {season}")
        validate_action_types(cfg, ga_rows, context=f"season {season}")
        season_frames.append(_season_frame(cfg, ga_rows, xg_rows, season, data))

        games_key = f"games:{season}"
        if games_key in fetched.payloads:
            games_rows = fetched.payloads[games_key]
            validate_payload("games", games_rows, context=f"games {season}")
            game_frames.append(_build_games(games_rows, season))

        mga_key = f"gk_goals_added_games:{season}"
        mxg_key = f"gk_xgoals_games:{season}"
        if mga_key in fetched.payloads and mxg_key in fetched.payloads:
            mga_rows = fetched.payloads[mga_key]
            mxg_rows = fetched.payloads[mxg_key]
            validate_payload("gk_goals_added_games", mga_rows, context=f"matches {season}")
            validate_payload("gk_xgoals_games", mxg_rows, context=f"matches {season}")
            validate_action_types(cfg, mga_rows, context=f"matches {season}")
            match_frames.append(_match_frame(cfg, mga_rows, mxg_rows, season, data))
        elif core:
            data.add_issue(
                "warning",
                "missing_match_level",
                f"Match-level goalkeeper data unavailable for {season}; bootstrap intervals "
                "and rolling form are suppressed for that season.",
            )

    if not season_frames:
        raise SchemaError("No goalkeeper season data could be assembled from the source.")

    seasons = pd.concat(season_frames, ignore_index=True)
    matches = (
        pd.concat(match_frames, ignore_index=True)
        if match_frames
        else pd.DataFrame(columns=["player_id", "season", "game_id", "team_id", "minutes"])
    )
    games = pd.concat(game_frames, ignore_index=True) if game_frames else pd.DataFrame()

    # Guard against a duplicate that only appears once seasons are concatenated.
    seasons = _check_duplicates(data, seasons, ["player_id", "season"], "player-season")
    matches = _check_duplicates(data, matches, ["player_id", "game_id"], "player-match")

    # Attach names, slugs, and match dates.
    seasons = seasons.merge(
        players[["player_id", "player_name", "slug", "nationality", "birth_date"]],
        on="player_id",
        how="left",
    )
    unnamed = seasons["player_name"].isna()
    if unnamed.any():
        missing_ids = seasons.loc[unnamed, "player_id"].tolist()
        data.add_issue(
            "warning",
            "player_metadata_missing",
            f"{len(missing_ids)} goalkeeper(s) had no entry in the players endpoint and are "
            f"labelled by id: {missing_ids[:5]}",
        )
        seasons.loc[unnamed, "player_name"] = "Unknown (" + seasons.loc[unnamed, "player_id"] + ")"
        seasons.loc[unnamed, "slug"] = "unknown-" + seasons.loc[unnamed, "player_id"].str.lower()

    if not matches.empty and not games.empty:
        matches = matches.merge(
            games[["game_id", "date_utc", "matchday"]], on="game_id", how="left"
        )
        undated = int(matches["date_utc"].isna().sum())
        if undated:
            data.add_issue(
                "warning",
                "match_dates_missing",
                f"{undated} goalkeeper-match rows could not be matched to a game date.",
            )
    elif not matches.empty:
        matches["date_utc"] = None
        matches["matchday"] = np.nan

    _validate_minutes(data, seasons, matches)
    _validate_component_reconciliation(cfg, data, seasons)

    data.seasons = seasons.sort_values(["season", "player_id"]).reset_index(drop=True)
    data.matches = (
        matches.sort_values(["season", "player_id", "date_utc"]).reset_index(drop=True)
        if not matches.empty
        else matches
    )
    data.games = games
    LOG.info(
        "Canonical data: %d goalkeeper-seasons, %d goalkeeper-matches, %d players, %d teams",
        len(data.seasons),
        len(data.matches),
        len(data.players),
        len(data.teams),
    )
    return data


def _validate_minutes(data: CanonicalData, seasons: pd.DataFrame, matches: pd.DataFrame) -> None:
    zero_minutes = int((seasons["minutes"] <= 0).sum())
    if zero_minutes:
        data.add_issue(
            "info",
            "zero_minute_seasons",
            f"{zero_minutes} goalkeeper-season row(s) have zero minutes and are excluded from "
            "all rate calculations.",
        )
    if matches.empty:
        return
    for season, group in matches.groupby("season"):
        totals = group.groupby("player_id")["minutes"].sum()
        season_totals = seasons.loc[seasons["season"] == season].set_index("player_id")["minutes"]
        shared = totals.index.intersection(season_totals.index)
        if not len(shared):
            continue
        delta = (totals.loc[shared] - season_totals.loc[shared]).abs()
        # Season totals and the sum of match minutes can differ by a minute or two
        # because of how stoppage time is apportioned; a large gap is a real problem.
        bad = delta[delta > 5]
        if len(bad):
            data.add_issue(
                "warning",
                "minutes_reconciliation",
                f"{len(bad)} goalkeeper(s) in {season} have match minutes differing from the "
                f"season total by more than 5 (max gap {bad.max():.0f}).",
            )


def _validate_component_reconciliation(
    cfg: Config, data: CanonicalData, seasons: pd.DataFrame
) -> None:
    """Cross-check shot-stopping G+ against the independent xGoals endpoint.

    The source does not publish a goalkeeper Total G+ field, so Total is defined
    here as the sum of the six components. What we *can* reconcile is the raw
    shot-stopping value, which should equal ``xgoals faced - goals conceded``
    from a different endpoint. A mismatch means the two feeds have drifted apart.
    """
    if "ga_raw_shot_stopping" not in seasons.columns:
        return
    subset = seasons.dropna(subset=["ga_raw_shot_stopping", "xgoals_faced", "goals_conceded"])
    if subset.empty:
        data.add_issue(
            "warning",
            "shot_stopping_reconciliation",
            "No rows had both Goals Added and xGoals fields available for cross-validation.",
        )
        return
    implied = subset["xgoals_faced"] - subset["goals_conceded"]
    delta = (subset["ga_raw_shot_stopping"] - implied).abs()
    tolerance = 0.05
    breaches = int((delta > tolerance).sum())
    if breaches:
        data.add_issue(
            "warning",
            "shot_stopping_reconciliation",
            f"{breaches}/{len(subset)} goalkeeper-seasons where raw shot-stopping G+ differs "
            f"from (xG faced - goals conceded) by more than {tolerance} "
            f"(max {delta.max():.3f}).",
        )
    else:
        data.add_issue(
            "ok",
            "shot_stopping_reconciliation",
            f"All {len(subset)} goalkeeper-seasons reconcile raw shot-stopping G+ with "
            f"(xG faced - goals conceded) within {tolerance} goals.",
        )
    _ = cfg
