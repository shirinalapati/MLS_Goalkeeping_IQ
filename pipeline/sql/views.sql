-- Analytical views used by scouting SQL and the R report.

CREATE OR REPLACE VIEW v_season_leaderboard AS
SELECT
    r.season,
    r.player_id,
    r.rank_adjusted,
    p.player_name,
    p.slug,
    t.team_abbreviation,
    t.team_name,
    r.sample_status,
    r.keeperiq,
    r.adjusted_total_p96,
    r.observed_total_p96,
    r.reliability_total,
    r.interval_low,
    r.interval_high,
    s.minutes,
    s.appearances,
    s.goals_conceded,
    s.goals_conceded_p96,
    s.save_pct,
    s.goals_prevented,
    s.goals_prevented_p96,
    r.rank_goals_conceded,
    r.rank_disagreement,
    r.archetype_label
FROM keeperiq_ratings r
JOIN players p USING (player_id)
LEFT JOIN goalkeeper_season_stats s
    ON s.player_id = r.player_id AND s.season = r.season
LEFT JOIN teams t ON t.team_id = s.team_id;

CREATE OR REPLACE VIEW v_component_matrix AS
SELECT
    c.season,
    c.player_id,
    p.player_name,
    p.slug,
    c.component_key,
    c.goals_added,
    c.ga_p96,
    c.adjusted_p96,
    c.opportunities,
    c.reliability,
    c.percentile,
    r.keeperiq,
    r.sample_status
FROM goalkeeper_components c
JOIN players p USING (player_id)
JOIN keeperiq_ratings r
    ON r.player_id = c.player_id AND r.season = c.season
WHERE c.game_id IS NULL;

CREATE OR REPLACE VIEW v_rank_disagreement AS
SELECT
    season,
    player_id,
    player_name,
    slug,
    team_abbreviation,
    sample_status,
    keeperiq,
    rank_adjusted AS keeperiq_rank,
    rank_goals_conceded AS goals_allowed_rank,
    rank_disagreement,
    CASE
        WHEN rank_disagreement > 0 THEN 'better_by_keeperiq'
        WHEN rank_disagreement < 0 THEN 'worse_by_keeperiq'
        ELSE 'aligned'
    END AS disagreement_direction,
    goals_conceded_p96,
    adjusted_total_p96,
    minutes
FROM v_season_leaderboard
WHERE sample_status IN ('qualified', 'provisional')
  AND rank_disagreement IS NOT NULL;

CREATE OR REPLACE VIEW v_talent_board AS
SELECT
    te.talent_rank,
    te.player_id,
    p.player_name,
    p.slug,
    te.talent_percentile AS keeperiq_talent,
    te.talent_total_p96,
    te.talent_low,
    te.talent_high,
    te.weight_league_prior,
    te.weight_prior_season,
    te.weight_live_season,
    te.prior_source,
    te.prior_season_minutes,
    te.live_season_minutes,
    te.in_live_season
FROM talent_estimates te
JOIN players p USING (player_id);

CREATE OR REPLACE VIEW v_match_form AS
SELECT
    m.player_id,
    p.player_name,
    m.season,
    m.game_id,
    m.date_utc,
    m.matchday,
    m.minutes,
    m.ga_total,
    m.ga_total_p96,
    m.goals_conceded,
    m.shots_faced,
    m.goals_prevented,
    SUM(m.ga_total) OVER (
        PARTITION BY m.player_id, m.season
        ORDER BY m.date_utc, m.game_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_ga,
    SUM(m.minutes) OVER (
        PARTITION BY m.player_id, m.season
        ORDER BY m.date_utc, m.game_id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS cumulative_minutes,
    AVG(m.ga_total_p96) OVER (
        PARTITION BY m.player_id, m.season
        ORDER BY m.date_utc, m.game_id
        ROWS BETWEEN 4 PRECEDING AND CURRENT ROW
    ) AS rolling_5_match_ga_p96
FROM goalkeeper_match_stats m
JOIN players p USING (player_id);

CREATE OR REPLACE VIEW v_scraped_goalkeepers AS
SELECT
    scrape_run_id,
    team_name,
    team_slug,
    jersey_number,
    player_name,
    nationality,
    position_code,
    scraped_at,
    source_url
FROM scraped_rosters
WHERE is_goalkeeper;
