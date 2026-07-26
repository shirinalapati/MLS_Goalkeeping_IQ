"""Tests for the responsible Wikipedia roster scraper."""

from __future__ import annotations

from pathlib import Path

import pytest

from keeperiq.scrape import (
    EXPECTED_HEADERS,
    ScrapeSchemaError,
    parse_roster_html,
)

FIXTURE = Path(__file__).parent / "fixtures" / "nyrb_roster.html"


def test_fixture_parses_goalkeepers() -> None:
    html = FIXTURE.read_text(encoding="utf-8")
    rows = parse_roster_html(
        html,
        team_name="New York Red Bulls",
        team_slug="new-york-red-bulls",
        source_url="fixture://nyrb",
    )
    assert len(rows) >= 10
    keepers = [row for row in rows if row.is_goalkeeper]
    assert len(keepers) >= 2
    names = {row.player_name for row in keepers}
    assert "AJ Marcucci" in names or any("Marcucci" in name for name in names)
    for row in keepers:
        assert row.position_code == "GK"
        assert row.team_slug == "new-york-red-bulls"


def test_schema_change_is_detected() -> None:
    broken = """
    <html><body>
    <table class="wikitable">
      <tr><th>Shirt</th><th>Role</th><th>Country</th><th>Name</th></tr>
      <tr><td>1</td><td>GK</td><td>USA</td><td>Test Keeper</td></tr>
    </table>
    </body></html>
    """
    with pytest.raises(ScrapeSchemaError, match="No roster table"):
        parse_roster_html(
            broken,
            team_name="Test FC",
            team_slug="test-fc",
            source_url="fixture://broken",
        )


def test_expected_headers_contract() -> None:
    assert EXPECTED_HEADERS == ("no.", "pos.", "nation", "player")
