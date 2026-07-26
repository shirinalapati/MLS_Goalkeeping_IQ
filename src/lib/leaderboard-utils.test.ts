import { describe, expect, it } from "vitest";

import {
  filterLeaderboard,
  rankChangeVsPriorFinal,
  sortLeaderboard,
} from "@/lib/leaderboard-utils";
import type { SeasonPlayer } from "@/lib/types";

function player(partial: Partial<SeasonPlayer> & Pick<SeasonPlayer, "player_id" | "name">): SeasonPlayer {
  return {
    slug: partial.slug ?? partial.player_id,
    season: 2026,
    team_id: null,
    team: partial.team ?? null,
    team_abbreviation: partial.team_abbreviation ?? null,
    changed_teams: false,
    nationality: null,
    birth_date: null,
    age: null,
    minutes: partial.minutes ?? 1000,
    appearances: 10,
    sample_status: partial.sample_status ?? "qualified",
    sample_status_label: "Qualified",
    keeperiq: partial.keeperiq ?? 50,
    adjusted_total_p96: 0,
    observed_total_p96: 0,
    baseline_total_p96: 0,
    adjusted_total: 0,
    reliability: 0.5,
    interval_low: null,
    interval_high: null,
    interval_se: null,
    rank: partial.rank ?? 1,
    rank_observed: 1,
    rank_goals_conceded: 1,
    rank_pool: 1,
    rank_goals_conceded_pool: 1,
    rank_disagreement: 0,
    goals_conceded: 10,
    goals_conceded_p96: 1,
    shots_faced: 40,
    shots_faced_p96: 4,
    saves: 30,
    save_pct: 75,
    xgoals_faced: 12,
    goals_prevented: 2,
    goals_prevented_p96: 0.2,
    previous_rank: null,
    rank_change: null,
    keeperiq_change: null,
    components: {},
    archetype: null,
    notes: { strengths: [], concerns: [] },
    ...partial,
  };
}

describe("leaderboard filtering", () => {
  const players = [
    player({
      player_id: "a",
      name: "Dayne St. Clair",
      team_abbreviation: "MIN",
      sample_status: "qualified",
      minutes: 3000,
      keeperiq: 99,
      rank: 1,
    }),
    player({
      player_id: "b",
      name: "Earl Edwards Jr.",
      team_abbreviation: "SJE",
      sample_status: "limited",
      minutes: 24,
      keeperiq: 70,
      rank: 20,
    }),
    player({
      player_id: "c",
      name: "Matt Turner",
      team_abbreviation: "NER",
      sample_status: "provisional",
      minutes: 500,
      keeperiq: 88,
      rank: 2,
    }),
  ];

  it("hides limited sample by default", () => {
    const filtered = filterLeaderboard(players, {
      query: "",
      team: "all",
      includeLimited: false,
      minMinutes: 0,
    });
    expect(filtered.map((entry) => entry.player_id)).toEqual(["a", "c"]);
  });

  it("filters by team and search", () => {
    const filtered = filterLeaderboard(players, {
      query: "turner",
      team: "NER",
      includeLimited: true,
      minMinutes: 0,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.player_id).toBe("c");
  });

  it("enforces minimum minutes", () => {
    const filtered = filterLeaderboard(players, {
      query: "",
      team: "all",
      includeLimited: true,
      minMinutes: 1000,
    });
    expect(filtered.map((entry) => entry.player_id)).toEqual(["a"]);
  });

  it("sorts by keeperiq descending", () => {
    const sorted = sortLeaderboard(players, "keeperiq", false);
    expect(sorted.map((entry) => entry.player_id)).toEqual(["a", "c", "b"]);
  });
});

describe("rankChangeVsPriorFinal", () => {
  it("returns places gained versus the prior final rank", () => {
    const prior = new Map([
      ["a", 5],
      ["c", 2],
    ]);
    expect(
      rankChangeVsPriorFinal(player({ player_id: "a", name: "A", rank: 2 }), prior),
    ).toBe(3);
    expect(
      rankChangeVsPriorFinal(player({ player_id: "c", name: "C", rank: 4 }), prior),
    ).toBe(-2);
  });

  it("returns null when the player was not ranked in the prior final", () => {
    expect(
      rankChangeVsPriorFinal(player({ player_id: "new", name: "New", rank: 1 }), new Map()),
    ).toBeNull();
  });
});
