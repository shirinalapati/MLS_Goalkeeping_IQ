"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { StatusBadge } from "@/components/StatusBadge";
import {
  formatKeeperIQ,
  formatMinutes,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { ExportMenu } from "@/components/exports/ExportMenu";
import { exportScoutingMemo } from "@/lib/exports/docx-memo";
import { exportScoutingWorkbook } from "@/lib/exports/excel-scouting";
import { exportScoutingPptx } from "@/lib/exports/pptx-brief";
import {
  DEFAULT_BRIEF,
  OPEN_BRIEF,
  briefFromSearchParams,
  briefToSearchParams,
  listArchetypes,
  runScoutingBrief,
  type ScoutingBrief,
} from "@/lib/scouting-utils";
import type { SeasonPlayer } from "@/lib/types";

interface ScoutingToolProps {
  seasons: Record<"2025" | "2026", SeasonPlayer[]>;
  initialBrief?: Partial<ScoutingBrief>;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-[var(--accent)]">
          {value}
          {suffix ?? ""}
        </span>
      </span>
      <input
        type="range"
        className="w-full accent-[var(--accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {hint ? <span className="block text-xs text-[var(--text-faint)]">{hint}</span> : null}
    </label>
  );
}

function NumberOptional({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        className="input w-full"
        placeholder={placeholder}
        min={min}
        max={max}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const next = Number(raw);
          onChange(Number.isFinite(next) ? next : null);
        }}
      />
    </label>
  );
}

export function ScoutingTool({ seasons, initialBrief = {} }: ScoutingToolProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [brief, setBrief] = useState<ScoutingBrief>({
    ...DEFAULT_BRIEF,
    ...initialBrief,
    ...briefFromSearchParams(new URLSearchParams(searchParams.toString())),
  });

  const players = seasons[brief.season];
  const archetypes = useMemo(() => listArchetypes(players), [players]);
  const matches = useMemo(() => runScoutingBrief(players, brief), [players, brief]);

  const referenceName = brief.similaritySlug
    ? players.find((player) => player.slug === brief.similaritySlug)?.name
    : null;

  useEffect(() => {
    const next = briefToSearchParams(brief).toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
    // Sync outward from brief edits only; do not re-read the URL into state.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams read for comparison
  }, [brief, pathname, router]);

  function patch(partial: Partial<ScoutingBrief>) {
    setBrief((prev) => ({ ...prev, ...partial }));
  }

  function resetDefaults() {
    setBrief({ ...DEFAULT_BRIEF, season: brief.season });
  }

  function clearAllFilters() {
    setBrief({ ...OPEN_BRIEF, season: brief.season });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="card card-pad space-y-5 h-fit lg:sticky lg:top-20">
        <div>
          <p className="eyebrow">Recruitment brief</p>
          <h2 className="mt-1 text-lg font-semibold">Target profile</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Hard filters first, then ranked by fit. Share the URL to preserve the brief.
          </p>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Search keepers</span>
          <input
            type="search"
            className="input w-full"
            placeholder="Name, club, or abbreviation…"
            value={brief.query}
            onChange={(event) => patch({ query: event.target.value })}
            autoComplete="off"
          />
        </label>

        <div className="tabs">
          {(
            [
              ["2025", "2025 Final"],
              ["2026", "2026 Live"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={brief.season === id ? "btn btn-active" : "btn"}
              onClick={() => patch({ season: id, preferredArchetype: null, similaritySlug: null })}
            >
              {label}
            </button>
          ))}
        </div>

        <SliderField
          label="Min shot-stopping percentile"
          value={brief.minShotStoppingPercentile}
          min={0}
          max={90}
          step={5}
          onChange={(value) => patch({ minShotStoppingPercentile: value })}
        />
        <SliderField
          label="Min sweeping percentile"
          value={brief.minSweepingPercentile}
          min={0}
          max={90}
          step={5}
          onChange={(value) => patch({ minSweepingPercentile: value })}
          hint="Set to 0 to leave unconstrained."
        />
        <SliderField
          label="Min passing percentile"
          value={brief.minPassingPercentile}
          min={0}
          max={90}
          step={5}
          onChange={(value) => patch({ minPassingPercentile: value })}
          hint="Set to 0 to leave unconstrained."
        />

        <div className="grid grid-cols-2 gap-3">
          <NumberOptional
            label="Min age"
            value={brief.minAge}
            onChange={(value) => patch({ minAge: value })}
            placeholder="Any"
            min={16}
            max={45}
          />
          <NumberOptional
            label="Max age"
            value={brief.maxAge}
            onChange={(value) => patch({ maxAge: value })}
            placeholder="Any"
            min={16}
            max={45}
          />
        </div>

        <SliderField
          label="Minutes threshold"
          value={brief.minMinutes}
          min={0}
          max={3000}
          step={30}
          onChange={(value) => patch({ minMinutes: value })}
        />
        <SliderField
          label="Reliability threshold"
          value={brief.minReliability}
          min={0}
          max={0.6}
          step={0.01}
          suffix=""
          onChange={(value) => patch({ minReliability: Number(value.toFixed(2)) })}
          hint="Total Goals Added reliability weight (0–1)."
        />

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Preferred tactical profile</span>
          <select
            className="select w-full"
            value={brief.preferredArchetype ?? "any"}
            onChange={(event) =>
              patch({
                preferredArchetype:
                  event.target.value === "any" ? null : event.target.value,
              })
            }
          >
            <option value="any">Any / no preference</option>
            {archetypes.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-[var(--text-faint)]">
            Involvement archetypes from the clustering model — not quality ranks.
          </span>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Similar to goalkeeper</span>
          <select
            className="select w-full"
            value={brief.similaritySlug ?? ""}
            onChange={(event) =>
              patch({
                similaritySlug: event.target.value || null,
              })
            }
          >
            <option value="">No similarity constraint</option>
            {[...players]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((player) => (
                <option key={player.slug} value={player.slug}>
                  {player.name}
                  {player.team_abbreviation ? ` (${player.team_abbreviation})` : ""}
                </option>
              ))}
          </select>
          <span className="block text-xs text-[var(--text-faint)]">
            Similarity is cosine similarity between the six reliability-adjusted component
            percentiles (shot stopping, handling, claiming, sweeping, passing, and fielding).
          </span>
        </label>

        {brief.similaritySlug ? (
          <SliderField
            label="Min similarity"
            value={Math.round(brief.minSimilarity * 100)}
            min={50}
            max={99}
            step={1}
            suffix="%"
            onChange={(value) => patch({ minSimilarity: value / 100 })}
            hint={
              referenceName
                ? `Minimum match score vs ${referenceName}.`
                : "Minimum match score vs the reference keeper."
            }
          />
        ) : null}

        <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={brief.includeLimited}
            onChange={(event) => patch({ includeLimited: event.target.checked })}
          />
          Include limited-sample keepers
        </label>

        <div className="grid gap-2">
          <button type="button" className="btn w-full" onClick={clearAllFilters}>
            Turn off all filters
          </button>
          <button type="button" className="btn w-full" onClick={resetDefaults}>
            Reset to defaults
          </button>
        </div>
      </aside>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Shortlist</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {matches.length} matching goalkeeper{matches.length === 1 ? "" : "s"}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Pool: {players.length} keepers in {brief.season}. Ranked by composite fit score
              after hard filters.
            </p>
          </div>
          <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
            <ExportMenu
              onExcel={() =>
                exportScoutingWorkbook({
                  brief,
                  matches,
                  seasonPlayers: players,
                })
              }
              onPowerpoint={() => exportScoutingPptx({ brief, matches })}
              onWord={() => exportScoutingMemo({ brief, matches })}
            />
            <label className="block w-full max-w-sm space-y-1.5 text-sm sm:w-72">
              <span className="font-medium">Search</span>
              <input
                type="search"
                className="input w-full"
                placeholder="Filter shortlist by name or club…"
                value={brief.query}
                onChange={(event) => patch({ query: event.target.value })}
                autoComplete="off"
              />
            </label>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="card card-pad text-[var(--text-muted)]">
            No keepers satisfy this brief. Loosen percentile floors, minutes, reliability, or
            remove the similarity / archetype constraint.
          </div>
        ) : (
          <ul className="space-y-4">
            {matches.map((match, index) => (
              <li key={match.player.player_id} className="card card-pad space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--text-faint)]">#{index + 1} fit</p>
                    <Link
                      href={`/players/${match.player.slug}`}
                      className="text-xl font-semibold no-underline hover:text-[var(--accent)]"
                    >
                      {match.player.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                      {match.player.team ?? "Unknown club"}
                      {match.player.team_abbreviation
                        ? ` · ${match.player.team_abbreviation}`
                        : ""}
                      {match.player.age !== null && match.player.age !== undefined
                        ? ` · age ${match.player.age}`
                        : " · age —"}
                      {match.player.archetype ? ` · ${match.player.archetype}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={match.player.sample_status} />
                    <span className="badge">
                      KeeperIQ {formatKeeperIQ(match.player.keeperiq)}
                    </span>
                    <span className="badge">
                      Fit {formatNumber(match.score, 0)}
                    </span>
                    {match.similarity !== null ? (
                      <span className="badge">
                        Sim {formatPercent(match.similarity * 100, 0)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-4 text-sm">
                  <Metric
                    label="Shot stopping"
                    value={formatPercent(
                      match.player.components.shot_stopping?.percentile,
                      0,
                    )}
                  />
                  <Metric
                    label="Sweeping"
                    value={formatPercent(match.player.components.sweeping?.percentile, 0)}
                  />
                  <Metric
                    label="Passing"
                    value={formatPercent(match.player.components.passing?.percentile, 0)}
                  />
                  <Metric label="Minutes" value={formatMinutes(match.player.minutes)} />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-faint)]">
                    Why this keeper matches
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {match.reasons.map((reason) => (
                      <li
                        key={`${match.player.player_id}-${reason.code}`}
                        className="flex gap-2 text-sm"
                      >
                        <span
                          className={
                            reason.tone === "strong"
                              ? "text-[var(--positive)]"
                              : reason.tone === "info"
                                ? "text-[var(--info)]"
                                : "text-[var(--accent)]"
                          }
                          aria-hidden
                        >
                          {reason.tone === "strong" ? "●" : reason.tone === "info" ? "○" : "▸"}
                        </span>
                        <span>
                          <span className="font-medium text-[var(--text)]">{reason.label}: </span>
                          <span className="text-[var(--text-muted)]">{reason.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    href={`/players/${match.player.slug}`}
                    className="btn btn-primary no-underline"
                  >
                    Open profile
                  </Link>
                  <Link
                    href={`/compare?view=${brief.season}&players=${match.player.slug}${
                      brief.similaritySlug ? `,${brief.similaritySlug}` : ""
                    }`}
                    className="btn no-underline"
                  >
                    Compare
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[var(--bg-elevated)] px-3 py-2">
      <p className="text-[0.7rem] uppercase tracking-wide text-[var(--text-faint)]">{label}</p>
      <p className="metric-value text-base">{value}</p>
    </div>
  );
}
