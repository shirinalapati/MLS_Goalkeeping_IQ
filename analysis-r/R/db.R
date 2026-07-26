#' Locate the repository root by walking upward until data/keeperiq.duckdb exists.
repo_root <- function(start = getwd()) {
  path <- normalizePath(start, mustWork = TRUE)
  for (i in seq_len(8)) {
    candidate <- file.path(path, "data", "keeperiq.duckdb")
    if (file.exists(candidate)) {
      return(path)
    }
    parent <- dirname(path)
    if (identical(parent, path)) break
    path <- parent
  }
  stop(
    "Could not locate data/keeperiq.duckdb from ", start,
    ". Run the Python pipeline first."
  )
}

#' Connect to the KeeperIQ DuckDB database (read-only).
connect_keeperiq <- function(db_path = NULL) {
  root <- repo_root()
  path <- if (is.null(db_path)) file.path(root, "data", "keeperiq.duckdb") else db_path
  DBI::dbConnect(duckdb::duckdb(), dbdir = path, read_only = TRUE)
}
