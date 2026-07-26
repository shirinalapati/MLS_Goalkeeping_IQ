-- Example scouting queries for MLS KeeperIQ.
-- Run against data/keeperiq.duckdb, e.g.:
--   duckdb data/keeperiq.duckdb < pipeline/sql/scouting_queries.sql

-- =============================================================================
-- Q1. Current Red Bulls goalkeeper evaluation (2026 live)
-- =============================================================================
SELECT
    rank_adjusted,
    player_name,
    sample_status,
    keeperiq,
    adjusted_total_p96,
    observed_total_p96,
    goals_conceded_p96,
    save_pct,
    goals_prevented_p96,
    minutes,
    archetype_label,
    rank_disagreement
FROM v_season_leaderboard
WHERE season = 2026
  AND (team_abbreviation IN ('NYRB', 'RBNY', 'NY')
       OR team_name ILIKE '%red bull%')
ORDER BY rank_adjusted;

-- =============================================================================
-- Q2. Goalkeepers whose KeeperIQ rank is much better than goals-allowed rank
--     (context-adjusted value that traditional metrics underrate)
-- =============================================================================
SELECT
    season,
    player_name,
    team_abbreviation,
    keeperiq_rank,
    goals_allowed_rank,
    rank_disagreement,
    keeperiq,
    adjusted_total_p96,
    goals_conceded_p96,
    minutes
FROM v_rank_disagreement
WHERE season = 2025
  AND disagreement_direction = 'better_by_keeperiq'
ORDER BY rank_disagreement DESC
LIMIT 15;

-- =============================================================================
-- Q3. Component profile for high-minute 2025 starters (window + unpivot style)
-- =============================================================================
SELECT
    player_name,
    MAX(CASE WHEN component_key = 'shot_stopping' THEN percentile END) AS shot_stopping_pct,
    MAX(CASE WHEN component_key = 'handling' THEN percentile END) AS handling_pct,
    MAX(CASE WHEN component_key = 'claiming' THEN percentile END) AS claiming_pct,
    MAX(CASE WHEN component_key = 'sweeping' THEN percentile END) AS sweeping_pct,
    MAX(CASE WHEN component_key = 'passing' THEN percentile END) AS passing_pct,
    MAX(CASE WHEN component_key = 'fielding' THEN percentile END) AS fielding_pct,
    MAX(keeperiq) AS keeperiq
FROM v_component_matrix
WHERE season = 2025
  AND sample_status = 'qualified'
GROUP BY player_name
ORDER BY keeperiq DESC
LIMIT 20;

-- =============================================================================
-- Q4. Year-over-year KeeperIQ movement using window functions
-- =============================================================================
WITH ranked AS (
    SELECT
        player_id,
        season,
        keeperiq,
        adjusted_total_p96,
        sample_status,
        LAG(keeperiq) OVER (PARTITION BY player_id ORDER BY season) AS prev_keeperiq,
        LAG(adjusted_total_p96) OVER (PARTITION BY player_id ORDER BY season) AS prev_adj
    FROM keeperiq_ratings
)
SELECT
    p.player_name,
    r.season,
    r.sample_status,
    r.prev_keeperiq,
    r.keeperiq,
    ROUND(r.keeperiq - r.prev_keeperiq, 1) AS keeperiq_delta,
    r.prev_adj,
    r.adjusted_total_p96,
    ROUND(r.adjusted_total_p96 - r.prev_adj, 3) AS adj_delta
FROM ranked r
JOIN players p USING (player_id)
WHERE r.season = 2026
  AND r.prev_keeperiq IS NOT NULL
ORDER BY keeperiq_delta DESC;

-- =============================================================================
-- Q5. Current-talent shortlist: high talent, meaningful 2026 evidence
-- =============================================================================
SELECT
    talent_rank,
    player_name,
    keeperiq_talent,
    talent_total_p96,
    ROUND(100 * weight_live_season, 1) AS pct_weight_2026,
    ROUND(100 * weight_prior_season, 1) AS pct_weight_2025,
    ROUND(100 * weight_league_prior, 1) AS pct_weight_prior,
    live_season_minutes,
    prior_season_minutes,
    prior_source
FROM v_talent_board
WHERE live_season_minutes >= 450
ORDER BY talent_rank
LIMIT 20;

-- =============================================================================
-- Q6. Rolling form for a club's primary 2026 starter (last 8 appearances)
-- =============================================================================
SELECT
    player_name,
    date_utc,
    matchday,
    minutes,
    ROUND(ga_total, 3) AS match_ga,
    ROUND(ga_total_p96, 2) AS match_ga_p96,
    ROUND(rolling_5_match_ga_p96, 2) AS rolling_5_ga_p96,
    goals_conceded,
    shots_faced,
    ROUND(goals_prevented, 2) AS goals_prevented
FROM v_match_form
WHERE season = 2026
  AND player_name IN (
      SELECT player_name
      FROM v_season_leaderboard
      WHERE season = 2026
        AND team_name ILIKE '%red bull%'
      ORDER BY minutes DESC
      LIMIT 1
  )
ORDER BY date_utc DESC
LIMIT 8;

-- =============================================================================
-- Q7. Join scraped Wikipedia roster GKs to KeeperIQ ratings
-- =============================================================================
SELECT
    s.team_name AS wiki_team,
    s.jersey_number,
    s.player_name AS wiki_name,
    s.nationality AS wiki_nation,
    p.slug,
    r.season,
    r.keeperiq,
    r.adjusted_total_p96,
    r.sample_status,
    r.rank_adjusted
FROM v_scraped_goalkeepers s
LEFT JOIN players p
    ON LOWER(REPLACE(p.player_name, '.', ''))
     = LOWER(REPLACE(s.player_name, '.', ''))
    OR p.player_name ILIKE '%' || SPLIT_PART(s.player_name, ' ', -1) || '%'
LEFT JOIN keeperiq_ratings r
    ON r.player_id = p.player_id
   AND r.season = 2026
WHERE s.team_name ILIKE '%red bull%'
ORDER BY TRY_CAST(s.jersey_number AS INTEGER), s.player_name;
