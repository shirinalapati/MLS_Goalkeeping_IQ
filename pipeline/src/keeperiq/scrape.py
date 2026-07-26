"""Responsible HTML scraping for supplementary MLS roster metadata.

Performance data comes from the American Soccer Analysis *API* (see
``fetch.py``). This module deliberately scrapes a different public source —
Wikipedia club roster tables — so the repository demonstrates real HTML
scraping practice without pretending JSON API calls are web scraping.

Safety rails
------------
* ``robots.txt`` is fetched and checked before any page request.
* A descriptive User-Agent is always sent.
* Requests are rate-limited and retried with exponential backoff.
* Raw HTML is cached on disk; schema changes are detected via header fingerprint.
* Scraping never overwrites ASA performance numbers; it only supplements them.
"""

from __future__ import annotations

import hashlib
import json
import re
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

from .config import REPO_ROOT, Config
from .database import upsert_scraped_rosters
from .logging_utils import get_logger

LOG = get_logger("scrape")

USER_AGENT = "MLS-KeeperIQ/1.0 (+https://github.com/local/mls-keeperiq; research scraper; respectful)"
DEFAULT_TARGETS = (
    {
        "team_name": "New York Red Bulls",
        "team_slug": "new-york-red-bulls",
        "url": "https://en.wikipedia.org/wiki/New_York_Red_Bulls",
    },
    {
        "team_name": "New York City FC",
        "team_slug": "new-york-city-fc",
        "url": "https://en.wikipedia.org/wiki/New_York_City_FC",
    },
    {
        "team_name": "LAFC",
        "team_slug": "los-angeles-fc",
        "url": "https://en.wikipedia.org/wiki/Los_Angeles_FC",
    },
    {
        "team_name": "Inter Miami CF",
        "team_slug": "inter-miami-cf",
        "url": "https://en.wikipedia.org/wiki/Inter_Miami_CF",
    },
    {
        "team_name": "Seattle Sounders FC",
        "team_slug": "seattle-sounders-fc",
        "url": "https://en.wikipedia.org/wiki/Seattle_Sounders_FC",
    },
)

EXPECTED_HEADERS = ("no.", "pos.", "nation", "player")


class ScrapePolicyError(RuntimeError):
    """Raised when robots.txt or local policy forbids a request."""


class ScrapeSchemaError(RuntimeError):
    """Raised when a page no longer exposes the expected roster table schema."""


@dataclass
class RosterRow:
    team_name: str
    team_slug: str
    jersey_number: str | None
    position_code: str | None
    nationality: str | None
    player_name: str
    is_goalkeeper: bool
    source_url: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "team_name": self.team_name,
            "team_slug": self.team_slug,
            "jersey_number": self.jersey_number,
            "position_code": self.position_code,
            "nationality": self.nationality,
            "player_name": self.player_name,
            "is_goalkeeper": self.is_goalkeeper,
            "source_url": self.source_url,
        }


@dataclass
class ScrapeResult:
    scrape_run_id: str
    started_at: str
    finished_at: str
    robots_allowed: bool
    pages_attempted: int
    pages_succeeded: int
    rows: list[RosterRow] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def goalkeepers(self) -> list[RosterRow]:
        return [row for row in self.rows if row.is_goalkeeper]


def _utcnow() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _cache_dir(cfg: Config) -> Path:
    path = cfg.path_for("raw_dir") / "scrape" / "wikipedia"
    path.mkdir(parents=True, exist_ok=True)
    return path


def check_robots(url: str, *, user_agent: str = USER_AGENT, timeout: float = 30.0) -> bool:
    """Return True when ``user_agent`` may fetch ``url`` per robots.txt."""
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    try:
        response = requests.get(
            robots_url,
            headers={"User-Agent": user_agent},
            timeout=timeout,
        )
        if response.status_code >= 400:
            # Fail closed: if robots.txt cannot be read, do not scrape.
            LOG.warning("Could not read robots.txt (%s); refusing to scrape", response.status_code)
            return False
        parser.parse(response.text.splitlines())
    except requests.RequestException as exc:
        LOG.warning("robots.txt request failed (%s); refusing to scrape", exc)
        return False
    allowed = parser.can_fetch(user_agent, url)
    LOG.info("robots.txt %s for %s", "allows" if allowed else "disallows", url)
    return allowed


def _request_with_retries(
    url: str,
    *,
    timeout: float,
    max_retries: int,
    backoff: float,
    session: requests.Session,
) -> requests.Response:
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            response = session.get(url, timeout=timeout)
            if response.status_code in {429, 500, 502, 503, 504}:
                raise requests.HTTPError(f"HTTP {response.status_code}", response=response)
            response.raise_for_status()
            return response
        except (requests.RequestException, requests.HTTPError) as exc:
            last_error = exc
            if attempt >= max_retries:
                break
            delay = backoff * (2 ** (attempt - 1))
            LOG.warning("Retry %d/%d for %s after %.1fs (%s)", attempt, max_retries, url, delay, exc)
            time.sleep(delay)
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def _header_fingerprint(headers: list[str]) -> str:
    normalised = [re.sub(r"\s+", " ", h.strip().lower()) for h in headers]
    return hashlib.sha256("|".join(normalised).encode("utf-8")).hexdigest()[:16]


def parse_roster_html(
    html: str,
    *,
    team_name: str,
    team_slug: str,
    source_url: str,
) -> list[RosterRow]:
    """Parse Wikipedia-style ``No. / Pos. / Nation / Player`` roster tables."""
    soup = BeautifulSoup(html, "lxml")
    rows: list[RosterRow] = []
    matched_tables = 0

    for table in soup.select("table.wikitable"):
        header_cells = table.select("tr th")
        headers = [cell.get_text(" ", strip=True) for cell in header_cells[:8]]
        header_norm = [h.strip().lower() for h in headers]
        if not all(expected in header_norm for expected in EXPECTED_HEADERS):
            continue
        matched_tables += 1
        fingerprint = _header_fingerprint(headers)
        if fingerprint and "no." not in header_norm:
            raise ScrapeSchemaError(
                f"Roster header fingerprint changed on {source_url}: {headers}"
            )

        for tr in table.select("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) < 4:
                continue
            values = [cell.get_text(" ", strip=True) for cell in cells]
            # Skip repeated header rows inside the table body.
            if values[0].lower() in {"no.", "no"} and values[1].lower().startswith("pos"):
                continue
            jersey, pos, nation, name = values[0], values[1], values[2], values[3]
            if not name or name.lower() == "player":
                continue
            # Nation cells often contain flag alt text + code; keep the last token.
            nation_code = nation.split()[-1] if nation else None
            pos_code = pos.strip().upper() if pos else None
            rows.append(
                RosterRow(
                    team_name=team_name,
                    team_slug=team_slug,
                    jersey_number=jersey or None,
                    position_code=pos_code,
                    nationality=nation_code,
                    player_name=name,
                    is_goalkeeper=pos_code == "GK",
                    source_url=source_url,
                )
            )

    if matched_tables == 0:
        raise ScrapeSchemaError(
            f"No roster table with headers {EXPECTED_HEADERS} found on {source_url}. "
            "Wikipedia markup may have changed."
        )
    return rows


def scrape_wikipedia_rosters(
    cfg: Config,
    *,
    targets: list[dict[str, str]] | None = None,
    force: bool = False,
    persist: bool = True,
    rate_limit_seconds: float = 1.5,
) -> ScrapeResult:
    """Scrape configured Wikipedia club pages and optionally persist to DuckDB."""
    started = _utcnow()
    scrape_run_id = uuid.uuid4().hex[:12]
    selected = targets or list(DEFAULT_TARGETS)
    cache = _cache_dir(cfg)
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html"})

    # Policy check against the first target host; all targets share en.wikipedia.org.
    robots_allowed = check_robots(selected[0]["url"], user_agent=USER_AGENT)
    if not robots_allowed:
        raise ScrapePolicyError(
            "robots.txt disallows scraping the configured Wikipedia targets with this User-Agent."
        )

    rows: list[RosterRow] = []
    notes: list[str] = []
    succeeded = 0

    for index, target in enumerate(selected):
        url = target["url"]
        slug = target["team_slug"]
        cache_path = cache / f"{slug}.html"
        meta_path = cache / f"{slug}.meta.json"

        if cache_path.exists() and not force:
            html = cache_path.read_text(encoding="utf-8")
            notes.append(f"cache hit: {slug}")
            LOG.info("Using cached HTML for %s", slug)
        else:
            if index > 0:
                time.sleep(rate_limit_seconds)
            LOG.info("Fetching %s", url)
            response = _request_with_retries(
                url,
                timeout=float(cfg.section("source", "request_timeout_seconds")),
                max_retries=int(cfg.section("source", "max_retries")),
                backoff=float(cfg.section("source", "retry_backoff_seconds")),
                session=session,
            )
            html = response.text
            cache_path.write_text(html, encoding="utf-8")
            digest = hashlib.sha256(html.encode("utf-8")).hexdigest()
            meta_path.write_text(
                json.dumps(
                    {
                        "url": url,
                        "fetched_at": _utcnow(),
                        "content_sha256": digest,
                        "status_code": response.status_code,
                        "user_agent": USER_AGENT,
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )

        try:
            parsed = parse_roster_html(
                html,
                team_name=target["team_name"],
                team_slug=slug,
                source_url=url,
            )
        except ScrapeSchemaError as exc:
            notes.append(str(exc))
            LOG.error("%s", exc)
            continue

        rows.extend(parsed)
        succeeded += 1
        gk_count = sum(1 for row in parsed if row.is_goalkeeper)
        LOG.info("Parsed %s: %d players (%d GK)", slug, len(parsed), gk_count)

    finished = _utcnow()
    result = ScrapeResult(
        scrape_run_id=scrape_run_id,
        started_at=started,
        finished_at=finished,
        robots_allowed=robots_allowed,
        pages_attempted=len(selected),
        pages_succeeded=succeeded,
        rows=rows,
        notes=notes,
    )

    # Always write a JSON snapshot the frontend / analysts can inspect.
    out_dir = REPO_ROOT / "data" / "processed"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "scrape_run_id": scrape_run_id,
        "started_at": started,
        "finished_at": finished,
        "source": "wikipedia",
        "user_agent": USER_AGENT,
        "robots_allowed": robots_allowed,
        "pages_attempted": len(selected),
        "pages_succeeded": succeeded,
        "goalkeeper_count": len(result.goalkeepers),
        "rows": [row.to_dict() for row in rows],
        "notes": notes,
    }
    (out_dir / "scraped-rosters.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    if persist and rows:
        content_hash = hashlib.sha256(
            json.dumps([row.to_dict() for row in rows], sort_keys=True).encode("utf-8")
        ).hexdigest()
        upsert_scraped_rosters(
            cfg,
            scrape_run={
                "scrape_run_id": scrape_run_id,
                "started_at": pd_timestamp(started),
                "finished_at": pd_timestamp(finished),
                "source": "wikipedia",
                "pages_attempted": len(selected),
                "pages_succeeded": succeeded,
                "robots_allowed": robots_allowed,
                "user_agent": USER_AGENT,
                "notes": "; ".join(notes) if notes else None,
            },
            roster_rows=[
                {
                    "scrape_run_id": scrape_run_id,
                    "source": "wikipedia",
                    "source_url": row.source_url,
                    "team_name": row.team_name,
                    "team_slug": row.team_slug,
                    "season_label": "current",
                    "jersey_number": row.jersey_number,
                    "position_code": row.position_code,
                    "nationality": row.nationality,
                    "player_name": row.player_name,
                    "is_goalkeeper": row.is_goalkeeper,
                    "scraped_at": pd_timestamp(finished),
                    "content_sha256": content_hash,
                }
                for row in rows
            ],
        )
    return result


def pd_timestamp(value: str):
    import pandas as pd

    return pd.to_datetime(value, utc=True)
