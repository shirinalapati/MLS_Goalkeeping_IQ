import type { Metadata } from "next";
import { Suspense } from "react";

import { ScoutingTool } from "@/components/scouting/ScoutingTool";
import { getSeason } from "@/lib/data";
import { briefFromSearchParams } from "@/lib/scouting-utils";

export const metadata: Metadata = {
  title: "Scouting",
  description:
    "Define a goalkeeper recruitment brief and shortlist matching MLS keepers with explanations.",
};

export default async function ScoutingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [season2025, season2026, params] = await Promise.all([
    getSeason(2025),
    getSeason(2026),
    searchParams,
  ]);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
    else if (Array.isArray(value) && value[0]) query.set(key, value[0]);
  }

  return (
    <div className="container-page space-y-6">
      <section>
        <p className="eyebrow">Recruitment</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Scouting decision tool</h1>
        <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
          Build a target goalkeeper profile — shot-stopping floor, sweeping and passing
          contribution, age band, minutes and reliability thresholds, preferred involvement
          archetype, and optional similarity to a reference keeper. Matching MLS goalkeepers
          are returned with an explanation of why each one clears the brief.
        </p>
      </section>
      <Suspense fallback={<div className="card card-pad">Loading scouting tool…</div>}>
        <ScoutingTool
          seasons={{
            "2025": season2025.players,
            "2026": season2026.players,
          }}
          initialBrief={briefFromSearchParams(query)}
        />
      </Suspense>
    </div>
  );
}
