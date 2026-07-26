# R analysis — MLS KeeperIQ

This directory is a **reproducible R analysis layer** on top of the DuckDB
database built by the Python pipeline. It is intentionally not a rewrite of the
ETL: Python owns ingestion and scoring; R owns statistical exploration and
reporting.

## What it demonstrates

- `DBI` + `duckdb` SQL access to the relational model
- `tidyverse` wrangling
- `ggplot2` visualisation
- Bootstrap uncertainty with `boot` / base R resampling
- Year-to-year stability, rank disagreement, component correlations
- New York Red Bulls goalkeeper trends
- Quarto HTML report output

## Setup

```bash
# From the repository root, ensure DuckDB exists:
npm run pipeline:offline   # or npm run pipeline

# Install R packages (once)
Rscript analysis-r/install_packages.R
```

## Render the report

```bash
npm run analysis:r
# or: Rscript analysis-r/render.R
```

Output: `analysis-r/output/keeperiq-analysis.html`

`render.R` uses the Quarto CLI when available; otherwise it falls back to
`rmarkdown::render` on `keeperiq-analysis.Rmd` (same analysis content).

## Main entry point

- `keeperiq-analysis.qmd` — Quarto report (preferred when `quarto` is installed)
- `keeperiq-analysis.Rmd` — R Markdown fallback (no Quarto CLI required)
- `R/db.R` — DuckDB connection helpers
- `R/analysis.R` — reusable analysis functions

**Note:** installing the R `duckdb` package can take several minutes because it
compiles the DuckDB C++ library from source on first install.
