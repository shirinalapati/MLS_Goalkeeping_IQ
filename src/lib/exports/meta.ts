/** Shared provenance for Office exports so reports stay tied to source data. */

import type { DataStatus, TalentPlayer } from "@/lib/types";

export interface ExportMeta {
  modelVersion: string;
  methodologyVersion: string;
  dataCutoff: string | null;
  lastSuccessfulRefresh: string | null;
  source: string;
  generatedAt: string;
  seasonLabel: string;
}

export async function loadDataStatus(): Promise<DataStatus> {
  const response = await fetch("/data/data-status.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load data status for export.");
  return (await response.json()) as DataStatus;
}

export async function loadTalent(): Promise<TalentPlayer[]> {
  const response = await fetch("/data/talent.json", { cache: "no-store" });
  if (!response.ok) return [];
  const payload = (await response.json()) as { players?: TalentPlayer[] };
  return payload.players ?? [];
}

export function buildExportMeta(
  status: DataStatus,
  season: string,
): ExportMeta {
  const seasonDetail = status.seasons[season];
  return {
    modelVersion: status.pipeline_version,
    methodologyVersion: status.methodology_version,
    dataCutoff: seasonDetail?.max_match_date ?? null,
    lastSuccessfulRefresh: status.last_successful_update,
    source: status.source.provider,
    generatedAt: new Date().toISOString(),
    seasonLabel: season === "talent" ? "Current Talent" : season,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function stampFilename(prefix: string, extension: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${prefix}-${day}.${extension}`;
}
