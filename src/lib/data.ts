import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  ArchetypesPayload,
  ComparisonsPayload,
  DataStatus,
  MethodologyPayload,
  PlayerProfile,
  PlayersIndex,
  SeasonPayload,
  TalentPayload,
} from "@/lib/types";

const DATA_ROOT = path.join(process.cwd(), "public", "data");

async function readJson<T>(relativePath: string): Promise<T> {
  const fullPath = path.join(DATA_ROOT, relativePath);
  const raw = await readFile(fullPath, "utf8");
  return JSON.parse(raw) as T;
}

export async function getSeason(season: number): Promise<SeasonPayload> {
  return readJson<SeasonPayload>(`season-${season}.json`);
}

export async function getTalent(): Promise<TalentPayload> {
  return readJson<TalentPayload>("talent.json");
}

export async function getPlayersIndex(): Promise<PlayersIndex> {
  return readJson<PlayersIndex>("players-index.json");
}

export async function getPlayerProfile(slug: string): Promise<PlayerProfile | null> {
  try {
    return await readJson<PlayerProfile>(`players/${slug}.json`);
  } catch {
    return null;
  }
}

export async function getDataStatus(): Promise<DataStatus> {
  return readJson<DataStatus>("data-status.json");
}

export async function getMethodology(): Promise<MethodologyPayload> {
  return readJson<MethodologyPayload>("methodology.json");
}

export async function getArchetypes(): Promise<ArchetypesPayload> {
  return readJson<ArchetypesPayload>("archetypes.json");
}

export async function getComparisons(): Promise<ComparisonsPayload> {
  return readJson<ComparisonsPayload>("comparisons.json");
}

export async function getAllPlayerSlugs(): Promise<string[]> {
  const index = await getPlayersIndex();
  return index.players.map((player) => player.slug);
}
