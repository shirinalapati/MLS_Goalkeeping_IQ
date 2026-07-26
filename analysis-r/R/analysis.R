#' Spearman year-to-year stability of adjusted total G+/96 among shared keepers.
yoy_stability <- function(ratings) {
  wide <- ratings |>
    dplyr::filter(sample_status %in% c("qualified", "provisional")) |>
    dplyr::select(player_id, season, adjusted_total_p96) |>
    tidyr::pivot_wider(
      names_from = season,
      values_from = adjusted_total_p96,
      names_prefix = "y"
    )
  years <- grep("^y", names(wide), value = TRUE)
  if (length(years) < 2) {
    return(tibble::tibble(season_pair = character(), spearman = double(), n = integer()))
  }
  pairs <- utils::combn(years, 2, simplify = FALSE)
  purrr::map_dfr(pairs, function(pair) {
    sub <- wide |>
      dplyr::select(player_id, dplyr::all_of(pair)) |>
      tidyr::drop_na()
    tibble::tibble(
      season_pair = paste(sub("y", "", pair), collapse = "→"),
      spearman = suppressWarnings(cor(sub[[pair[1]]], sub[[pair[2]]], method = "spearman")),
      n = nrow(sub)
    )
  })
}

#' Bootstrap the mean adjusted total G+/96 for one goalkeeper's match sample.
bootstrap_player_mean <- function(match_rates, R = 1000L, seed = 20260101L) {
  if (length(match_rates) < 3) {
    return(list(t0 = mean(match_rates), conf = c(NA_real_, NA_real_), R = 0L))
  }
  set.seed(seed)
  boot_obj <- boot::boot(
    data = match_rates,
    statistic = function(data, idx) mean(data[idx], na.rm = TRUE),
    R = R
  )
  ci <- tryCatch(
    boot::boot.ci(boot_obj, type = "perc", conf = 0.90)$percent[4:5],
    error = function(e) c(NA_real_, NA_real_)
  )
  list(t0 = boot_obj$t0, conf = ci, R = R)
}

#' Component correlation matrix for a season.
component_cors <- function(components, season) {
  mat <- components |>
    dplyr::filter(.data$season == .env$season, sample_status == "qualified") |>
    dplyr::select(player_name, component_key, adjusted_p96) |>
    tidyr::pivot_wider(names_from = component_key, values_from = adjusted_p96) |>
    dplyr::select(-player_name) |>
    stats::cor(use = "pairwise.complete.obs", method = "spearman")
  mat
}
