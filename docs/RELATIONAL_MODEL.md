# KeeperIQ relational model

The Next.js application reads static JSON from `public/data/` so it can deploy to Vercel without a running database. The analytical system of record is a **DuckDB** file at `data/keeperiq.duckdb`.

DuckDB was chosen because it:

- is a real SQL engine with primary keys, joins, and window functions
- is a single file that travels with the repository
- is equally accessible from Python (`duckdb`) and R (`DBI` + `duckdb`)
- does not require operating a PostgreSQL server for local research or CI

If a production club environment preferred PostgreSQL, the schema in `pipeline/sql/schema.sql` maps almost one-to-one.

## Entity relationship overview

```
teams ──┐
        ├── matches
players ┤
        ├── goalkeeper_season_stats
        ├── goalkeeper_match_stats ── matches
        ├── goalkeeper_components
        ├── keeperiq_ratings
        ├── talent_estimates
        └── ranking_snapshots

data_refreshes          (pipeline audit)
scrape_runs             (HTML scrape audit)
scraped_rosters         (Wikipedia roster rows)
```

## Core tables

| Table | Grain | Purpose |
| --- | --- | --- |
| `teams` | one row per ASA team id | Club metadata |
| `players` | one row per ASA player id | Identity, slug, bio |
| `matches` | one row per MLS game | Schedule / results for join keys |
| `goalkeeper_season_stats` | player × season | Minutes, shots, goals, totals |
| `goalkeeper_match_stats` | player × game | Match-level G+ and traditional stats |
| `goalkeeper_components` | player × season × component | Six Goals Added components |
| `keeperiq_ratings` | player × season | KeeperIQ, ranks, intervals, sample status |
| `talent_estimates` | one row per player | Current-talent blend and weights |
| `ranking_snapshots` | player × season × capture time | Historical ranks for movement |
| `data_refreshes` | one row per pipeline run | Freshness / validation audit |
| `scraped_rosters` | scrape row | Wikipedia roster HTML extracts |
| `scrape_runs` | one row per scrape | robots/rate-limit audit |

## Keys and integrity

- Primary keys are declared in `pipeline/sql/schema.sql`.
- Foreign keys reference `players`, `teams`, and `matches`.
- DuckDB enforces these on insert; the loader also runs `pipeline/sql/data_quality.sql`.

## Views

| View | Use |
| --- | --- |
| `v_season_leaderboard` | Scout-ready season board |
| `v_component_matrix` | Component percentiles / rates |
| `v_rank_disagreement` | KeeperIQ vs goals-allowed rank gaps |
| `v_talent_board` | Current-talent shortlist |
| `v_match_form` | Rolling form with window functions |
| `v_scraped_goalkeepers` | Wikipedia GK roster slice |

## Example scouting SQL

See `pipeline/sql/scouting_queries.sql` for copy-paste queries, including:

1. New York Red Bulls 2026 goalkeeper evaluation
2. Keepers underrated by goals allowed
3. Component radar table for 2025 starters
4. Year-over-year KeeperIQ deltas via `LAG()`
5. Current-talent shortlist with evidence weights
6. Rolling form for a club starter
7. Join of scraped Wikipedia GKs to KeeperIQ ratings

```bash
duckdb data/keeperiq.duckdb < pipeline/sql/scouting_queries.sql
```

## Rebuild

```bash
PYTHONPATH=pipeline/src python -m keeperiq.cli build --offline
```

The build recreates modelled tables and preserves `scraped_*` tables across runs.
