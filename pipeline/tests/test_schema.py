"""Schema validation and slug stability."""

from __future__ import annotations

import pytest

from keeperiq.schema import SchemaError, build_slugs, validate_action_types, validate_payload


def test_validate_payload_requires_rows() -> None:
    with pytest.raises(SchemaError, match="zero rows"):
        validate_payload("teams", [], context="empty")


def test_validate_payload_detects_missing_fields() -> None:
    with pytest.raises(SchemaError, match="Missing required field"):
        validate_payload("teams", [{"team_id": "x"}], context="broken")


def test_validate_action_types_detects_renames(cfg) -> None:
    rows = [
        {
            "player_id": "p1",
            "data": [
                {
                    "action_type": "NotARealAction",
                    "goals_added_raw": 0.0,
                    "goals_added_above_avg": 0.0,
                    "count_actions": 1,
                }
            ],
        }
    ]
    with pytest.raises(SchemaError, match="absent from the source"):
        validate_action_types(cfg, rows, context="test")


def test_build_slugs_folds_accents_and_is_stable() -> None:
    players = {
        "idB": "Roman Bürki",
        "idA": "André Blake",
        "idC": "André Blake",
    }
    first = build_slugs(players)
    second = build_slugs(players)
    assert first == second
    assert first["idB"] == "roman-burki"
    assert first["idA"].startswith("andre-blake")
    assert first["idC"].startswith("andre-blake")
    assert first["idA"] != first["idC"]


def test_build_slugs_never_empty() -> None:
    assert build_slugs({"x": "!!!"} )["x"] == "goalkeeper"
