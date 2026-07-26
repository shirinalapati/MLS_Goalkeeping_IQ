#!/usr/bin/env Rscript

args <- commandArgs(trailingOnly = FALSE)
file_arg <- grep("^--file=", args, value = TRUE)
script_dir <- if (length(file_arg)) {
  dirname(normalizePath(sub("^--file=", "", file_arg)))
} else {
  normalizePath("analysis-r")
}

setwd(script_dir)
dir.create("output", showWarnings = FALSE)

required <- c("tidyverse", "DBI", "duckdb", "boot", "scales", "gt", "rmarkdown", "knitr")
missing <- required[!vapply(required, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing)) {
  stop(
    "Missing R packages: ", paste(missing, collapse = ", "),
    "\nRun: Rscript analysis-r/install_packages.R"
  )
}

quarto_bin <- Sys.which("quarto")
html <- file.path("output", "keeperiq-analysis.html")

if (nzchar(quarto_bin) && file.exists("keeperiq-analysis.qmd")) {
  message("Rendering with Quarto CLI…")
  status <- system2(
    quarto_bin,
    c("render", "keeperiq-analysis.qmd", "--output-dir", "output"),
    stdout = TRUE,
    stderr = TRUE
  )
  writeLines(status)
  if (!is.null(attr(status, "status")) && attr(status, "status") != 0) {
    stop("Quarto render failed")
  }
} else {
  message("Rendering via rmarkdown::render (keeperiq-analysis.Rmd)…")
  rmarkdown::render(
    input = "keeperiq-analysis.Rmd",
    output_file = "keeperiq-analysis.html",
    output_dir = "output",
    quiet = FALSE
  )
}

if (!file.exists(html)) {
  alt <- "keeperiq-analysis.html"
  if (file.exists(alt)) {
    file.rename(alt, html)
  }
}
if (!file.exists(html)) {
  stop("Expected report missing: ", html)
}
message("Report ready: ", normalizePath(html))
