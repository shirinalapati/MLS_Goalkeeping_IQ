/** Competition ranks among peer goalkeepers for player-profile metric cards. */

export interface RankResult {
  rank: number | null;
  pool: number;
}

type NumericGetter<T> = (item: T) => number | null | undefined;

/**
 * Competition ranking (``1, 2, 2, 4``): count how many peers are strictly better,
 * then add one. Null/NaN values are excluded from the pool.
 */
export function rankAmong<T extends { player_id: string }>(
  peers: T[],
  playerId: string,
  getValue: NumericGetter<T>,
  options: { higherIsBetter: boolean },
): RankResult {
  const { higherIsBetter } = options;
  const usable = peers
    .map((item) => {
      const value = getValue(item);
      if (value === null || value === undefined || Number.isNaN(value)) return null;
      return { player_id: item.player_id, value };
    })
    .filter((item): item is { player_id: string; value: number } => item !== null);

  const target = usable.find((item) => item.player_id === playerId);
  if (!target) return { rank: null, pool: usable.length };

  const better = usable.filter((item) =>
    higherIsBetter ? item.value > target.value : item.value < target.value,
  ).length;

  return { rank: better + 1, pool: usable.length };
}

export function formatRankLabel(rank: number | null | undefined, pool?: number | null): string | null {
  if (rank === null || rank === undefined) return null;
  return pool != null && pool > 0 ? `Rank #${rank} of ${pool}` : `Rank #${rank}`;
}
