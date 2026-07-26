import type { SampleStatus, SeasonPlayer } from "@/lib/types";

export interface LeaderboardFilters {
  query: string;
  team: string;
  includeLimited: boolean;
  minMinutes: number;
}

/** Places gained versus a prior final ranking (positive = climbed). Null if no prior rank. */
export function rankChangeVsPriorFinal(
  player: SeasonPlayer,
  priorRanks: Map<string, number>,
): number | null {
  const priorRank = priorRanks.get(player.player_id);
  if (priorRank === undefined || player.rank === null || player.rank === undefined) {
    return null;
  }
  return priorRank - player.rank;
}

export function filterLeaderboard(
  players: SeasonPlayer[],
  filters: LeaderboardFilters,
): SeasonPlayer[] {
  const needle = filters.query.trim().toLowerCase();
  return players.filter((player) => {
    if (!filters.includeLimited && player.sample_status === ("limited" satisfies SampleStatus)) {
      return false;
    }
    if ((player.minutes ?? 0) < filters.minMinutes) return false;
    if (filters.team !== "all") {
      const abbreviation = player.team_abbreviation ?? "";
      const name = player.team ?? "";
      if (abbreviation !== filters.team && name !== filters.team) return false;
    }
    if (!needle) return true;
    return (
      player.name.toLowerCase().includes(needle) ||
      (player.team ?? "").toLowerCase().includes(needle) ||
      (player.team_abbreviation ?? "").toLowerCase().includes(needle)
    );
  });
}

export function sortLeaderboard(
  players: SeasonPlayer[],
  key: "rank" | "keeperiq" | "name" | "minutes",
  ascending: boolean,
): SeasonPlayer[] {
  return [...players].sort((left, right) => {
    const a = left[key];
    const b = right[key];
    if (a === null || a === undefined) return 1;
    if (b === null || b === undefined) return -1;
    if (typeof a === "string" && typeof b === "string") {
      return ascending ? a.localeCompare(b) : b.localeCompare(a);
    }
    const delta = Number(a) - Number(b);
    if (delta !== 0) return ascending ? delta : -delta;
    return left.player_id.localeCompare(right.player_id);
  });
}
