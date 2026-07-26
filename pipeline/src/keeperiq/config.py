"""Typed access to the KeeperIQ analytical configuration."""

from __future__ import annotations

import functools
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_CONFIG_PATH = REPO_ROOT / "pipeline" / "config" / "keeperiq.yml"


class ConfigError(RuntimeError):
    """Raised when the configuration file is missing or internally inconsistent."""


@dataclass(frozen=True)
class ComponentSpec:
    """One canonical Goals Added component and its opportunity denominator."""

    key: str
    label: str
    source_action_type: str
    opportunity: str
    opportunity_label: str
    description: str


@dataclass(frozen=True)
class Config:
    """Immutable view over ``keeperiq.yml``."""

    raw: dict[str, Any]
    path: Path

    # -- convenience accessors -------------------------------------------------
    @property
    def methodology_version(self) -> str:
        return str(self.raw["model"]["methodology_version"])

    @property
    def model_name(self) -> str:
        return str(self.raw["model"]["name"])

    @property
    def league(self) -> str:
        return str(self.raw["source"]["league"])

    @property
    def base_url(self) -> str:
        return str(self.raw["source"]["base_url"]).rstrip("/")

    @property
    def history_seasons(self) -> list[int]:
        return [int(s) for s in self.raw["seasons"]["history"]]

    @property
    def final_season(self) -> int:
        return int(self.raw["seasons"]["final"])

    @property
    def live_season(self) -> int:
        return int(self.raw["seasons"]["live"])

    @property
    def all_seasons(self) -> list[int]:
        seasons = set(self.history_seasons) | {self.final_season, self.live_season}
        return sorted(seasons)

    @property
    def minutes_basis(self) -> int:
        return int(self.raw["rates"]["minutes_basis"])

    @property
    def primary_value_field(self) -> str:
        return str(self.raw["rates"]["primary_value_field"])

    @functools.cached_property
    def components(self) -> tuple[ComponentSpec, ...]:
        specs = tuple(ComponentSpec(**entry) for entry in self.raw["components"])
        if not specs:
            raise ConfigError("At least one component must be configured.")
        keys = [s.key for s in specs]
        if len(set(keys)) != len(keys):
            raise ConfigError(f"Duplicate component keys in configuration: {keys}")
        return specs

    @property
    def component_keys(self) -> list[str]:
        return [c.key for c in self.components]

    @functools.cached_property
    def action_type_to_key(self) -> dict[str, str]:
        return {c.source_action_type: c.key for c in self.components}

    def component(self, key: str) -> ComponentSpec:
        for spec in self.components:
            if spec.key == key:
                return spec
        raise KeyError(f"Unknown component: {key!r}")

    def section(self, *path: str) -> Any:
        node: Any = self.raw
        for part in path:
            if not isinstance(node, dict) or part not in node:
                raise ConfigError(f"Missing configuration section: {'.'.join(path)}")
            node = node[part]
        return node

    def path_for(self, key: str) -> Path:
        return REPO_ROOT / str(self.raw["output"][key])


def load_config(path: Path | str | None = None) -> Config:
    """Load and lightly validate the analytical configuration."""
    cfg_path = Path(path) if path is not None else DEFAULT_CONFIG_PATH
    if not cfg_path.exists():
        raise ConfigError(f"Configuration file not found: {cfg_path}")
    with cfg_path.open("r", encoding="utf-8") as handle:
        raw = yaml.safe_load(handle)
    if not isinstance(raw, dict):
        raise ConfigError(f"Configuration root must be a mapping: {cfg_path}")

    required = ("model", "source", "seasons", "rates", "components", "reliability", "output")
    missing = [key for key in required if key not in raw]
    if missing:
        raise ConfigError(f"Configuration missing required sections: {missing}")

    cfg = Config(raw=raw, path=cfg_path)
    # Touch the cached properties so structural errors surface at load time.
    _ = cfg.components
    fallbacks = set(cfg.section("reliability", "fallback_k"))
    unknown = fallbacks - set(cfg.component_keys)
    if unknown:
        raise ConfigError(f"reliability.fallback_k references unknown components: {sorted(unknown)}")
    missing_fallbacks = set(cfg.component_keys) - fallbacks
    if missing_fallbacks:
        raise ConfigError(
            f"reliability.fallback_k missing components: {sorted(missing_fallbacks)}"
        )

    volume_fallbacks = set(cfg.section("volume_reliability", "fallback_k_minutes"))
    if volume_fallbacks != set(cfg.component_keys):
        raise ConfigError(
            "volume_reliability.fallback_k_minutes must cover exactly the configured "
            f"components; got {sorted(volume_fallbacks)} for {sorted(cfg.component_keys)}"
        )
    return cfg
