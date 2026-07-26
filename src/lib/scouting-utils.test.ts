import { describe, expect, it } from "vitest";

import {
  DEFAULT_BRIEF,
  componentSimilarity,
  runScoutingBrief,
  scoreMatch,
  type ScoutingBrief,
} from "@/lib/scouting-utils";
import type { SeasonPlayer } from "@/lib/types";

function makePlayer(overrides: Partial<SeasonPlayer> = {}): SeasonPlayer {
  const baseComponents = {
    shot_stopping: {
      observed_p96: 0.1,
      adjusted_p96: 0.1,
      baseline_p96: 0,
      total: 1,
      raw_total: 1,
      percentile: 70,
      observed_percentile: 70,
      opportunities: 100,
      opportunities_p96: 8,
      reliability: 0.4,
    },
    handling: {
      observed_p96: 0,
      adjusted_p96: 0,
      baseline_p96: 0,
      total: 0,
      raw_total: 0,
      percentile: 50,
      observed_percentile: 50,
      opportunities: 40,
      opportunities_p96: 3,
      reliability: 0.3,
    },
    claiming: {
      observed_p96: 0,
      adjusted_p96: 0,
      baseline_p96: 0,
      total: 0,
      raw_total: 0,
      percentile: 45,
      observed_percentile: 45,
      opportunities: 20,
      opportunities_p96: 1.5,
      reliability: 0.2,
    },
    sweeping: {
      observed_p96: 0.05,
      adjusted_p96: 0.05,
      baseline_p96: 0,
      total: 0.5,
      raw_total: 0.5,
      percentile: 60,
      observed_percentile: 60,
      opportunities: 30,
      opportunities_p96: 2,
      reliability: 0.25,
    },
    passing: {
      observed_p96: 0.02,
      adjusted_p96: 0.02,
      baseline_p96: 0,
      total: 0.2,
      raw_total: 0.2,
      percentile: 55,
      observed_percentile: 55,
      opportunities: 80,
      opportunities_p96: 6,
      reliability: 0.35,
    },
    fielding: {
      observed_p96: 0,
      adjusted_p96: 0,
      baseline_p96: 0,
      total: 0,
      raw_total: 0,
      percentile: 40,
      observed_percentile: 40,
      opportunities: 10,
      opportunities_p96: 0.8,
      reliability: 0.15,
    },
  };

  return {
    player_id: "p1",
    slug: "keeper-one",
    name: "Keeper One",
    season: 2026,
    team_id: "t1",
    team: "Example FC",
    team_abbreviation: "EXF",
    changed_teams: false,
    nationality: "USA",
    birth_date: "1998-01-15",
    age: 28,
    minutes: 1200,
    appearances: 14,
    sample_status: "qualified",
    sample_status_label: "Qualified",
    keeperiq: 72,
    adjusted_total_p96: 0.2,
    observed_total_p96: 0.22,
    baseline_total_p96: 0,
    adjusted_total: 2.5,
    reliability: 0.4,
    interval_low: 0.1,
    interval_high: 0.3,
    interval_se: 0.05,
    rank: 3,
    rank_observed: 4,
    rank_goals_conceded: 10,
    rank_pool: 20,
    rank_goals_conceded_pool: 20,
    rank_disagreement: 7,
    goals_conceded: 18,
    goals_conceded_p96: 1.4,
    shots_faced: 50,
    shots_faced_p96: 4,
    saves: 35,
    save_pct: 70,
    xgoals_faced: 20,
    goals_prevented: 2,
    goals_prevented_p96: 0.15,
    previous_rank: null,
    rank_change: null,
    keeperiq_change: null,
    components: baseComponents,
    archetype: "Sweeper-Keeper Receiver",
    notes: { strengths: [], concerns: [] },
    ...overrides,
  };
}

describe("componentSimilarity", () => {
  it("returns 1 for identical percentile profiles", () => {
    const a = makePlayer();
    const b = makePlayer({ player_id: "p2", slug: "keeper-two", name: "Keeper Two" });
    expect(componentSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

describe("runScoutingBrief", () => {
  const pool = [
    makePlayer(),
    makePlayer({
      player_id: "p2",
      slug: "weak-shot",
      name: "Weak Shot",
      components: {
        ...makePlayer().components,
        shot_stopping: { ...makePlayer().components.shot_stopping!, percentile: 20 },
      },
    }),
    makePlayer({
      player_id: "p3",
      slug: "young-prospect",
      name: "Young Prospect",
      age: 22,
      minutes: 400,
      reliability: 0.2,
      archetype: "High-Volume Shot Stopper",
      keeperiq: 58,
    }),
    makePlayer({
      player_id: "p4",
      slug: "limited-sample",
      name: "Limited Sample",
      sample_status: "limited",
      minutes: 80,
      reliability: 0.05,
    }),
  ];

  it("filters on shot-stopping, minutes, and reliability", () => {
    const brief: ScoutingBrief = {
      ...DEFAULT_BRIEF,
      minShotStoppingPercentile: 50,
      minMinutes: 900,
      minReliability: 0.3,
    };
    const matches = runScoutingBrief(pool, brief);
    expect(matches.map((m) => m.player.slug)).toEqual(["keeper-one"]);
    expect(matches[0]!.reasons.some((r) => r.code === "shot_stopping")).toBe(true);
  });

  it("applies age range and preferred archetype", () => {
    const brief: ScoutingBrief = {
      ...DEFAULT_BRIEF,
      minShotStoppingPercentile: 0,
      minMinutes: 300,
      minReliability: 0.1,
      minAge: 20,
      maxAge: 24,
      preferredArchetype: "High-Volume Shot Stopper",
    };
    const matches = runScoutingBrief(pool, brief);
    expect(matches.map((m) => m.player.slug)).toEqual(["young-prospect"]);
    expect(matches[0]!.reasons.some((r) => r.code === "archetype")).toBe(true);
  });

  it("requires similarity to a reference keeper", () => {
    const brief: ScoutingBrief = {
      ...DEFAULT_BRIEF,
      minShotStoppingPercentile: 0,
      minMinutes: 0,
      minReliability: 0,
      includeLimited: true,
      similaritySlug: "keeper-one",
      minSimilarity: 0.99,
    };
    const matches = runScoutingBrief(pool, brief);
    expect(matches.every((m) => m.player.slug !== "keeper-one")).toBe(true);
    expect(matches.some((m) => m.similarity !== null && m.similarity >= 0.99)).toBe(true);
  });

  it("excludes limited samples by default", () => {
    const matches = runScoutingBrief(pool, {
      ...DEFAULT_BRIEF,
      minShotStoppingPercentile: 0,
      minMinutes: 0,
      minReliability: 0,
    });
    expect(matches.map((m) => m.player.slug)).not.toContain("limited-sample");
  });
});

describe("scoreMatch", () => {
  it("rewards higher shot-stopping and similarity", () => {
    const strong = makePlayer({ keeperiq: 80 });
    const weak = makePlayer({
      player_id: "p2",
      keeperiq: 40,
      components: {
        ...makePlayer().components,
        shot_stopping: { ...makePlayer().components.shot_stopping!, percentile: 30 },
      },
    });
    expect(scoreMatch(strong, DEFAULT_BRIEF, 0.95)).toBeGreaterThan(
      scoreMatch(weak, DEFAULT_BRIEF, null),
    );
  });
});
