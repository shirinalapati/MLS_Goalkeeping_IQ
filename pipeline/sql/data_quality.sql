-- Data-quality checks. Each query returns zero rows when the check passes.
-- The Python loader executes them and fails the build on any residual rows
-- marked severity = 'error'.

-- DQ-01: orphan season stats without a player
SELECT 'error' AS severity, 'orphan_season_player' AS check_id,
       COUNT(*)::VARCHAR AS detail
FROM goalkeeper_season_stats s
LEFT JOIN players p USING (player_id)
WHERE p.player_id IS NULL
HAVING COUNT(*) > 0;

-- DQ-02: duplicate player-season ratings
SELECT 'error' AS severity, 'duplicate_ratings' AS check_id,
       player_id || '/' || season::VARCHAR AS detail
FROM keeperiq_ratings
GROUP BY player_id, season
HAVING COUNT(*) > 1;

-- DQ-03: KeeperIQ outside [0, 100]
SELECT 'error' AS severity, 'keeperiq_bounds' AS check_id,
       player_id || ' season ' || season::VARCHAR || ' = ' || keeperiq::VARCHAR AS detail
FROM keeperiq_ratings
WHERE keeperiq IS NOT NULL
  AND (keeperiq < 0 OR keeperiq > 100);

-- DQ-04: zero-minute seasons with non-null rates
SELECT 'warning' AS severity, 'zero_minute_rate' AS check_id,
       player_id || '/' || season::VARCHAR AS detail
FROM goalkeeper_season_stats
WHERE minutes <= 0 AND ga_total_p96 IS NOT NULL;

-- DQ-05: match rows whose game_id is missing from matches
SELECT 'error' AS severity, 'orphan_match_game' AS check_id,
       COUNT(*)::VARCHAR AS detail
FROM goalkeeper_match_stats g
LEFT JOIN matches m USING (game_id)
WHERE m.game_id IS NULL
HAVING COUNT(*) > 0;

-- DQ-06: component rows without a known component key
SELECT 'error' AS severity, 'unknown_component' AS check_id,
       component_key AS detail
FROM goalkeeper_components
WHERE component_key NOT IN (
    'shot_stopping', 'handling', 'claiming', 'sweeping', 'passing', 'fielding'
)
GROUP BY component_key;

-- DQ-07: talent weights that do not sum to ~1
SELECT 'warning' AS severity, 'talent_weight_sum' AS check_id,
       player_id || ' sum=' ||
       ROUND(weight_league_prior + weight_prior_season + weight_live_season, 3)::VARCHAR AS detail
FROM talent_estimates
WHERE ABS((weight_league_prior + weight_prior_season + weight_live_season) - 1.0) > 0.02;

-- DQ-08: season without any qualified goalkeepers
SELECT 'warning' AS severity, 'no_qualified_keepers' AS check_id,
       season::VARCHAR AS detail
FROM keeperiq_ratings
GROUP BY season
HAVING SUM(CASE WHEN sample_status = 'qualified' THEN 1 ELSE 0 END) = 0;
