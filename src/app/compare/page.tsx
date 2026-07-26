import type { Metadata } from "next";
import { Suspense } from "react";

import { CompareTool } from "@/components/compare/CompareTool";
import { getPlayersIndex, getSeason, getTalent } from "@/lib/data";

export const metadata: Metadata = {
  title: "Compare",
  description: "Compare two to four MLS goalkeepers across KeeperIQ views.",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ players?: string; view?: string }>;
}) {
  const params = await searchParams;
  const [index, season2025, season2026, talent] = await Promise.all([
    getPlayersIndex(),
    getSeason(2025),
    getSeason(2026),
    getTalent(),
  ]);

  const initialSlugs = (params.players ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);
  const initialView = ["2025", "2026", "talent"].includes(params.view ?? "")
    ? (params.view as string)
    : "2026";

  return (
    <div className="container-page space-y-6">
      <section>
        <p className="eyebrow">Side by side</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Compare goalkeepers</h1>
        <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
          Select two to four keepers. The URL updates so comparisons are shareable. A keeper only
          appears in the cards when they have data for the selected view — for example, no 2026 Live
          minutes means no 2026 card. Switch to 2025 Final or Current Talent when that is where their
          sample lives.
        </p>
      </section>
      <Suspense fallback={<div className="card card-pad">Loading comparison tool…</div>}>
        <CompareTool
          index={index.players}
          seasons={{
            "2025": season2025.players,
            "2026": season2026.players,
          }}
          talent={talent.players}
          initialSlugs={initialSlugs}
          initialView={initialView}
        />
      </Suspense>
    </div>
  );
}
