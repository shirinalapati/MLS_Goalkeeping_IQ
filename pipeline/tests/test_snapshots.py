"""Snapshot change detection and ranking movement."""

from __future__ import annotations

import pandas as pd

from keeperiq.snapshots import build_snapshot, rank_movement, snapshot_changed, write_snapshot


def test_snapshot_unchanged_when_entries_identical(tmp_path) -> None:
    frame = pd.DataFrame(
        [
            {
                "player_id": "p1",
                "slug": "keeper-one",
                "rank_adjusted": 1,
                "keeperiq": 90.0,
                "adj_total_p96": 0.2,
                "minutes": 2000.0,
            }
        ]
    )
    first = build_snapshot(
        2026,
        frame,
        source_fingerprint="abc",
        max_match_date="2026-07-01",
        methodology_version="1.0.0",
    )
    path = write_snapshot(tmp_path, first, max_snapshots=10)
    assert path is not None
    second = build_snapshot(
        2026,
        frame,
        source_fingerprint="abc",
        max_match_date="2026-07-01",
        methodology_version="1.0.0",
    )
    assert snapshot_changed(first, second) is False
    assert write_snapshot(tmp_path, second, max_snapshots=10) is None


def test_snapshot_changes_when_source_fingerprint_moves() -> None:
    frame = pd.DataFrame(
        [
            {
                "player_id": "p1",
                "slug": "keeper-one",
                "rank_adjusted": 1,
                "keeperiq": 90.0,
                "adj_total_p96": 0.2,
                "minutes": 2000.0,
            }
        ]
    )
    first = build_snapshot(
        2026,
        frame,
        source_fingerprint="abc",
        max_match_date="2026-07-01",
        methodology_version="1.0.0",
    )
    second = build_snapshot(
        2026,
        frame,
        source_fingerprint="def",
        max_match_date="2026-07-01",
        methodology_version="1.0.0",
    )
    assert snapshot_changed(first, second) is True


def test_rank_movement_is_positive_when_climbing() -> None:
    previous = {
        "captured_at": "2026-07-01T00:00:00Z",
        "entries": [{"player_id": "p1", "rank": 5, "keeperiq": 60.0}],
    }
    frame = pd.DataFrame(
        [
            {
                "player_id": "p1",
                "rank_adjusted": 2,
                "keeperiq": 75.0,
            }
        ]
    )
    moved = rank_movement(frame, previous)
    assert int(moved.loc[0, "rank_change"]) == 3
    assert float(moved.loc[0, "keeperiq_change"]) == 15.0
