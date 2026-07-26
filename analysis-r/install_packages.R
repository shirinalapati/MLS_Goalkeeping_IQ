#!/usr/bin/env Rscript

pkgs <- c(
  "tidyverse",
  "DBI",
  "duckdb",
  "ggplot2",
  "boot",
  "corrplot",
  "knitr",
  "rmarkdown",
  "scales",
  "gt"
)

installed <- rownames(installed.packages())
missing <- setdiff(pkgs, installed)
if (length(missing)) {
  message("Installing: ", paste(missing, collapse = ", "))
  install.packages(missing, repos = "https://cloud.r-project.org")
} else {
  message("All required R packages are already installed.")
}
