"""Pipeline orchestration: raw payloads in, site-ready JSON out."""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .clustering import build_archetypes
from .config import Config
from .database import load_database
from .fetch import FetchResult, fetch_all
from .logging_utils import get_logger
from .profiles import build_notes
from .rates import TOTAL_KEY, add_rates, add_traditional_metrics
from .ratings import (
    SAMPLE_LABELS,
    add_ratings,
    assign_sample_status,
    percentile_against,
    qualification_rule,
)
from .reliability import (
    ReliabilityModel,
    apply_shrinkage,
    build_league_baseline,
    estimate_reliability,
)
from .snapshots import (
    build_snapshot,
    load_latest_snapshot,
    rank_movement,
    ranking_history,
    write_snapshot,
)
from .talent import estimate_current_talent, talent_context
from .transform import CanonicalData, build_canonical
from .uncertainty import BootstrapSettings, bootstrap_season, talent_interval

LOG = get_logger("build")

SCHEMA_VERSION = "1"


def _round(value: Any, digits: int) -> float | None:
    """Round for display, mapping every flavour of missing to ``None``."""
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number, digits)


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number)


def _str_or_none(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if value is pd.NA or value is pd.NaT:
        return None
    text = str(value)
    return text if text and text.lower() != "nan" else None


def _parse_date(value: Any) -> date | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _str_or_none(value)
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def _age_years(birth_date: Any, as_of: str | None) -> int | None:
    """Whole years of age as of ``as_of`` (ISO date), or ``None`` if unknown."""
    born = _parse_date(birth_date)
    reference = _parse_date(as_of)
    if born is None or reference is None:
        return None
    years = reference.year - born.year
    if (reference.month, reference.day) < (born.month, born.day):
        years -= 1
    return years if years >= 0 else None


@dataclass
class SeasonResult:
    season: int
    frame: pd.DataFrame
    rule: Any
    max_match_date: str | None
    matches: pd.DataFrame
    baseline: Any


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def source_fingerprint(fetched: FetchResult) -> str:
    """A stable hash of every raw payload, used to decide if anything changed."""
    digest = hashlib.sha256()
    for record in sorted(fetched.records, key=lambda r: r.resource):
        digest.update(record.resource.encode("utf-8"))
        digest.update(record.content_sha256.encode("utf-8"))
    return digest.hexdigest()


# ---------------------------------------------------------------------------
# Season assembly
# ---------------------------------------------------------------------------


def prepare_season(
    cfg: Config, data: CanonicalData, season: int, model: ReliabilityModel
) -> SeasonResult:
    seasons = add_rates(cfg, data.seasons[data.seasons["season"] == season].copy())
    if seasons.empty:
        raise ValueError(f"No goalkeeper rows available for season {season}.")
    seasons = add_traditional_metrics(seasons, cfg.minutes_basis)

    # Sample status depends only on minutes, so the reference pool can be
    # resolved before any modelling and used as the season's regression target.
    rule = qualification_rule(cfg, season, seasons)
    pool_statuses = [str(s) for s in cfg.section("qualification", "reference_pool")]
    pool_mask = assign_sample_status(seasons, rule).isin(pool_statuses)
    baseline = build_league_baseline(
        cfg,
        seasons,
        model,
        season=season,
        pool_mask=pool_mask,
        pool_statuses=pool_statuses,
    )

    seasons = apply_shrinkage(cfg, seasons, model, baseline)
    seasons = add_ratings(cfg, seasons, rule)

    teams = data.teams.set_index("team_id")
    seasons["team_name"] = seasons["team_id"].map(teams["team_name"])
    seasons["team_abbreviation"] = seasons["team_id"].map(teams["team_abbreviation"])
    seasons["team_short_name"] = seasons["team_id"].map(teams["team_short_name"])

    matches = (
        add_rates(cfg, data.matches[data.matches["season"] == season].copy())
        if not data.matches.empty
        else pd.DataFrame()
    )
    if not matches.empty:
        matches = add_traditional_metrics(matches, cfg.minutes_basis)
        matches = apply_shrinkage(cfg, matches, model, baseline)

    max_match_date = None
    if not matches.empty and matches["date_utc"].notna().any():
        max_match_date = str(matches["date_utc"].dropna().max())

    # Goalkeepers who changed clubs mid-season: the season endpoint reports a
    # single team, so the real stint list is reconstructed from match data.
    seasons["team_stints"] = seasons["player_id"].map(
        _team_stints(matches, data.teams) if not matches.empty else {}
    )
    seasons["changed_teams"] = seasons["team_stints"].apply(
        lambda stints: bool(stints) and len(stints) > 1
    )
    # Display the club a goalkeeper most recently played for.
    latest = seasons["team_stints"].apply(
        lambda stints: stints[-1] if isinstance(stints, list) and stints else None
    )
    seasons["current_team_name"] = [
        stint["team_name"] if stint else row
        for stint, row in zip(latest, seasons["team_name"], strict=True)
    ]
    seasons["current_team_abbreviation"] = [
        stint["team_abbreviation"] if stint else row
        for stint, row in zip(latest, seasons["team_abbreviation"], strict=True)
    ]

    settings = BootstrapSettings.from_config(cfg)
    intervals = bootstrap_season(cfg, seasons, matches, model, settings, baseline)
    if not intervals.empty:
        seasons = seasons.merge(intervals, on="player_id", how="left")
    else:
        for column in (
            "adj_total_p96_low",
            "adj_total_p96_high",
            "adj_total_p96_se",
            "observed_total_p96_low",
            "observed_total_p96_high",
            "observed_total_p96_se",
            "bootstrap_reliability",
            "bootstrap_resamples",
        ):
            seasons[column] = np.nan

    seasons["appearances"] = seasons["player_id"].map(
        matches.groupby("player_id").size().to_dict() if not matches.empty else {}
    )

    # Project the adjusted-rate interval onto the KeeperIQ percentile scale using
    # the same reference distribution, so the two always agree.
    pool = seasons[seasons["in_reference_pool"]].dropna(subset=[f"adj_{TOTAL_KEY}_p96"])
    reference = pool[f"adj_{TOTAL_KEY}_p96"].to_numpy(dtype=float)
    reference_weights = pool["minutes"].to_numpy(dtype=float)
    for bound, target in (
        ("adj_total_p96_low", "keeperiq_low"),
        ("adj_total_p96_high", "keeperiq_high"),
    ):
        seasons[target] = percentile_against(seasons[bound], reference, reference_weights)

    return SeasonResult(
        season=season,
        frame=seasons.sort_values(["rank_adjusted", "player_id"]).reset_index(drop=True),
        rule=rule,
        max_match_date=max_match_date,
        matches=matches,
        baseline=baseline,
    )


def _team_stints(matches: pd.DataFrame, teams: pd.DataFrame) -> dict[str, list[dict[str, Any]]]:
    """Ordered club stints per goalkeeper, derived from match appearances."""
    lookup = teams.set_index("team_id")
    stints: dict[str, list[dict[str, Any]]] = {}
    ordered = matches.sort_values(["player_id", "date_utc", "game_id"], kind="stable")
    for player_id, group in ordered.groupby("player_id", sort=True):
        entries: list[dict[str, Any]] = []
        for _, row in group.iterrows():
            team_id = str(row["team_id"])
            if entries and entries[-1]["team_id"] == team_id:
                entries[-1]["appearances"] += 1
                entries[-1]["minutes"] += float(row["minutes"])
                entries[-1]["last_match"] = _str_or_none(row.get("date_utc"))
                continue
            entries.append(
                {
                    "team_id": team_id,
                    "team_name": str(lookup["team_name"].get(team_id, "Unknown")),
                    "team_abbreviation": str(lookup["team_abbreviation"].get(team_id, "")),
                    "appearances": 1,
                    "minutes": float(row["minutes"]),
                    "first_match": _str_or_none(row.get("date_utc")),
                    "last_match": _str_or_none(row.get("date_utc")),
                }
            )
        for entry in entries:
            entry["minutes"] = round(entry["minutes"], 1)
        stints[str(player_id)] = entries
    return stints


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------


def _component_payload(cfg: Config, row: pd.Series) -> dict[str, dict[str, Any]]:
    payload: dict[str, dict[str, Any]] = {}
    for spec in cfg.components:
        payload[spec.key] = {
            "observed_p96": _round(row.get(f"ga_{spec.key}_p96"), 3),
            "adjusted_p96": _round(row.get(f"adj_{spec.key}_p96"), 3),
            "baseline_p96": _round(row.get(f"baseline_{spec.key}_p96"), 3),
            "total": _round(row.get(f"ga_{spec.key}"), 3),
            "raw_total": _round(row.get(f"ga_raw_{spec.key}"), 3),
            "percentile": _round(row.get(f"pct_adj_{spec.key}"), 1),
            "observed_percentile": _round(row.get(f"pct_ga_{spec.key}"), 1),
            "opportunities": _int_or_none(row.get(f"opp_{spec.key}")),
            "opportunities_p96": _round(row.get(f"opp_{spec.key}_p96"), 2),
            "reliability": _round(row.get(f"reliability_{spec.key}"), 3),
        }
    return payload


def _row_payload(cfg: Config, row: pd.Series, *, as_of: str | None = None) -> dict[str, Any]:
    birth_date = _str_or_none(row.get("birth_date"))
    if birth_date and len(birth_date) >= 10:
        birth_date = birth_date[:10]
    return {
        "player_id": str(row["player_id"]),
        "slug": str(row["slug"]),
        "name": str(row["player_name"]),
        "season": int(row["season"]),
        "team_id": _str_or_none(row.get("team_id")),
        "team": _str_or_none(row.get("current_team_name")) or _str_or_none(row.get("team_name")),
        "team_abbreviation": _str_or_none(row.get("current_team_abbreviation"))
        or _str_or_none(row.get("team_abbreviation")),
        "changed_teams": bool(row.get("changed_teams", False)),
        "nationality": _str_or_none(row.get("nationality")),
        "birth_date": birth_date,
        "age": _age_years(row.get("birth_date"), as_of),
        "minutes": _round(row.get("minutes"), 0),
        "appearances": _int_or_none(row.get("appearances")),
        "sample_status": str(row["sample_status"]),
        "sample_status_label": str(row["sample_status_label"]),
        "keeperiq": _round(row.get("keeperiq"), 1),
        "adjusted_total_p96": _round(row.get(f"adj_{TOTAL_KEY}_p96"), 2),
        "observed_total_p96": _round(row.get(f"ga_{TOTAL_KEY}_p96"), 2),
        "baseline_total_p96": _round(row.get(f"baseline_{TOTAL_KEY}_p96"), 2),
        "adjusted_total": _round(row.get(f"ga_{TOTAL_KEY}"), 2),
        "reliability": _round(row.get(f"reliability_{TOTAL_KEY}"), 3),
        "interval_low": _round(row.get("adj_total_p96_low"), 2),
        "interval_high": _round(row.get("adj_total_p96_high"), 2),
        "interval_se": _round(row.get("adj_total_p96_se"), 3),
        "observed_interval_low": _round(row.get("observed_total_p96_low"), 2),
        "observed_interval_high": _round(row.get("observed_total_p96_high"), 2),
        "keeperiq_low": _round(row.get("keeperiq_low"), 1),
        "keeperiq_high": _round(row.get("keeperiq_high"), 1),
        "rank": _int_or_none(row.get("rank_adjusted")),
        "rank_observed": _int_or_none(row.get("rank_observed")),
        "rank_goals_conceded": _int_or_none(row.get("rank_goals_conceded")),
        "rank_pool": _int_or_none(row.get("rank_adjusted_pool")),
        "rank_goals_conceded_pool": _int_or_none(row.get("rank_goals_conceded_pool")),
        "rank_disagreement": _int_or_none(row.get("rank_disagreement")),
        "goals_conceded": _int_or_none(row.get("goals_conceded")),
        "goals_conceded_p96": _round(row.get("goals_conceded_p96"), 2),
        "shots_faced": _int_or_none(row.get("shots_faced")),
        "shots_faced_p96": _round(row.get("shots_faced_p96"), 2),
        "saves": _int_or_none(row.get("saves")),
        "save_pct": _round(row.get("save_pct"), 1),
        "xgoals_faced": _round(row.get("xgoals_faced"), 2),
        "goals_prevented": _round(row.get("goals_prevented"), 2),
        "goals_prevented_p96": _round(row.get("goals_prevented_p96"), 2),
        "previous_rank": _int_or_none(row.get("previous_rank")),
        "rank_change": _int_or_none(row.get("rank_change")),
        "keeperiq_change": _round(row.get("keeperiq_change"), 1),
        "components": _component_payload(cfg, row),
    }


def _match_timeline(cfg: Config, matches: pd.DataFrame, player_id: str) -> list[dict[str, Any]]:
    if matches.empty:
        return []
    group = matches[matches["player_id"] == player_id].sort_values(
        ["date_utc", "game_id"], kind="stable"
    )
    timeline: list[dict[str, Any]] = []
    running_value = 0.0
    running_minutes = 0.0
    for _, row in group.iterrows():
        value = row.get(f"ga_{TOTAL_KEY}")
        minutes = float(row.get("minutes") or 0.0)
        if pd.notna(value):
            running_value += float(value)
        running_minutes += minutes
        timeline.append(
            {
                "game_id": str(row["game_id"]),
                "date": _str_or_none(row.get("date_utc")),
                "matchday": _int_or_none(row.get("matchday")),
                "minutes": _round(minutes, 0),
                "total_ga": _round(value, 3),
                "total_ga_p96": _round(row.get(f"ga_{TOTAL_KEY}_p96"), 2),
                "rolling_total_ga_p96": _round(
                    running_value / running_minutes * cfg.minutes_basis
                    if running_minutes > 0
                    else None,
                    2,
                ),
                "goals_conceded": _int_or_none(row.get("goals_conceded")),
                "shots_faced": _int_or_none(row.get("shots_faced")),
                "saves": _int_or_none(row.get("saves")),
                "xgoals_faced": _round(row.get("xgoals_faced"), 2),
                "goals_prevented": _round(row.get("goals_prevented"), 2),
                "components": {
                    spec.key: _round(row.get(f"ga_{spec.key}"), 3) for spec in cfg.components
                },
            }
        )
    return timeline


def _rolling_form(timeline: list[dict[str, Any]], window: int = 5) -> list[dict[str, Any]]:
    """Trailing ``window``-match minutes-weighted rate, for the live-season view."""
    form: list[dict[str, Any]] = []
    for index in range(len(timeline)):
        start = max(0, index - window + 1)
        chunk = timeline[start : index + 1]
        minutes = sum(entry["minutes"] or 0 for entry in chunk)
        value = sum(entry["total_ga"] or 0.0 for entry in chunk)
        if minutes <= 0:
            continue
        form.append(
            {
                "date": chunk[-1]["date"],
                "matchday": chunk[-1]["matchday"],
                "matches_in_window": len(chunk),
                "rate_p96": round(value / minutes * 96, 2),
            }
        )
    return form


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def run_pipeline(
    cfg: Config,
    *,
    force: bool = False,
    offline: bool = False,
    write_snapshots: bool = True,
) -> dict[str, Any]:
    """Fetch, model, and write every artefact the site reads."""
    started = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    fetched = fetch_all(cfg, force=force, offline=offline)
    data = build_canonical(cfg, fetched)
    fingerprint = source_fingerprint(fetched)

    all_seasons = add_rates(cfg, data.seasons.copy())
    all_matches = add_rates(cfg, data.matches.copy()) if not data.matches.empty else pd.DataFrame()
    model = estimate_reliability(cfg, all_seasons, all_matches)

    final = prepare_season(cfg, data, cfg.final_season, model)
    live = prepare_season(cfg, data, cfg.live_season, model)

    snapshot_root = cfg.path_for("snapshot_dir")
    previous_live = load_latest_snapshot(snapshot_root, cfg.live_season)
    previous_final = load_latest_snapshot(snapshot_root, cfg.final_season)
    live.frame = rank_movement(live.frame, previous_live)
    final.frame = rank_movement(final.frame, previous_final)

    talent = estimate_current_talent(cfg, final.frame, live.frame, model)
    talent = talent_interval(talent, BootstrapSettings.from_config(cfg))
    talent = _rank_talent(cfg, talent, final.frame, live.frame)

    archetypes = build_archetypes(cfg, final.frame)
    if archetypes is not None:
        final.frame = final.frame.merge(archetypes.assignments, on="player_id", how="left")
    else:
        final.frame["archetype_label"] = None
        final.frame["archetype_cluster"] = np.nan

    live_archetypes = build_archetypes(cfg, live.frame)
    if live_archetypes is not None:
        live.frame = live.frame.merge(live_archetypes.assignments, on="player_id", how="left")
    else:
        live.frame["archetype_label"] = None
        live.frame["archetype_cluster"] = np.nan

    output_dir = cfg.path_for("public_data_dir")
    output_dir.mkdir(parents=True, exist_ok=True)

    season_payloads = {}
    for result in (final, live):
        rows = [
            _row_payload(cfg, row, as_of=result.max_match_date)
            for _, row in result.frame.iterrows()
        ]
        for row, (_, source) in zip(rows, result.frame.iterrows(), strict=True):
            row["archetype"] = _str_or_none(source.get("archetype_label"))
            row["notes"] = build_notes(cfg, source)
        payload = {
            "schema_version": SCHEMA_VERSION,
            "season": result.season,
            "is_live": result.season == cfg.live_season,
            "methodology_version": cfg.methodology_version,
            "generated_at": started,
            "max_match_date": result.max_match_date,
            "qualification": result.rule.to_dict(),
            "counts": _sample_counts(result.frame),
            "league": _league_reference(cfg, result),
            "players": rows,
        }
        write_json(output_dir / f"season-{result.season}.json", payload)
        season_payloads[result.season] = payload

    talent_payload = _talent_payload(cfg, talent, final, live, model, started)
    write_json(output_dir / "talent.json", talent_payload)

    write_json(
        output_dir / "archetypes.json",
        _archetype_payload(cfg, archetypes, live_archetypes, final, live, started),
    )

    _write_player_profiles(
        cfg, output_dir, season_payloads, talent_payload, final, live, snapshot_root
    )

    write_json(
        output_dir / "players-index.json",
        _player_index(season_payloads, talent_payload, cfg),
    )

    write_json(
        output_dir / "methodology.json",
        _methodology_payload(cfg, model, final, live, started),
    )

    comparisons = {
        str(result.season): _traditional_comparison(cfg, result.frame)
        for result in (final, live)
    }
    write_json(output_dir / "comparisons.json", {
        "schema_version": SCHEMA_VERSION,
        "generated_at": started,
        "seasons": comparisons,
    })

    snapshots_written = []
    if write_snapshots:
        for result in (final, live):
            snapshot = build_snapshot(
                result.season,
                result.frame,
                source_fingerprint=fingerprint,
                max_match_date=result.max_match_date,
                methodology_version=cfg.methodology_version,
            )
            path = write_snapshot(
                snapshot_root,
                snapshot,
                max_snapshots=int(cfg.section("output", "max_snapshots_per_season")),
            )
            if path is not None:
                snapshots_written.append(str(path.name))

    status = _status_payload(
        cfg, fetched, data, final, live, fingerprint, started, snapshots_written, model
    )
    write_json(output_dir / "data-status.json", status)

    _write_processed(cfg, final, live, talent)

    db_result = load_database(
        cfg,
        data,
        final_frame=final.frame,
        live_frame=live.frame,
        match_frames=[final.matches, live.matches],
        talent=talent,
        status=status,
        generated_at=started,
    )
    status["database"] = db_result.to_dict()
    write_json(output_dir / "data-status.json", status)

    LOG.info(
        "Build complete: %d goalkeepers in %d, %d in %d, %d talent estimates",
        len(final.frame),
        final.season,
        len(live.frame),
        live.season,
        len(talent),
    )
    return status


def _league_reference(cfg: Config, result: SeasonResult) -> dict[str, Any]:
    """Where "league average" actually sits on this season's KeeperIQ scale.

    KeeperIQ is a percentile, so 50 is by definition the median goalkeeper.
    A goalkeeper with exactly league-average adjusted impact only scores 50 when
    the distribution is symmetric, which a part-season sample rarely is. Rather
    than quietly rescale, the marker is published so charts and the methodology
    page can show it.
    """
    from .ratings import percentile_against

    baseline = result.baseline
    average_rate = sum(
        baseline.value_per_opportunity[key] * baseline.workload_p96[key]
        for key in cfg.component_keys
    )
    pool = result.frame[result.frame["in_reference_pool"]].dropna(
        subset=[f"adj_{TOTAL_KEY}_p96"]
    )
    percentile = percentile_against(
        pd.Series([average_rate]),
        pool[f"adj_{TOTAL_KEY}_p96"].to_numpy(dtype=float),
        pool["minutes"].to_numpy(dtype=float),
    )
    observed = pool[f"ga_{TOTAL_KEY}_p96"]
    adjusted = pool[f"adj_{TOTAL_KEY}_p96"]
    return {
        "average_adjusted_p96": _round(average_rate, 3),
        "average_keeperiq": _round(percentile.iloc[0], 1),
        "pool_size": len(pool),
        "pool_statuses": baseline.pool_statuses,
        "baseline_source": baseline.source,
        "adjusted_median_p96": _round(adjusted.median(), 3),
        "adjusted_min_p96": _round(adjusted.min(), 3),
        "adjusted_max_p96": _round(adjusted.max(), 3),
        "observed_median_p96": _round(observed.median(), 3),
        "observed_min_p96": _round(observed.min(), 3),
        "observed_max_p96": _round(observed.max(), 3),
        "median_goals_conceded_p96": _round(pool["goals_conceded_p96"].median(), 2),
        "median_save_pct": _round(pool["save_pct"].median(), 1),
        "note": (
            "KeeperIQ is a minutes-weighted percentile within the qualified and provisional "
            "pool, so 50 is the median goalkeeper. A goalkeeper with exactly league-average "
            f"adjusted impact ({_round(average_rate, 3)} G+/96) scores "
            f"{_round(percentile.iloc[0], 1)} in this view, because the distribution is not "
            "symmetric."
        ),
    }


def _sample_counts(frame: pd.DataFrame) -> dict[str, int]:
    counts = frame["sample_status"].value_counts().to_dict()
    return {status: int(counts.get(status, 0)) for status in SAMPLE_LABELS}


def _rank_talent(
    cfg: Config, talent: pd.DataFrame, final: pd.DataFrame, live: pd.DataFrame
) -> pd.DataFrame:
    """Attach identity, percentile, and rank to the talent estimates."""
    from .ratings import deterministic_rank, percentile_against

    identity_columns = [
        "player_id",
        "slug",
        "player_name",
        "nationality",
        "birth_date",
        "current_team_name",
        "current_team_abbreviation",
        "sample_status",
    ]
    live_identity = live[identity_columns].copy()
    final_identity = final[identity_columns].copy()
    identity = pd.concat([live_identity, final_identity]).drop_duplicates(
        subset=["player_id"], keep="first"
    )
    talent = talent.merge(identity, on="player_id", how="left")

    # The comparison pool is goalkeepers with real evidence in either season,
    # so a keeper who has not played since 2025 does not distort the scale.
    live_minutes = live.set_index("player_id")["minutes"]
    talent["live_minutes"] = talent["player_id"].map(live_minutes).fillna(0.0)
    prior_minutes = final.set_index("player_id")["minutes"]
    talent["evidence_minutes"] = talent["live_minutes"] + talent["player_id"].map(
        prior_minutes
    ).fillna(0.0)
    has_live = talent["live_minutes"] > 0

    pool = talent.loc[has_live, ["talent_total_p96", "evidence_minutes"]].dropna(
        subset=["talent_total_p96"]
    )
    if len(pool) < 10:
        pool = talent[["talent_total_p96", "evidence_minutes"]].dropna(
            subset=["talent_total_p96"]
        )
    pool_values = pool["talent_total_p96"].to_numpy(dtype=float)
    pool_weights = pool["evidence_minutes"].to_numpy(dtype=float)

    for column, target in (
        ("talent_total_p96", "talent_percentile"),
        ("talent_total_p96_low", "talent_percentile_low"),
        ("talent_total_p96_high", "talent_percentile_high"),
    ):
        talent[target] = percentile_against(talent[column], pool_values, pool_weights)
    talent["talent_rank"] = deterministic_rank(
        talent["talent_total_p96"], talent["player_id"], ascending=False
    )
    talent["in_live_season"] = has_live
    _ = cfg
    return talent.sort_values(["talent_rank", "player_id"]).reset_index(drop=True)


def _talent_payload(
    cfg: Config,
    talent: pd.DataFrame,
    final: SeasonResult,
    live: SeasonResult,
    model: ReliabilityModel,
    generated_at: str,
) -> dict[str, Any]:
    rows = []
    for _, row in talent.iterrows():
        rows.append(
            {
                "player_id": str(row["player_id"]),
                "slug": _str_or_none(row.get("slug")),
                "name": _str_or_none(row.get("player_name")),
                "team": _str_or_none(row.get("current_team_name")),
                "team_abbreviation": _str_or_none(row.get("current_team_abbreviation")),
                "nationality": _str_or_none(row.get("nationality")),
                "birth_date": (
                    birth[:10]
                    if (birth := _str_or_none(row.get("birth_date"))) and len(birth) >= 10
                    else birth
                ),
                "age": _age_years(row.get("birth_date"), live.max_match_date),
                "talent_p96": _round(row.get("talent_total_p96"), 2),
                "talent_low": _round(row.get("talent_total_p96_low"), 2),
                "talent_high": _round(row.get("talent_total_p96_high"), 2),
                "talent_sd": _round(row.get("talent_posterior_sd"), 3),
                "keeperiq": _round(row.get("talent_percentile"), 1),
                "keeperiq_low": _round(row.get("talent_percentile_low"), 1),
                "keeperiq_high": _round(row.get("talent_percentile_high"), 1),
                "rank": _int_or_none(row.get("talent_rank")),
                "weights": {
                    "league_prior": _round(row.get("weight_prior_league"), 3),
                    "prior_season": _round(row.get("weight_prior_season"), 3),
                    "live_season": _round(row.get("weight_live_season"), 3),
                },
                "prior_season_rate": _round(row.get("prior_season_rate"), 2),
                "live_season_rate": _round(row.get("live_season_rate"), 2),
                "prior_season_minutes": _round(row.get("prior_season_minutes"), 0),
                "live_season_minutes": _round(row.get("live_season_minutes"), 0),
                "league_prior_rate": _round(row.get("league_prior_rate"), 2),
                "prior_source": str(row.get("prior_source")),
                "in_live_season": bool(row.get("in_live_season", False)),
            }
        )
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "methodology_version": cfg.methodology_version,
        "prior_season": final.season,
        "live_season": live.season,
        "max_match_date": live.max_match_date,
        "model": talent_context(cfg, model, final.frame),
        "players": rows,
    }


def _archetype_payload(
    cfg: Config,
    final_clusters: Any,
    live_clusters: Any,
    final: SeasonResult,
    live: SeasonResult,
    generated_at: str,
) -> dict[str, Any]:
    seasons: dict[str, Any] = {}
    for result, clusters in ((final, final_clusters), (live, live_clusters)):
        if clusters is None:
            seasons[str(result.season)] = {
                "available": False,
                "reason": (
                    "Too few goalkeepers cleared the minutes threshold for a stable clustering "
                    "in this season."
                ),
                "profiles": [],
                "diagnostics": None,
                "members": [],
            }
            continue
        assignments = clusters.assignments.set_index("player_id")
        members = []
        for _, row in result.frame.iterrows():
            player_id = str(row["player_id"])
            if player_id not in assignments.index:
                continue
            members.append(
                {
                    "player_id": player_id,
                    "slug": str(row["slug"]),
                    "name": str(row["player_name"]),
                    "team": _str_or_none(row.get("current_team_name")),
                    "cluster_id": int(assignments.loc[player_id, "archetype_cluster"]),
                    "label": str(assignments.loc[player_id, "archetype_label"]),
                    "keeperiq": _round(row.get("keeperiq"), 1),
                    "adjusted_total_p96": _round(row.get(f"adj_{TOTAL_KEY}_p96"), 2),
                    "minutes": _round(row.get("minutes"), 0),
                    "involvement": {
                        spec.key: _round(row.get(f"opp_{spec.key}_p96"), 2)
                        for spec in cfg.components
                    },
                }
            )
        seasons[str(result.season)] = {
            "available": True,
            "reason": None,
            "profiles": clusters.profiles,
            "diagnostics": clusters.diagnostics.to_dict(),
            "members": sorted(members, key=lambda m: (m["cluster_id"], -(m["keeperiq"] or 0))),
        }
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "methodology_version": cfg.methodology_version,
        "default_season": final.season,
        "seasons": seasons,
    }


def _write_player_profiles(
    cfg: Config,
    output_dir: Path,
    season_payloads: dict[int, dict[str, Any]],
    talent_payload: dict[str, Any],
    final: SeasonResult,
    live: SeasonResult,
    snapshot_root: Path,
) -> None:
    profile_dir = output_dir / "players"
    profile_dir.mkdir(parents=True, exist_ok=True)
    for existing in profile_dir.glob("*.json"):
        existing.unlink()

    talent_by_id = {row["player_id"]: row for row in talent_payload["players"]}
    season_rows: dict[int, dict[str, dict[str, Any]]] = {
        season: {row["player_id"]: row for row in payload["players"]}
        for season, payload in season_payloads.items()
    }
    results = {result.season: result for result in (final, live)}

    player_ids = sorted(set().union(*(set(rows) for rows in season_rows.values())))
    for player_id in player_ids:
        seasons_payload: dict[str, Any] = {}
        slug = None
        name = None
        for season, rows in season_rows.items():
            row = rows.get(player_id)
            if row is None:
                continue
            slug = slug or row["slug"]
            name = name or row["name"]
            result = results[season]
            timeline = _match_timeline(cfg, result.matches, player_id)
            source_row = result.frame[result.frame["player_id"] == player_id]
            seasons_payload[str(season)] = {
                **row,
                "timeline": timeline,
                "rolling_form": _rolling_form(timeline),
                "ranking_history": ranking_history(snapshot_root, season, player_id),
                "team_stints": (
                    source_row.iloc[0]["team_stints"]
                    if not source_row.empty and isinstance(source_row.iloc[0]["team_stints"], list)
                    else []
                ),
            }
        if slug is None:
            continue
        payload = {
            "schema_version": SCHEMA_VERSION,
            "player_id": player_id,
            "slug": slug,
            "name": name,
            "generated_at": talent_payload["generated_at"],
            "methodology_version": cfg.methodology_version,
            "seasons": seasons_payload,
            "available_seasons": sorted(int(s) for s in seasons_payload),
            "talent": talent_by_id.get(player_id),
        }
        write_json(profile_dir / f"{slug}.json", payload)


def _player_index(
    season_payloads: dict[int, dict[str, Any]], talent_payload: dict[str, Any], cfg: Config
) -> dict[str, Any]:
    index: dict[str, dict[str, Any]] = {}
    for season in sorted(season_payloads, reverse=True):
        for row in season_payloads[season]["players"]:
            entry = index.setdefault(
                row["player_id"],
                {
                    "player_id": row["player_id"],
                    "slug": row["slug"],
                    "name": row["name"],
                    "team": row["team"],
                    "team_abbreviation": row["team_abbreviation"],
                    "nationality": row["nationality"],
                    "seasons": [],
                },
            )
            entry["seasons"].append(season)
    for row in talent_payload["players"]:
        if row["player_id"] in index:
            index[row["player_id"]]["talent_keeperiq"] = row["keeperiq"]
    entries = sorted(index.values(), key=lambda item: item["name"].casefold())
    for entry in entries:
        entry["seasons"] = sorted(set(entry["seasons"]), reverse=True)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": talent_payload["generated_at"],
        "seasons": sorted(season_payloads, reverse=True),
        "final_season": cfg.final_season,
        "live_season": cfg.live_season,
        "players": entries,
    }


def _methodology_payload(
    cfg: Config,
    model: ReliabilityModel,
    final: SeasonResult,
    live: SeasonResult,
    generated_at: str,
) -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": generated_at,
        "methodology_version": cfg.methodology_version,
        "minutes_basis": cfg.minutes_basis,
        "primary_value_field": cfg.primary_value_field,
        "source": {
            "provider": cfg.section("source", "provider"),
            "attribution_url": cfg.section("source", "attribution_url"),
            "league": cfg.league,
            "base_url": cfg.base_url,
        },
        "components": [
            {
                "key": spec.key,
                "label": spec.label,
                "source_action_type": spec.source_action_type,
                "opportunity_label": spec.opportunity_label,
                "description": " ".join(spec.description.split()),
                **model.components[spec.key].to_dict(),
            }
            for spec in cfg.components
        ],
        "volumes": {key: value.to_dict() for key, value in model.volumes.items()},
        "league_baselines": {
            str(result.season): result.baseline.to_dict() for result in (final, live)
        },
        "total": model.total.to_dict(),
        "reliability_seasons": model.seasons_used,
        "bootstrap": BootstrapSettings.from_config(cfg).to_dict(),
        "qualification": {
            str(final.season): final.rule.to_dict(),
            str(live.season): live.rule.to_dict(),
        },
        "profile_thresholds": cfg.section("profile_thresholds"),
        "talent": talent_context(cfg, model, final.frame),
    }


def _traditional_comparison(cfg: Config, frame: pd.DataFrame) -> dict[str, Any]:
    """Scatter series and rank-disagreement lists contrasting the two views."""
    pool = frame[frame["in_reference_pool"]].copy()
    points = [
        {
            "player_id": str(row["player_id"]),
            "slug": str(row["slug"]),
            "name": str(row["player_name"]),
            "team_abbreviation": _str_or_none(row.get("current_team_abbreviation")),
            "keeperiq": _round(row.get("keeperiq"), 1),
            "goals_conceded_p96": _round(row.get("goals_conceded_p96"), 2),
            "adjusted_total_p96": _round(row.get(f"adj_{TOTAL_KEY}_p96"), 2),
            "save_pct": _round(row.get("save_pct"), 1),
            "adjusted_shot_stopping_p96": _round(row.get("adj_shot_stopping_p96"), 3),
            "shot_stopping_percentile": _round(row.get("pct_adj_shot_stopping"), 1),
            "goals_prevented_p96": _round(row.get("goals_prevented_p96"), 2),
            "xgoals_faced_p96": _round(row.get("xgoals_faced_p96"), 2),
            "shots_faced_p96": _round(row.get("shots_faced_p96"), 2),
            "minutes": _round(row.get("minutes"), 0),
            "rank_disagreement": _int_or_none(row.get("rank_disagreement")),
            "rank_keeperiq": _int_or_none(row.get("rank_adjusted_pool")),
            "rank_goals_conceded": _int_or_none(row.get("rank_goals_conceded_pool")),
        }
        for _, row in pool.iterrows()
    ]
    rated = [p for p in points if p["rank_disagreement"] is not None]
    undervalued = sorted(rated, key=lambda p: -p["rank_disagreement"])[:10]
    overvalued = sorted(rated, key=lambda p: p["rank_disagreement"])[:10]

    return {
        "pool_size": len(points),
        "correlations": _correlations(pool),
        "points": points,
        "better_by_keeperiq": undervalued,
        "worse_by_keeperiq": overvalued,
        "components": [spec.key for spec in cfg.components],
    }


def _correlations(frame: pd.DataFrame) -> dict[str, float | None]:
    def correlate(left: str, right: str, method: str = "spearman") -> float | None:
        if left not in frame or right not in frame:
            return None
        subset = frame[[left, right]].dropna()
        if len(subset) < 5:
            return None
        value = subset[left].corr(subset[right], method=method)
        return None if pd.isna(value) else round(float(value), 3)

    return {
        "keeperiq_vs_goals_conceded_p96": correlate("keeperiq", "goals_conceded_p96"),
        "adjusted_vs_goals_conceded_p96": correlate(
            f"adj_{TOTAL_KEY}_p96", "goals_conceded_p96"
        ),
        "save_pct_vs_adjusted_shot_stopping": correlate("save_pct", "adj_shot_stopping_p96"),
        "goals_prevented_vs_shot_stopping": correlate(
            "goals_prevented_p96", "adj_shot_stopping_p96"
        ),
        "shots_faced_vs_goals_conceded": correlate("shots_faced_p96", "goals_conceded_p96"),
        "observed_vs_adjusted_total": correlate(f"ga_{TOTAL_KEY}_p96", f"adj_{TOTAL_KEY}_p96"),
    }


def _status_payload(
    cfg: Config,
    fetched: FetchResult,
    data: CanonicalData,
    final: SeasonResult,
    live: SeasonResult,
    fingerprint: str,
    generated_at: str,
    snapshots_written: list[str],
    model: ReliabilityModel,
) -> dict[str, Any]:
    fresh = [r for r in fetched.records if not r.from_cache]
    last_successful = max((r.fetched_at for r in fetched.records), default=generated_at)
    is_current = not fetched.network_errors
    return {
        "schema_version": SCHEMA_VERSION,
        "pipeline_version": cfg.methodology_version,
        "methodology_version": cfg.methodology_version,
        "last_attempted_update": fetched.attempted_at,
        "last_successful_update": last_successful,
        "generated_at": generated_at,
        "data_is_current": is_current,
        "fallback_reason": (
            None
            if is_current
            else "One or more source requests failed; the most recent valid cached data is shown."
        ),
        "source_fingerprint": fingerprint,
        "source": {
            "provider": cfg.section("source", "provider"),
            "attribution_url": cfg.section("source", "attribution_url"),
            "league": cfg.league.upper(),
        },
        "network_errors": fetched.network_errors,
        "seasons": {
            str(result.season): {
                "goalkeepers": len(result.frame),
                "matches_covered": int(result.matches["game_id"].nunique())
                if not result.matches.empty
                else 0,
                "goalkeeper_match_rows": len(result.matches),
                "max_match_date": result.max_match_date,
                "sample_counts": _sample_counts(result.frame),
                "total_minutes": int(result.frame["minutes"].sum()),
                "qualification": result.rule.to_dict(),
            }
            for result in (final, live)
        },
        "row_counts": {
            "goalkeeper_seasons": len(data.seasons),
            "goalkeeper_matches": len(data.matches),
            "players": len(data.players),
            "teams": len(data.teams),
            "games": len(data.games),
        },
        "resources": [
            {
                "resource": record.resource,
                "rows": record.row_count,
                "fetched_at": record.fetched_at,
                "from_cache": record.from_cache,
            }
            for record in sorted(fetched.records, key=lambda r: r.resource)
        ],
        "fresh_resources": len(fresh),
        "validation": [
            {"severity": issue.severity, "check": issue.check, "detail": issue.detail}
            for issue in data.issues
        ],
        "validation_status": (
            "failed"
            if any(i.severity == "error" for i in data.issues)
            else "warnings"
            if any(i.severity == "warning" for i in data.issues)
            else "passed"
        ),
        "reliability_sources": {
            key: component.source for key, component in model.components.items()
        },
        "snapshots_written": snapshots_written,
        "snapshot_counts": {
            str(season): len(list((cfg.path_for("snapshot_dir") / f"season-{season}").glob("*.json")))
            for season in (cfg.final_season, cfg.live_season)
        },
    }


def _write_processed(
    cfg: Config, final: SeasonResult, live: SeasonResult, talent: pd.DataFrame
) -> None:
    """Persist tidy CSVs for analysts who would rather not read JSON."""
    directory = cfg.path_for("processed_dir")
    directory.mkdir(parents=True, exist_ok=True)
    for result in (final, live):
        columns = [c for c in result.frame.columns if c != "team_stints"]
        result.frame[columns].to_csv(
            directory / f"goalkeeper-season-{result.season}.csv", index=False
        )
        if not result.matches.empty:
            result.matches.to_csv(
                directory / f"goalkeeper-matches-{result.season}.csv", index=False
            )
    talent.to_csv(directory / "current-talent.csv", index=False)


def run(cfg: Config, **kwargs: Any) -> dict[str, Any]:
    return run_pipeline(cfg, **kwargs)
