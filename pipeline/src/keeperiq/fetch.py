"""American Soccer Analysis API client.

Raw responses are written to ``data/raw`` with their original field names
untouched so that the transform stage is always reproducible from cache and so
that a schema change at the source is auditable after the fact.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests

from .config import Config
from .logging_utils import get_logger

LOG = get_logger("fetch")


class SourceUnavailableError(RuntimeError):
    """The upstream API could not be reached or returned an unusable payload."""


@dataclass
class FetchRecord:
    """Provenance for a single cached endpoint response."""

    resource: str
    url: str
    row_count: int
    fetched_at: str
    from_cache: bool
    content_sha256: str
    path: str


@dataclass
class FetchResult:
    """Everything the transform stage needs, plus provenance."""

    payloads: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    records: list[FetchRecord] = field(default_factory=list)
    attempted_at: str = ""
    network_errors: list[str] = field(default_factory=list)

    def require(self, resource: str) -> list[dict[str, Any]]:
        if resource not in self.payloads:
            raise SourceUnavailableError(
                f"Required resource {resource!r} is not available. "
                f"Fetched resources: {sorted(self.payloads)}"
            )
        return self.payloads[resource]


def _utcnow() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _slugify_resource(resource: str) -> str:
    return resource.replace("/", "__").replace("?", "__").replace("&", "_").replace("=", "-")


class AsaClient:
    """Thin, cache-aware client for the public ASA v1 API."""

    def __init__(self, cfg: Config, *, cache_dir: Path | None = None, force: bool = False) -> None:
        self.cfg = cfg
        self.force = force
        self.cache_dir = cache_dir or (cfg.path_for("raw_dir") / "asa")
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.timeout = int(cfg.section("source", "request_timeout_seconds"))
        self.max_retries = int(cfg.section("source", "max_retries"))
        self.backoff = float(cfg.section("source", "retry_backoff_seconds"))
        self.ttl_hours = float(cfg.section("source", "cache_ttl_hours"))
        self.session = requests.Session()
        self.session.headers.update(
            {"Accept": "application/json", "User-Agent": "mls-keeperiq/1.0 (data pipeline)"}
        )

    # -- cache -----------------------------------------------------------------
    def _cache_path(self, resource: str) -> Path:
        return self.cache_dir / f"{_slugify_resource(resource)}.json"

    def _cache_is_fresh(self, path: Path) -> bool:
        if self.force or not path.exists():
            return False
        if self.ttl_hours <= 0:
            return False
        age_hours = (time.time() - path.stat().st_mtime) / 3600.0
        return age_hours < self.ttl_hours

    # -- network ---------------------------------------------------------------
    def _request(self, url: str) -> list[dict[str, Any]]:
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.session.get(url, timeout=self.timeout)
                if response.status_code != 200:
                    raise SourceUnavailableError(
                        f"HTTP {response.status_code} from {url}: {response.text[:200]}"
                    )
                payload = response.json()
            except (requests.RequestException, ValueError, SourceUnavailableError) as exc:
                last_error = exc
                if attempt < self.max_retries:
                    delay = self.backoff * attempt
                    LOG.warning(
                        "Attempt %d/%d failed for %s (%s); retrying in %.1fs",
                        attempt,
                        self.max_retries,
                        url,
                        exc,
                        delay,
                    )
                    time.sleep(delay)
                continue
            if not isinstance(payload, list):
                raise SourceUnavailableError(
                    f"Expected a JSON array from {url}, received {type(payload).__name__}"
                )
            return payload
        raise SourceUnavailableError(f"Exhausted retries for {url}: {last_error}")

    def get(
        self, path: str, params: dict[str, Any] | None = None
    ) -> tuple[list[dict[str, Any]], FetchRecord]:
        """Fetch one endpoint, using the on-disk cache when it is still fresh."""
        query = urlencode(params or {})
        resource = f"{path}?{query}" if query else path
        url = f"{self.cfg.base_url}/{self.cfg.league}/{resource}"
        cache_path = self._cache_path(resource)

        if self._cache_is_fresh(cache_path):
            with cache_path.open("r", encoding="utf-8") as handle:
                cached = json.load(handle)
            LOG.info("cache hit  %-58s rows=%d", resource, len(cached["data"]))
            return cached["data"], FetchRecord(
                resource=resource,
                url=url,
                row_count=len(cached["data"]),
                fetched_at=cached["fetched_at"],
                from_cache=True,
                content_sha256=cached["content_sha256"],
                path=str(cache_path.relative_to(_repo_root_of(cache_path))),
            )

        LOG.info("fetching   %s", url)
        data = self._request(url)
        body = json.dumps(data, sort_keys=True, ensure_ascii=False)
        digest = hashlib.sha256(body.encode("utf-8")).hexdigest()
        fetched_at = _utcnow()
        envelope = {
            "resource": resource,
            "url": url,
            "fetched_at": fetched_at,
            "content_sha256": digest,
            "row_count": len(data),
            "data": data,
        }
        cache_path.write_text(
            json.dumps(envelope, ensure_ascii=False, indent=None, sort_keys=False),
            encoding="utf-8",
        )
        LOG.info("fetched    %-58s rows=%d", resource, len(data))
        return data, FetchRecord(
            resource=resource,
            url=url,
            row_count=len(data),
            fetched_at=fetched_at,
            from_cache=False,
            content_sha256=digest,
            path=str(cache_path.relative_to(_repo_root_of(cache_path))),
        )

    def load_cached_only(
        self, path: str, params: dict[str, Any] | None = None
    ) -> tuple[list[dict[str, Any]], FetchRecord] | None:
        """Return a cached payload regardless of age, or ``None`` if absent."""
        query = urlencode(params or {})
        resource = f"{path}?{query}" if query else path
        cache_path = self._cache_path(resource)
        if not cache_path.exists():
            return None
        with cache_path.open("r", encoding="utf-8") as handle:
            cached = json.load(handle)
        return cached["data"], FetchRecord(
            resource=resource,
            url=cached.get("url", ""),
            row_count=len(cached["data"]),
            fetched_at=cached["fetched_at"],
            from_cache=True,
            content_sha256=cached["content_sha256"],
            path=str(cache_path.relative_to(_repo_root_of(cache_path))),
        )


def _repo_root_of(path: Path) -> Path:
    for parent in path.parents:
        if (parent / "pipeline").is_dir() and (parent / "package.json").exists():
            return parent
    return path.parent


def _resource_key(kind: str, season: int | None = None) -> str:
    return kind if season is None else f"{kind}:{season}"


def fetch_all(cfg: Config, *, force: bool = False, offline: bool = False) -> FetchResult:
    """Fetch every endpoint the pipeline needs.

    When ``offline`` is set (or the network fails for a non-critical season) the
    most recent cached payload is used instead, and the failure is recorded so
    the site can tell the user the data is a fallback rather than fresh.
    """
    client = AsaClient(cfg, force=force)
    result = FetchResult(attempted_at=_utcnow())

    def pull(key: str, path: str, params: dict[str, Any] | None = None, *, required: bool = True) -> None:
        if offline:
            cached = client.load_cached_only(path, params)
            if cached is None:
                if required:
                    raise SourceUnavailableError(
                        f"Offline mode requested but no cached payload exists for {key!r}. "
                        f"Run the pipeline once with network access to seed data/raw."
                    )
                result.network_errors.append(f"{key}: no cached payload in offline mode")
                return
            data, record = cached
        else:
            try:
                data, record = client.get(path, params)
            except SourceUnavailableError as exc:
                cached = client.load_cached_only(path, params)
                if cached is None:
                    if required:
                        raise
                    result.network_errors.append(f"{key}: {exc}")
                    return
                LOG.warning("Falling back to cached payload for %s: %s", key, exc)
                result.network_errors.append(f"{key}: {exc} (served from cache)")
                data, record = cached
        result.payloads[key] = data
        result.records.append(record)

    pull(_resource_key("teams"), "teams")
    pull(_resource_key("players"), "players")

    for season in cfg.all_seasons:
        is_core = season in (cfg.final_season, cfg.live_season)
        pull(_resource_key("games", season), "games", {"season_name": season}, required=is_core)
        pull(
            _resource_key("gk_goals_added", season),
            "goalkeepers/goals-added",
            {"season_name": season},
            required=is_core,
        )
        pull(
            _resource_key("gk_xgoals", season),
            "goalkeepers/xgoals",
            {"season_name": season},
            required=is_core,
        )
        pull(
            _resource_key("gk_goals_added_games", season),
            "goalkeepers/goals-added",
            {"season_name": season, "split_by_games": "true"},
            required=is_core,
        )
        pull(
            _resource_key("gk_xgoals_games", season),
            "goalkeepers/xgoals",
            {"season_name": season, "split_by_games": "true"},
            required=is_core,
        )

    return result
