"""Dated snapshots and ranking movement.

A snapshot is written only when the underlying source data actually changed,
which keeps the history meaningful (and keeps the scheduled workflow from
committing an identical file every day). Ranking movement on the live-season
view is the difference against the most recent *earlier* snapshot.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pandas as pd

from .logging_utils import get_logger

LOG = get_logger("snapshots")

SNAPSHOT_SUFFIX = ".json"


def _snapshot_dir(root: Path, season: int) -> Path:
    path = root / f"season-{season}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def list_snapshots(root: Path, season: int) -> list[Path]:
    directory = _snapshot_dir(root, season)
    return sorted(p for p in directory.glob(f"*{SNAPSHOT_SUFFIX}") if p.is_file())


def load_latest_snapshot(root: Path, season: int) -> dict[str, Any] | None:
    files = list_snapshots(root, season)
    if not files:
        return None
    with files[-1].open("r", encoding="utf-8") as handle:
        return json.load(handle)


def build_snapshot(
    season: int,
    frame: pd.DataFrame,
    *,
    source_fingerprint: str,
    max_match_date: str | None,
    methodology_version: str,
) -> dict[str, Any]:
    """A compact, comparable record of one season's standings."""
    entries = [
        {
            "player_id": str(row.player_id),
            "slug": str(row.slug),
            "rank": None if pd.isna(row.rank_adjusted) else int(row.rank_adjusted),
            "keeperiq": None if pd.isna(row.keeperiq) else round(float(row.keeperiq), 1),
            "adj_total_p96": (
                None if pd.isna(row.adj_total_p96) else round(float(row.adj_total_p96), 4)
            ),
            "minutes": round(float(row.minutes), 1),
        }
        for row in frame.itertuples()
    ]
    entries.sort(key=lambda item: item["player_id"])
    return {
        "season": season,
        "captured_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_fingerprint": source_fingerprint,
        "max_match_date": max_match_date,
        "methodology_version": methodology_version,
        "entries": entries,
    }


def snapshot_changed(previous: dict[str, Any] | None, current: dict[str, Any]) -> bool:
    """Has anything that matters changed since the last snapshot?"""
    if previous is None:
        return True
    if previous.get("source_fingerprint") != current.get("source_fingerprint"):
        return True
    if previous.get("methodology_version") != current.get("methodology_version"):
        return True
    return previous.get("entries") != current.get("entries")


def write_snapshot(
    root: Path, snapshot: dict[str, Any], *, max_snapshots: int
) -> Path | None:
    """Persist a snapshot, pruning the oldest once the cap is reached."""
    season = int(snapshot["season"])
    previous = load_latest_snapshot(root, season)
    if not snapshot_changed(previous, snapshot):
        LOG.info("Season %s unchanged since the last snapshot; nothing written", season)
        return None

    directory = _snapshot_dir(root, season)
    stamp = snapshot["captured_at"].replace(":", "").replace("-", "")
    path = directory / f"{stamp}{SNAPSHOT_SUFFIX}"
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    LOG.info("Wrote snapshot %s (%d goalkeepers)", path.name, len(snapshot["entries"]))

    existing = list_snapshots(root, season)
    excess = len(existing) - max_snapshots
    for stale in existing[:max(excess, 0)]:
        stale.unlink()
        LOG.info("Pruned old snapshot %s", stale.name)
    return path


def rank_movement(
    frame: pd.DataFrame, previous: dict[str, Any] | None
) -> pd.DataFrame:
    """Attach movement against the previous snapshot.

    ``rank_change`` is positive when a goalkeeper has climbed (his rank number
    got smaller). A goalkeeper absent from the previous snapshot has no
    movement rather than a fabricated zero.
    """
    frame = frame.copy()
    frame["previous_rank"] = pd.Series(pd.NA, index=frame.index, dtype="Int64")
    frame["previous_keeperiq"] = pd.Series(pd.NA, index=frame.index, dtype="Float64")
    frame["rank_change"] = pd.Series(pd.NA, index=frame.index, dtype="Int64")
    frame["keeperiq_change"] = pd.Series(pd.NA, index=frame.index, dtype="Float64")
    frame["comparison_snapshot"] = None

    if previous is None:
        return frame

    lookup = {entry["player_id"]: entry for entry in previous.get("entries", [])}
    captured = previous.get("captured_at")
    for index, row in frame.iterrows():
        entry = lookup.get(str(row["player_id"]))
        if entry is None:
            continue
        frame.at[index, "comparison_snapshot"] = captured
        if entry.get("rank") is not None and pd.notna(row["rank_adjusted"]):
            frame.at[index, "previous_rank"] = int(entry["rank"])
            frame.at[index, "rank_change"] = int(entry["rank"]) - int(row["rank_adjusted"])
        if entry.get("keeperiq") is not None and pd.notna(row["keeperiq"]):
            frame.at[index, "previous_keeperiq"] = float(entry["keeperiq"])
            frame.at[index, "keeperiq_change"] = float(row["keeperiq"]) - float(entry["keeperiq"])
    return frame


def ranking_history(root: Path, season: int, player_id: str) -> list[dict[str, Any]]:
    """Every recorded rank for one goalkeeper, oldest first."""
    history: list[dict[str, Any]] = []
    for path in list_snapshots(root, season):
        with path.open("r", encoding="utf-8") as handle:
            snapshot = json.load(handle)
        for entry in snapshot.get("entries", []):
            if entry["player_id"] == player_id and entry.get("rank") is not None:
                history.append(
                    {
                        "captured_at": snapshot["captured_at"],
                        "max_match_date": snapshot.get("max_match_date"),
                        "rank": entry["rank"],
                        "keeperiq": entry.get("keeperiq"),
                        "adj_total_p96": entry.get("adj_total_p96"),
                    }
                )
                break
    return history
