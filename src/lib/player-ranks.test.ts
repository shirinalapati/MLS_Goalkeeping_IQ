import { describe, expect, it } from "vitest";

import { formatRankLabel, rankAmong } from "@/lib/player-ranks";

describe("rankAmong", () => {
  const peers = [
    { player_id: "a", value: 0.3 },
    { player_id: "b", value: 0.1 },
    { player_id: "c", value: 0.3 },
    { player_id: "d", value: null },
  ];

  it("ranks higher values first when higher is better", () => {
    expect(rankAmong(peers, "a", (p) => p.value, { higherIsBetter: true })).toEqual({
      rank: 1,
      pool: 3,
    });
    expect(rankAmong(peers, "b", (p) => p.value, { higherIsBetter: true })).toEqual({
      rank: 3,
      pool: 3,
    });
  });

  it("gives tied values the same competition rank", () => {
    expect(rankAmong(peers, "c", (p) => p.value, { higherIsBetter: true }).rank).toBe(1);
  });

  it("ranks lower values first when lower is better", () => {
    expect(rankAmong(peers, "b", (p) => p.value, { higherIsBetter: false })).toEqual({
      rank: 1,
      pool: 3,
    });
  });
});

describe("formatRankLabel", () => {
  it("formats rank with pool size", () => {
    expect(formatRankLabel(4, 48)).toBe("Rank #4 of 48");
    expect(formatRankLabel(null, 48)).toBeNull();
  });
});
