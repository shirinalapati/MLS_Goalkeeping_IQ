/** Goalkeeper scouting brief: filters, similarity, and match explanations. */

import type { ComponentKey, SeasonPlayer } from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

export interface ScoutingBrief {
  season: "2025" | "2026";
  /** Case-insensitive name / club / abbreviation search. */
  query: string;
  minShotStoppingPercentile: number;
  minSweepingPercentile: number;
  minPassingPercentile: number;
  minAge: number | null;
  maxAge: number | null;
  minMinutes: number;
  minReliability: number;
  /** Reserved for when public salary data is licensed; currently unused. */
  salaryEnabled: boolean;
  minSalary: number | null;
  maxSalary: number | null;
  similaritySlug: string | null;
  /** Minimum cosine similarity (0–1) when a reference keeper is selected. */
  minSimilarity: number;
  preferredArchetype: string | null;
  includeLimited: boolean;
}

export interface MatchReason {
  code: string;
  label: string;
  detail: string;
  tone: "pass" | "strong" | "info";
}

export interface ScoutingMatch {
  player: SeasonPlayer;
  score: number;
  similarity: number | null;
  reasons: MatchReason[];
}

export const DEFAULT_BRIEF: ScoutingBrief = {
  season: "2026",
  query: "",
  minShotStoppingPercentile: 40,
  minSweepingPercentile: 0,
  minPassingPercentile: 0,
  minAge: null,
  maxAge: null,
  minMinutes: 270,
  minReliability: 0.15,
  salaryEnabled: false,
  minSalary: null,
  maxSalary: null,
  similaritySlug: null,
  minSimilarity: 0.7,
  preferredArchetype: null,
  includeLimited: false,
};

/** No hard filters — every keeper in the season pool can appear. */
export const OPEN_BRIEF: Omit<ScoutingBrief, "season"> = {
  query: "",
  minShotStoppingPercentile: 0,
  minSweepingPercentile: 0,
  minPassingPercentile: 0,
  minAge: null,
  maxAge: null,
  minMinutes: 0,
  minReliability: 0,
  salaryEnabled: false,
  minSalary: null,
  maxSalary: null,
  similaritySlug: null,
  minSimilarity: 0.7,
  preferredArchetype: null,
  includeLimited: true,
};

function matchesQuery(player: SeasonPlayer, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    player.name,
    player.team ?? "",
    player.team_abbreviation ?? "",
    player.slug,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function componentPercentile(player: SeasonPlayer, key: ComponentKey): number | null {
  return player.components[key]?.percentile ?? null;
}

/** Cosine similarity on the six adjusted-percentile components (0–1). */
export function componentSimilarity(
  left: SeasonPlayer,
  right: SeasonPlayer,
): number | null {
  const a: number[] = [];
  const b: number[] = [];
  for (const key of COMPONENT_ORDER) {
    const av = componentPercentile(left, key);
    const bv = componentPercentile(right, key);
    if (av === null || bv === null) continue;
    a.push(av);
    b.push(bv);
  }
  if (a.length < 3) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function passesHardFilters(
  player: SeasonPlayer,
  brief: ScoutingBrief,
  reference: SeasonPlayer | null,
): { ok: boolean; reasons: MatchReason[]; similarity: number | null } {
  const reasons: MatchReason[] = [];
  let similarity: number | null = null;

  if (!matchesQuery(player, brief.query)) {
    return { ok: false, reasons, similarity };
  }

  if (!brief.includeLimited && player.sample_status === "limited") {
    return { ok: false, reasons, similarity };
  }

  if ((player.minutes ?? 0) < brief.minMinutes) {
    return { ok: false, reasons, similarity };
  }
  reasons.push({
    code: "minutes",
    label: "Minutes",
    detail: `${Math.round(player.minutes ?? 0).toLocaleString("en-US")} minutes meets the ${brief.minMinutes.toLocaleString("en-US")} threshold`,
    tone: (player.minutes ?? 0) >= brief.minMinutes * 2 ? "strong" : "pass",
  });

  if ((player.reliability ?? 0) < brief.minReliability) {
    return { ok: false, reasons, similarity };
  }
  reasons.push({
    code: "reliability",
    label: "Reliability",
    detail: `Total reliability ${(player.reliability ?? 0).toFixed(3)} ≥ ${brief.minReliability.toFixed(2)}`,
    tone: (player.reliability ?? 0) >= brief.minReliability + 0.15 ? "strong" : "pass",
  });

  const shot = componentPercentile(player, "shot_stopping");
  if (shot === null || shot < brief.minShotStoppingPercentile) {
    return { ok: false, reasons, similarity };
  }
  reasons.push({
    code: "shot_stopping",
    label: "Shot stopping",
    detail: `${COMPONENT_LABELS.shot_stopping} percentile ${shot.toFixed(0)} ≥ ${brief.minShotStoppingPercentile}`,
    tone: shot >= brief.minShotStoppingPercentile + 20 ? "strong" : "pass",
  });

  const sweep = componentPercentile(player, "sweeping");
  if (sweep === null || sweep < brief.minSweepingPercentile) {
    return { ok: false, reasons, similarity };
  }
  if (brief.minSweepingPercentile > 0) {
    reasons.push({
      code: "sweeping",
      label: "Sweeping",
      detail: `${COMPONENT_LABELS.sweeping} percentile ${sweep.toFixed(0)} ≥ ${brief.minSweepingPercentile}`,
      tone: sweep >= brief.minSweepingPercentile + 20 ? "strong" : "pass",
    });
  }

  const passing = componentPercentile(player, "passing");
  if (passing === null || passing < brief.minPassingPercentile) {
    return { ok: false, reasons, similarity };
  }
  if (brief.minPassingPercentile > 0) {
    reasons.push({
      code: "passing",
      label: "Passing",
      detail: `${COMPONENT_LABELS.passing} percentile ${passing.toFixed(0)} ≥ ${brief.minPassingPercentile}`,
      tone: passing >= brief.minPassingPercentile + 20 ? "strong" : "pass",
    });
  }

  if (brief.minAge !== null || brief.maxAge !== null) {
    if (player.age === null || player.age === undefined) {
      return { ok: false, reasons, similarity };
    }
    if (brief.minAge !== null && player.age < brief.minAge) {
      return { ok: false, reasons, similarity };
    }
    if (brief.maxAge !== null && player.age > brief.maxAge) {
      return { ok: false, reasons, similarity };
    }
    const range =
      brief.minAge !== null && brief.maxAge !== null
        ? `${brief.minAge}–${brief.maxAge}`
        : brief.minAge !== null
          ? `≥ ${brief.minAge}`
          : `≤ ${brief.maxAge}`;
    reasons.push({
      code: "age",
      label: "Age",
      detail: `Age ${player.age} is within the target range (${range})`,
      tone: "pass",
    });
  }

  if (brief.preferredArchetype) {
    if (player.archetype !== brief.preferredArchetype) {
      return { ok: false, reasons, similarity };
    }
    reasons.push({
      code: "archetype",
      label: "Tactical profile",
      detail: `Matches preferred involvement profile “${player.archetype}”`,
      tone: "strong",
    });
  } else if (player.archetype) {
    reasons.push({
      code: "archetype_info",
      label: "Tactical profile",
      detail: `Current involvement archetype: ${player.archetype}`,
      tone: "info",
    });
  }

  if (reference) {
    if (player.player_id === reference.player_id) {
      return { ok: false, reasons, similarity };
    }
    similarity = componentSimilarity(player, reference);
    if (similarity === null || similarity < brief.minSimilarity) {
      return { ok: false, reasons, similarity };
    }
    reasons.push({
      code: "similarity",
      label: "Profile similarity",
      detail: `${(similarity * 100).toFixed(0)}% component-percentile similarity to ${reference.name} (min ${(brief.minSimilarity * 100).toFixed(0)}%)`,
      tone: similarity >= 0.9 ? "strong" : "pass",
    });
  }

  // Salary filters are intentionally inert until licensed public wage data exists.
  if (brief.salaryEnabled) {
    reasons.push({
      code: "salary_unavailable",
      label: "Salary",
      detail: "Salary filters are not applied — public MLS wage data is not included in this build",
      tone: "info",
    });
  }

  return { ok: true, reasons, similarity };
}

/** Soft score for ranking matches (higher is better). */
export function scoreMatch(
  player: SeasonPlayer,
  brief: ScoutingBrief,
  similarity: number | null,
): number {
  const shot = componentPercentile(player, "shot_stopping") ?? 0;
  const sweep = componentPercentile(player, "sweeping") ?? 0;
  const passing = componentPercentile(player, "passing") ?? 0;
  const reliability = (player.reliability ?? 0) * 100;
  const keeperiq = player.keeperiq ?? 50;
  const minutesBonus = Math.min(20, (player.minutes ?? 0) / 180);
  const simBonus = similarity !== null ? similarity * 25 : 0;
  const archetypeBonus =
    brief.preferredArchetype && player.archetype === brief.preferredArchetype ? 8 : 0;

  return (
    shot * 0.35 +
    sweep * 0.15 +
    passing * 0.15 +
    keeperiq * 0.2 +
    reliability * 0.1 +
    minutesBonus +
    simBonus +
    archetypeBonus
  );
}

export function runScoutingBrief(
  players: SeasonPlayer[],
  brief: ScoutingBrief,
): ScoutingMatch[] {
  const reference = brief.similaritySlug
    ? (players.find((player) => player.slug === brief.similaritySlug) ?? null)
    : null;

  const matches: ScoutingMatch[] = [];
  for (const player of players) {
    const { ok, reasons, similarity } = passesHardFilters(player, brief, reference);
    if (!ok) continue;
    matches.push({
      player,
      score: scoreMatch(player, brief, similarity),
      similarity,
      reasons,
    });
  }

  return matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.player.keeperiq ?? 0) - (a.player.keeperiq ?? 0);
  });
}

export function listArchetypes(players: SeasonPlayer[]): string[] {
  const labels = new Set<string>();
  for (const player of players) {
    if (player.archetype) labels.add(player.archetype);
  }
  return [...labels].sort((a, b) => a.localeCompare(b));
}

export function briefFromSearchParams(params: URLSearchParams): Partial<ScoutingBrief> {
  const num = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  const season = params.get("season");
  const partial: Partial<ScoutingBrief> = {};
  if (season === "2025" || season === "2026") partial.season = season;
  const shot = num("ss");
  if (shot !== null) partial.minShotStoppingPercentile = shot;
  const sweep = num("sw");
  if (sweep !== null) partial.minSweepingPercentile = sweep;
  const pass = num("pa");
  if (pass !== null) partial.minPassingPercentile = pass;
  const minAge = num("amin");
  if (minAge !== null) partial.minAge = minAge;
  const maxAge = num("amax");
  if (maxAge !== null) partial.maxAge = maxAge;
  const minutes = num("min");
  if (minutes !== null) partial.minMinutes = minutes;
  const rel = num("rel");
  if (rel !== null) partial.minReliability = rel;
  const sim = params.get("like");
  if (sim) partial.similaritySlug = sim;
  const minSim = num("sims");
  if (minSim !== null) partial.minSimilarity = minSim;
  const arch = params.get("arch");
  if (arch) partial.preferredArchetype = arch === "any" ? null : arch;
  if (params.get("limited") === "1") partial.includeLimited = true;
  const query = params.get("q");
  if (query) partial.query = query;
  return partial;
}

export function briefToSearchParams(brief: ScoutingBrief): URLSearchParams {
  const params = new URLSearchParams();
  params.set("season", brief.season);
  if (brief.query.trim()) params.set("q", brief.query.trim());
  params.set("ss", String(brief.minShotStoppingPercentile));
  params.set("sw", String(brief.minSweepingPercentile));
  params.set("pa", String(brief.minPassingPercentile));
  if (brief.minAge !== null) params.set("amin", String(brief.minAge));
  if (brief.maxAge !== null) params.set("amax", String(brief.maxAge));
  params.set("min", String(brief.minMinutes));
  params.set("rel", String(brief.minReliability));
  if (brief.similaritySlug) params.set("like", brief.similaritySlug);
  if (brief.similaritySlug) params.set("sims", String(brief.minSimilarity));
  if (brief.preferredArchetype) params.set("arch", brief.preferredArchetype);
  if (brief.includeLimited) params.set("limited", "1");
  return params;
}
