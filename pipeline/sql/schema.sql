-- MLS KeeperIQ relational schema (DuckDB)
-- The frontend still ships static JSON for Vercel; this database is the
-- analytical system of record used by SQL scouting queries and the R report.

CREATE TABLE IF NOT EXISTS teams (
    team_id             VARCHAR PRIMARY KEY,
    team_name           VARCHAR NOT NULL,
    team_abbreviation   VARCHAR,
    team_short_name     VARCHAR
);

CREATE TABLE IF NOT EXISTS players (
    player_id           VARCHAR PRIMARY KEY,
    player_name         VARCHAR NOT NULL,
    slug                VARCHAR NOT NULL UNIQUE,
    birth_date          DATE,
    nationality         VARCHAR,
    height_ft           INTEGER,
    height_in           INTEGER
);

CREATE TABLE IF NOT EXISTS matches (
    game_id             VARCHAR PRIMARY KEY,
    season              INTEGER NOT NULL,
    date_utc            DATE,
    home_team_id        VARCHAR REFERENCES teams(team_id),
    away_team_id        VARCHAR REFERENCES teams(team_id),
    matchday            INTEGER,
    status              VARCHAR,
    home_score          INTEGER,
    away_score          INTEGER
);

CREATE TABLE IF NOT EXISTS goalkeeper_season_stats (
    player_id           VARCHAR NOT NULL REFERENCES players(player_id),
    season              INTEGER NOT NULL,
    team_id             VARCHAR REFERENCES teams(team_id),
    minutes             DOUBLE NOT NULL,
    appearances         INTEGER,
    shots_faced         INTEGER,
    goals_conceded      INTEGER,
    saves               INTEGER,
    xgoals_faced        DOUBLE,
    save_pct            DOUBLE,
    goals_prevented     DOUBLE,
    goals_conceded_p96  DOUBLE,
    shots_faced_p96     DOUBLE,
    goals_prevented_p96 DOUBLE,
    ga_total            DOUBLE,
    ga_total_p96        DOUBLE,
    components_complete BOOLEAN,
    PRIMARY KEY (player_id, season)
);

CREATE TABLE IF NOT EXISTS goalkeeper_match_stats (
    player_id           VARCHAR NOT NULL REFERENCES players(player_id),
    game_id             VARCHAR NOT NULL REFERENCES matches(game_id),
    season              INTEGER NOT NULL,
    team_id             VARCHAR REFERENCES teams(team_id),
    date_utc            DATE,
    matchday            INTEGER,
    minutes             DOUBLE NOT NULL,
    shots_faced         INTEGER,
    goals_conceded      INTEGER,
    saves               INTEGER,
    xgoals_faced        DOUBLE,
    goals_prevented     DOUBLE,
    ga_total            DOUBLE,
    ga_total_p96        DOUBLE,
    PRIMARY KEY (player_id, game_id)
);

CREATE TABLE IF NOT EXISTS goalkeeper_components (
    player_id           VARCHAR NOT NULL REFERENCES players(player_id),
    season              INTEGER NOT NULL,
    game_id             VARCHAR,                  -- NULL = season aggregate
    component_key       VARCHAR NOT NULL,
    source_action_type  VARCHAR NOT NULL,
    goals_added         DOUBLE,
    goals_added_raw     DOUBLE,
    opportunities       DOUBLE,
    ga_p96              DOUBLE,
    opportunities_p96   DOUBLE,
    adjusted_p96        DOUBLE,
    reliability         DOUBLE,
    percentile          DOUBLE
);

CREATE TABLE IF NOT EXISTS keeperiq_ratings (
    player_id               VARCHAR NOT NULL REFERENCES players(player_id),
    season                  INTEGER NOT NULL,
    sample_status           VARCHAR NOT NULL,
    keeperiq                DOUBLE,
    adjusted_total_p96      DOUBLE,
    observed_total_p96      DOUBLE,
    reliability_total       DOUBLE,
    interval_low            DOUBLE,
    interval_high           DOUBLE,
    rank_adjusted           INTEGER,
    rank_observed           INTEGER,
    rank_goals_conceded     INTEGER,
    rank_disagreement       INTEGER,
    archetype_label         VARCHAR,
    changed_teams           BOOLEAN,
    methodology_version     VARCHAR NOT NULL,
    generated_at            TIMESTAMP NOT NULL,
    PRIMARY KEY (player_id, season)
);

CREATE TABLE IF NOT EXISTS talent_estimates (
    player_id               VARCHAR PRIMARY KEY REFERENCES players(player_id),
    talent_total_p96        DOUBLE,
    talent_low              DOUBLE,
    talent_high             DOUBLE,
    talent_sd               DOUBLE,
    talent_percentile       DOUBLE,
    talent_rank             INTEGER,
    weight_league_prior     DOUBLE,
    weight_prior_season     DOUBLE,
    weight_live_season      DOUBLE,
    prior_season_rate       DOUBLE,
    live_season_rate        DOUBLE,
    prior_season_minutes    DOUBLE,
    live_season_minutes     DOUBLE,
    league_prior_rate       DOUBLE,
    prior_source            VARCHAR,
    in_live_season          BOOLEAN,
    methodology_version     VARCHAR NOT NULL,
    generated_at            TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS ranking_snapshots (
    season                  INTEGER NOT NULL,
    captured_at             TIMESTAMP NOT NULL,
    source_fingerprint      VARCHAR,
    max_match_date          DATE,
    methodology_version     VARCHAR,
    player_id               VARCHAR NOT NULL REFERENCES players(player_id),
    slug                    VARCHAR,
    rank_adjusted           INTEGER,
    keeperiq                DOUBLE,
    adj_total_p96           DOUBLE,
    minutes                 DOUBLE,
    PRIMARY KEY (season, captured_at, player_id)
);

CREATE TABLE IF NOT EXISTS data_refreshes (
    refresh_id              VARCHAR PRIMARY KEY,
    attempted_at            TIMESTAMP NOT NULL,
    successful_at           TIMESTAMP,
    generated_at            TIMESTAMP NOT NULL,
    data_is_current         BOOLEAN NOT NULL,
    validation_status       VARCHAR NOT NULL,
    source_fingerprint      VARCHAR,
    methodology_version     VARCHAR NOT NULL,
    network_error_count     INTEGER,
    notes                   VARCHAR
);

CREATE TABLE IF NOT EXISTS scraped_rosters (
    scrape_run_id           VARCHAR NOT NULL,
    source                  VARCHAR NOT NULL,
    source_url              VARCHAR NOT NULL,
    team_name               VARCHAR NOT NULL,
    team_slug               VARCHAR,
    season_label            VARCHAR,
    jersey_number           VARCHAR,
    position_code           VARCHAR,
    nationality             VARCHAR,
    player_name             VARCHAR NOT NULL,
    is_goalkeeper           BOOLEAN NOT NULL,
    scraped_at              TIMESTAMP NOT NULL,
    content_sha256          VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS scrape_runs (
    scrape_run_id           VARCHAR PRIMARY KEY,
    started_at              TIMESTAMP NOT NULL,
    finished_at             TIMESTAMP,
    source                  VARCHAR NOT NULL,
    pages_attempted         INTEGER,
    pages_succeeded         INTEGER,
    robots_allowed          BOOLEAN,
    user_agent              VARCHAR,
    notes                   VARCHAR
);

CREATE INDEX IF NOT EXISTS idx_gk_season_season ON goalkeeper_season_stats(season);
CREATE INDEX IF NOT EXISTS idx_gk_match_season ON goalkeeper_match_stats(season);
CREATE INDEX IF NOT EXISTS idx_components_season ON goalkeeper_components(season, component_key);
CREATE INDEX IF NOT EXISTS idx_ratings_season ON keeperiq_ratings(season, rank_adjusted);
CREATE INDEX IF NOT EXISTS idx_scraped_gk ON scraped_rosters(is_goalkeeper, team_name);
