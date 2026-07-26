"""Canonical schema definitions and source-payload validation.

The raw American Soccer Analysis field names are preserved in ``data/raw``.
Everything downstream of this module speaks the canonical vocabulary declared
here, and any change to the upstream schema fails loudly rather than silently
producing empty columns.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import Config
from .logging_utils import get_logger

LOG = get_logger("schema")

# Source fields the pipeline cannot operate without, per endpoint family.
REQUIRED_FIELDS: dict[str, tuple[str, ...]] = {
    "teams": ("team_id", "team_name", "team_abbreviation"),
    "players": ("player_id", "player_name"),
    "games": ("game_id", "date_time_utc", "season_name", "home_team_id", "away_team_id"),
    "gk_goals_added": ("player_id", "team_id", "minutes_played", "data"),
    "gk_goals_added_games": ("player_id", "team_id", "game_id", "minutes_played", "data"),
    "gk_xgoals": (
        "player_id",
        "team_id",
        "minutes_played",
        "shots_faced",
        "goals_conceded",
        "saves",
        "xgoals_gk_faced",
    ),
    "gk_xgoals_games": (
        "player_id",
        "team_id",
        "game_id",
        "minutes_played",
        "shots_faced",
        "goals_conceded",
        "saves",
        "xgoals_gk_faced",
    ),
}

REQUIRED_ACTION_FIELDS: tuple[str, ...] = (
    "action_type",
    "goals_added_raw",
    "goals_added_above_avg",
    "count_actions",
)


class SchemaError(RuntimeError):
    """A required upstream field or action type has disappeared."""


def validate_payload(kind: str, rows: list[dict[str, Any]], *, context: str) -> None:
    """Assert that a raw payload still carries every field the pipeline needs."""
    required = REQUIRED_FIELDS.get(kind)
    if required is None:
        raise SchemaError(f"No required-field contract declared for payload kind {kind!r}")
    if not rows:
        raise SchemaError(
            f"Source returned zero rows for {kind!r} ({context}). "
            "Refusing to build outputs from an empty payload."
        )
    present = set(rows[0])
    missing = [name for name in required if name not in present]
    if missing:
        raise SchemaError(
            f"Source schema change detected for {kind!r} ({context}). "
            f"Missing required field(s): {missing}. Present fields: {sorted(present)}"
        )


def validate_action_types(
    cfg: Config, rows: list[dict[str, Any]], *, context: str
) -> None:
    """Assert every configured Goals Added component still exists upstream."""
    seen: set[str] = set()
    for row in rows:
        for action in row.get("data") or []:
            missing = [f for f in REQUIRED_ACTION_FIELDS if f not in action]
            if missing:
                raise SchemaError(
                    f"Goals Added action record is missing {missing} ({context}). "
                    f"Received keys: {sorted(action)}"
                )
            seen.add(str(action["action_type"]))
    expected = set(cfg.action_type_to_key)
    absent = expected - seen
    if absent:
        raise SchemaError(
            f"Configured Goals Added action type(s) {sorted(absent)} are absent from the "
            f"source payload ({context}). Observed action types: {sorted(seen)}. "
            "Update pipeline/config/keeperiq.yml if American Soccer Analysis renamed them."
        )
    unexpected = seen - expected
    if unexpected:
        LOG.warning(
            "Source exposes unmapped action type(s) %s (%s); they are excluded from Total G+.",
            sorted(unexpected),
            context,
        )


# ---------------------------------------------------------------------------
# Canonical records
# ---------------------------------------------------------------------------


class Team(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")

    team_id: str
    team_name: str
    team_abbreviation: str
    team_short_name: str | None = None


class Player(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")

    player_id: str
    player_name: str
    slug: str
    birth_date: str | None = None
    nationality: str | None = None
    height_ft: int | None = None
    height_in: int | None = None

    @field_validator("player_name")
    @classmethod
    def _non_empty_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("player_name must not be blank")
        return cleaned


class Game(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")

    game_id: str
    season: int
    date_utc: str
    home_team_id: str
    away_team_id: str
    matchday: int | None = None
    status: str | None = None


class ComponentValue(BaseModel):
    """One canonical component for one goalkeeper-season or goalkeeper-match."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    key: str
    goals_added: float
    goals_added_raw: float
    opportunities: int = Field(ge=0)


class GoalkeeperRecord(BaseModel):
    """A goalkeeper's canonical record for one season or one match."""

    model_config = ConfigDict(extra="forbid")

    player_id: str
    season: int
    team_id: str
    game_id: str | None = None
    date_utc: str | None = None
    minutes: float = Field(ge=0)
    components: dict[str, ComponentValue]
    shots_faced: int | None = None
    goals_conceded: int | None = None
    saves: int | None = None
    xgoals_faced: float | None = None
    share_headed_shots: float | None = None


# ---------------------------------------------------------------------------
# Slugs
# ---------------------------------------------------------------------------

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def _base_slug(name: str) -> str:
    """ASCII-fold a player name into a URL-safe slug.

    Accents are folded rather than dropped so that ``Roman Bürki`` becomes
    ``roman-burki`` instead of ``roman-brki``.
    """
    decomposed = unicodedata.normalize("NFKD", name)
    folded = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    folded = folded.replace("ø", "o").replace("Ø", "O").replace("đ", "d").replace("Đ", "D")
    folded = folded.replace("ł", "l").replace("Ł", "L").replace("ß", "ss")
    ascii_only = folded.encode("ascii", "ignore").decode("ascii")
    slug = _SLUG_STRIP.sub("-", ascii_only.lower()).strip("-")
    return slug or "goalkeeper"


def build_slugs(players: dict[str, str]) -> dict[str, str]:
    """Build stable, collision-free slugs keyed by ``player_id``.

    Sorting by ``player_id`` makes the disambiguation suffix deterministic
    across runs, so a slug never changes because a new player was added.
    """
    slugs: dict[str, str] = {}
    used: dict[str, str] = {}
    for player_id in sorted(players):
        base = _base_slug(players[player_id])
        candidate = base
        if candidate in used:
            # Deterministic suffix derived from the immutable source id.
            candidate = f"{base}-{player_id[:6].lower()}"
            counter = 2
            while candidate in used:
                candidate = f"{base}-{player_id[:6].lower()}-{counter}"
                counter += 1
        used[candidate] = player_id
        slugs[player_id] = candidate
    return slugs
