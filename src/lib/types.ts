/** Shared TypeScript contracts for the generated KeeperIQ JSON artefacts. */

export type SampleStatus = "qualified" | "provisional" | "limited";

export type ViewId = "2025" | "2026" | "talent";

export interface ComponentStats {
  observed_p96: number | null;
  adjusted_p96: number | null;
  baseline_p96: number | null;
  total: number | null;
  raw_total: number | null;
  percentile: number | null;
  observed_percentile: number | null;
  opportunities: number | null;
  opportunities_p96: number | null;
  reliability: number | null;
}

export interface NoteEntry {
  component: string;
  label: string;
  percentile: number | null;
  band: string;
  opportunities: number | null;
  text: string;
}

export interface SeasonPlayer {
  player_id: string;
  slug: string;
  name: string;
  season: number;
  team_id: string | null;
  team: string | null;
  team_abbreviation: string | null;
  changed_teams: boolean;
  nationality: string | null;
  birth_date: string | null;
  age: number | null;
  minutes: number | null;
  appearances: number | null;
  sample_status: SampleStatus;
  sample_status_label: string;
  keeperiq: number | null;
  keeperiq_low?: number | null;
  keeperiq_high?: number | null;
  adjusted_total_p96: number | null;
  observed_total_p96: number | null;
  baseline_total_p96: number | null;
  adjusted_total: number | null;
  reliability: number | null;
  interval_low: number | null;
  interval_high: number | null;
  interval_se: number | null;
  rank: number | null;
  rank_observed: number | null;
  rank_goals_conceded: number | null;
  rank_pool: number | null;
  rank_goals_conceded_pool: number | null;
  rank_disagreement: number | null;
  goals_conceded: number | null;
  goals_conceded_p96: number | null;
  shots_faced: number | null;
  shots_faced_p96: number | null;
  saves: number | null;
  save_pct: number | null;
  xgoals_faced: number | null;
  goals_prevented: number | null;
  goals_prevented_p96: number | null;
  previous_rank: number | null;
  rank_change: number | null;
  keeperiq_change: number | null;
  components: Record<string, ComponentStats>;
  archetype: string | null;
  notes: { strengths: NoteEntry[]; concerns: NoteEntry[] };
}

export interface QualificationRule {
  season: number;
  mode: string;
  qualified_minutes: number;
  provisional_minutes: number;
  max_goalkeeper_minutes: number | null;
  explanation: string;
}

export interface SeasonPayload {
  schema_version: string;
  season: number;
  is_live: boolean;
  methodology_version: string;
  generated_at: string;
  max_match_date: string | null;
  qualification: QualificationRule;
  counts: Record<SampleStatus, number>;
  players: SeasonPlayer[];
  league?: {
    average_adjusted_p96: number | null;
    average_keeperiq: number | null;
    note: string;
  };
}

export interface TalentPlayer {
  player_id: string;
  slug: string | null;
  name: string | null;
  team: string | null;
  team_abbreviation: string | null;
  nationality: string | null;
  birth_date: string | null;
  age: number | null;
  talent_p96: number | null;
  talent_low: number | null;
  talent_high: number | null;
  talent_sd: number | null;
  keeperiq: number | null;
  keeperiq_low: number | null;
  keeperiq_high: number | null;
  rank: number | null;
  weights: {
    league_prior: number | null;
    prior_season: number | null;
    live_season: number | null;
  };
  prior_season_rate: number | null;
  live_season_rate: number | null;
  prior_season_minutes: number | null;
  live_season_minutes: number | null;
  league_prior_rate: number | null;
  prior_source: string;
  in_live_season: boolean;
}

export interface TalentPayload {
  schema_version: string;
  generated_at: string;
  methodology_version: string;
  prior_season: number;
  live_season: number;
  max_match_date: string | null;
  model: Record<string, unknown>;
  players: TalentPlayer[];
}

export interface PlayerIndexEntry {
  player_id: string;
  slug: string;
  name: string;
  team: string | null;
  team_abbreviation: string | null;
  nationality: string | null;
  seasons: number[];
  talent_keeperiq?: number | null;
}

export interface PlayersIndex {
  schema_version: string;
  generated_at: string;
  seasons: number[];
  final_season: number;
  live_season: number;
  players: PlayerIndexEntry[];
}

export interface MatchPoint {
  game_id: string;
  date: string | null;
  matchday: number | null;
  minutes: number | null;
  total_ga: number | null;
  total_ga_p96: number | null;
  rolling_total_ga_p96: number | null;
  goals_conceded: number | null;
  shots_faced: number | null;
  saves: number | null;
  xgoals_faced: number | null;
  goals_prevented: number | null;
  components: Record<string, number | null>;
}

export interface PlayerProfile {
  schema_version: string;
  player_id: string;
  slug: string;
  name: string;
  generated_at: string;
  methodology_version: string;
  seasons: Record<
    string,
    SeasonPlayer & {
      timeline: MatchPoint[];
      rolling_form: Array<{
        date: string | null;
        matchday: number | null;
        matches_in_window: number;
        rate_p96: number;
      }>;
      ranking_history: Array<{
        captured_at: string;
        max_match_date: string | null;
        rank: number;
        keeperiq: number | null;
        adj_total_p96: number | null;
      }>;
      team_stints: Array<{
        team_id: string;
        team_name: string;
        team_abbreviation: string;
        appearances: number;
        minutes: number;
        first_match: string | null;
        last_match: string | null;
      }>;
    }
  >;
  available_seasons: number[];
  talent: TalentPlayer | null;
}

export interface DataStatus {
  schema_version: string;
  pipeline_version: string;
  methodology_version: string;
  last_attempted_update: string;
  last_successful_update: string;
  generated_at: string;
  data_is_current: boolean;
  fallback_reason: string | null;
  source_fingerprint: string;
  source: {
    provider: string;
    attribution_url: string;
    league: string;
  };
  network_errors: string[];
  seasons: Record<
    string,
    {
      goalkeepers: number;
      matches_covered: number;
      goalkeeper_match_rows: number;
      max_match_date: string | null;
      sample_counts: Record<SampleStatus, number>;
      total_minutes: number;
      qualification: QualificationRule;
    }
  >;
  row_counts: Record<string, number>;
  resources: Array<{
    resource: string;
    rows: number;
    fetched_at: string;
    from_cache: boolean;
  }>;
  fresh_resources: number;
  validation: Array<{ severity: string; check: string; detail: string }>;
  validation_status: string;
  reliability_sources: Record<string, string>;
  snapshots_written: string[];
  snapshot_counts: Record<string, number>;
}

export interface MethodologyPayload {
  schema_version: string;
  generated_at: string;
  methodology_version: string;
  minutes_basis: number;
  primary_value_field: string;
  source: {
    provider: string;
    attribution_url: string;
    league: string;
    base_url: string;
  };
  components: Array<{
    key: string;
    label: string;
    source_action_type: string;
    opportunity_label: string;
    description: string;
    k: number;
    source: string;
    reliability_at_median: number | null;
    median_opportunities: number | null;
    split_half_correlation: number | null;
    spearman_brown_reliability: number | null;
    year_over_year_correlation: number | null;
    note: string;
  }>;
  volumes: Record<string, { k_minutes: number; source: string; league_rate_p96: number; note: string }>;
  league_baselines: Record<string, unknown>;
  total: Record<string, unknown>;
  reliability_seasons: number[];
  bootstrap: Record<string, unknown>;
  qualification: Record<string, QualificationRule>;
  profile_thresholds: Record<string, number>;
  talent: Record<string, unknown>;
}

export interface ArchetypesPayload {
  schema_version: string;
  generated_at: string;
  methodology_version: string;
  default_season: number;
  seasons: Record<
    string,
    {
      available: boolean;
      reason: string | null;
      profiles: Array<{
        cluster_id: number;
        label: string;
        description: string;
        size: number;
        distinctive_variables: string[];
        centroid: Record<string, number>;
        centroid_raw: Record<string, number>;
        median_keeperiq: number | null;
      }>;
      diagnostics: Record<string, unknown> | null;
      members: Array<{
        player_id: string;
        slug: string;
        name: string;
        team: string | null;
        cluster_id: number;
        label: string;
        keeperiq: number | null;
        adjusted_total_p96: number | null;
        minutes: number | null;
        involvement: Record<string, number | null>;
      }>;
    }
  >;
}

export interface ComparisonsPayload {
  schema_version: string;
  generated_at: string;
  seasons: Record<
    string,
    {
      pool_size: number;
      correlations: Record<string, number | null>;
      points: Array<Record<string, string | number | null>>;
      better_by_keeperiq: Array<Record<string, string | number | null>>;
      worse_by_keeperiq: Array<Record<string, string | number | null>>;
    }
  >;
}

export const COMPONENT_ORDER = [
  "shot_stopping",
  "handling",
  "claiming",
  "sweeping",
  "passing",
  "fielding",
] as const;

export type ComponentKey = (typeof COMPONENT_ORDER)[number];

export const COMPONENT_LABELS: Record<ComponentKey, string> = {
  shot_stopping: "Shot Stopping",
  handling: "Handling",
  claiming: "Claiming",
  sweeping: "Sweeping",
  passing: "Passing",
  fielding: "Fielding",
};
