# Responsible web scraping

Performance statistics for KeeperIQ come from the **American Soccer Analysis
HTTP API** (`pipeline/src/keeperiq/fetch.py`). That is API ingestion, not HTML
scraping.

To demonstrate genuine scraping practice for roster metadata, the repository
includes a separate scraper:

```
pipeline/src/keeperiq/scrape.py
```

## What is scraped

Public **Wikipedia club roster tables** for selected MLS clubs (including the
New York Red Bulls). These HTML tables expose:

- jersey number
- position code (`GK`, `DF`, …)
- nationality
- player name

The scraper is used to:

- validate / enrich club goalkeeper lists
- join scraped roster GKs to KeeperIQ ratings in SQL (`scouting_queries.sql` Q7)
- prove HTML parsing, robots compliance, caching, and schema-change detection

It does **not** replace ASA Goals Added or invent performance numbers from HTML.

## Safety rails

| Control | Implementation |
| --- | --- |
| robots.txt | Fetched and checked with `urllib.robotparser` before any page request |
| User-Agent | `MLS-KeeperIQ/1.0 (+…; research scraper; respectful)` |
| Rate limiting | Default 1.5s pause between page requests |
| Retries | Exponential backoff on 429/5xx |
| Cache | Raw HTML + SHA-256 metadata under `data/raw/scrape/wikipedia/` |
| Schema detection | Requires `No. / Pos. / Nation / Player` headers; fails loudly otherwise |
| Tests | Saved HTML fixtures in `pipeline/tests/fixtures/` |

## Commands

```bash
# Scrape (network) and persist into DuckDB
npm run pipeline:scrape

# Force re-download
PYTHONPATH=pipeline/src .venv/bin/python -m keeperiq.cli scrape --force
```

Outputs:

- `data/processed/scraped-rosters.json`
- DuckDB tables `scrape_runs`, `scraped_rosters`
- cached HTML in `data/raw/scrape/wikipedia/`

## Why Wikipedia and not MLS.com salary PDFs

- Wikipedia roster tables are stable, public HTML with a clear structure.
- MLS Players Association salary guides are usually PDF releases with their own
  redistribution terms; this project does not scrape or republish salary PDFs.
- ASA already covers performance; scraping salaries is unnecessary for KeeperIQ
  and would blur the API-vs-scrape distinction this module is meant to show.
