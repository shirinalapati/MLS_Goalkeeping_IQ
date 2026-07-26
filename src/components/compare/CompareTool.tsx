"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ComponentRadar } from "@/components/charts/ComponentRadar";
import { ExportMenu } from "@/components/exports/ExportMenu";
import { StatusBadge } from "@/components/StatusBadge";
import { exportCompareWorkbook } from "@/lib/exports/excel-compare";
import { exportComparePptx } from "@/lib/exports/pptx-brief";
import {
  formatKeeperIQ,
  formatMinutes,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { PlayerIndexEntry, SeasonPlayer, TalentPlayer } from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

interface CompareToolProps {
  index: PlayerIndexEntry[];
  seasons: Record<string, SeasonPlayer[]>;
  talent: TalentPlayer[];
  initialSlugs: string[];
  initialView: string;
}

export function CompareTool({
  index,
  seasons,
  talent,
  initialSlugs,
  initialView,
}: CompareToolProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [view, setView] = useState(initialView);
  const [slugs, setSlugs] = useState<string[]>(initialSlugs.slice(0, 4));
  const [query, setQuery] = useState("");

  const selectedPlayers = useMemo(() => {
    if (view === "talent") {
      return slugs
        .map((slug) => talent.find((player) => player.slug === slug))
        .filter((player): player is TalentPlayer => Boolean(player));
    }
    const seasonPlayers = seasons[view] ?? [];
    return slugs
      .map((slug) => seasonPlayers.find((player) => player.slug === slug))
      .filter((player): player is SeasonPlayer => Boolean(player));
  }, [slugs, view, seasons, talent]);

  const missingSlugs = useMemo(() => {
    const present = new Set(
      selectedPlayers.map((player) => ("slug" in player && player.slug ? player.slug : "")),
    );
    return slugs.filter((slug) => !present.has(slug));
  }, [slugs, selectedPlayers]);

  function viewsWithPlayer(slug: string): string[] {
    const available: string[] = [];
    if ((seasons["2025"] ?? []).some((player) => player.slug === slug)) available.push("2025");
    if ((seasons["2026"] ?? []).some((player) => player.slug === slug)) available.push("2026");
    if (talent.some((player) => player.slug === slug)) available.push("talent");
    return available;
  }

  function isInCurrentView(slug: string): boolean {
    return viewsWithPlayer(slug).includes(view);
  }

  function missingReason(slug: string): string {
    const available = viewsWithPlayer(slug);
    const viewLabel = view === "talent" ? "Current Talent" : `${view} ${view === "2026" ? "Live" : "Final"}`;
    if (view === "talent") {
      return `${viewLabel} has no talent estimate for this keeper.`;
    }
    if (available.includes("talent") || available.some((alt) => alt !== view)) {
      return `No ${viewLabel} minutes in the dataset (did not appear in that season’s goalkeeper sample), so there is nothing to compare here.`;
    }
    return `No ${viewLabel} profile is available for this keeper.`;
  }

  function formatViewLabel(id: string): string {
    if (id === "talent") return "Current Talent";
    if (id === "2026") return "2026 Live";
    return "2025 Final";
  }

  const seasonSelected = selectedPlayers.filter(
    (player): player is SeasonPlayer => "components" in player,
  );

  function syncUrl(nextSlugs: string[], nextView: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nextView);
    if (nextSlugs.length) params.set("players", nextSlugs.join(","));
    else params.delete("players");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function addPlayer(slug: string) {
    if (slugs.includes(slug) || slugs.length >= 4) return;
    const next = [...slugs, slug];
    setSlugs(next);
    syncUrl(next, view);
    setQuery("");
  }

  function removePlayer(slug: string) {
    const next = slugs.filter((value) => value !== slug);
    setSlugs(next);
    syncUrl(next, view);
  }

  function changeView(nextView: string) {
    setView(nextView);
    syncUrl(slugs, nextView);
  }

  const suggestions = index
    .filter((player) => {
      if (!query.trim()) return false;
      if (slugs.includes(player.slug)) return false;
      return player.name.toLowerCase().includes(query.trim().toLowerCase());
    })
    .slice(0, 8);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="tabs">
          {[
            ["2025", "2025 Final"],
            ["2026", "2026 Live"],
            ["talent", "Current Talent"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`btn ${view === id ? "btn-active" : ""}`}
              onClick={() => changeView(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {view !== "talent" ? (
          <ExportMenu
            disabled={seasonSelected.length === 0}
            onExcel={() =>
              exportCompareWorkbook({
                players: seasonSelected,
                view,
              })
            }
            onPowerpoint={() =>
              exportComparePptx({
                players: seasonSelected,
                view,
              })
            }
          />
        ) : null}
      </div>

      <div className="card card-pad">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--text-muted)]">
            Add goalkeeper ({slugs.length}/4)
          </span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
          />
        </label>
        <p className="mt-2 text-xs text-[var(--text-faint)]">
          Comparison cards only include keepers who have data in the selected view. A keeper with no{" "}
          {formatViewLabel(view)} sample will stay in your selection but will not get a card until
          you switch views.
        </p>
        {suggestions.length ? (
          <ul className="mt-2 divide-y divide-[var(--border)] rounded-md border border-[var(--border)]">
            {suggestions.map((player) => {
              const available = viewsWithPlayer(player.slug);
              const inView = available.includes(view);
              return (
                <li key={player.slug}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg-elevated)]"
                    onClick={() => addPlayer(player.slug)}
                  >
                    <span>
                      <span className="block">
                        {player.name}{" "}
                        <span className="text-[var(--text-muted)]">
                          ({player.team_abbreviation ?? "—"})
                        </span>
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-faint)]">
                        Available:{" "}
                        {available.length
                          ? available.map(formatViewLabel).join(" · ")
                          : "none"}
                        {!inView
                          ? ` · not in ${formatViewLabel(view)} (no card until you change view)`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-[var(--accent)]">
                      {inView ? "Add" : "Add anyway"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {slugs.map((slug) => {
            const player = index.find((entry) => entry.slug === slug);
            const inView = isInCurrentView(slug);
            return (
              <button
                key={slug}
                type="button"
                className={inView ? "badge badge-qualified" : "badge"}
                title={inView ? "Remove" : missingReason(slug)}
                onClick={() => removePlayer(slug)}
              >
                {player?.name ?? slug}
                {!inView ? " · not in this view" : ""} ×
              </button>
            );
          })}
        </div>
      </div>

      {missingSlugs.length ? (
        <div className="card card-pad space-y-3 text-sm text-[var(--text-muted)]">
          <div>
            <p className="font-medium text-[var(--text)]">Unavailable in {formatViewLabel(view)}</p>
            <p className="mt-1">
              These keepers are still selected, but they have no profile in this view, so their
              comparison cards are hidden rather than inventing numbers.
            </p>
          </div>
          <ul className="space-y-3">
            {missingSlugs.map((slug) => {
              const player = index.find((entry) => entry.slug === slug);
              const alternatives = viewsWithPlayer(slug).filter((alt) => alt !== view);
              return (
                <li
                  key={slug}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                >
                  <p>
                    <strong className="text-[var(--text)]">{player?.name ?? slug}</strong>
                    {player?.team_abbreviation ? ` (${player.team_abbreviation})` : ""}
                  </p>
                  <p className="mt-1">{missingReason(slug)}</p>
                  {alternatives.length ? (
                    <p className="mt-1">
                      Switch to{" "}
                      {alternatives.map((alt, index) => (
                        <span key={alt}>
                          {index > 0 ? " or " : ""}
                          <button
                            type="button"
                            className="text-[var(--accent)] underline-offset-2 hover:underline"
                            onClick={() => changeView(alt)}
                          >
                            {formatViewLabel(alt)}
                          </button>
                        </span>
                      ))}{" "}
                      to include them in the comparison.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {!selectedPlayers.length ? (
        <div className="card card-pad text-[var(--text-muted)]">
          Select two to four goalkeepers to compare. Keepers missing from the selected season are
          listed above instead of inventing stats.
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {selectedPlayers.map((player) => {
              if ("components" in player) {
                return (
                  <article key={player.player_id} className="card card-pad">
                    <Link
                      href={`/players/${player.slug}?season=${player.season}`}
                      className="text-lg font-semibold hover:text-[var(--accent)]"
                    >
                      {player.name}
                    </Link>
                    <p className="text-sm text-[var(--text-muted)]">
                      {player.team_abbreviation ?? player.team}
                    </p>
                    <div className="mt-3 text-3xl font-semibold text-[var(--accent)] metric-value">
                      {formatKeeperIQ(player.keeperiq)}
                    </div>
                    <dl className="mt-3 space-y-1 text-sm">
                      <Row label="Adj G+/96" value={formatNumber(player.adjusted_total_p96, 2)} />
                      <Row label="Obs G+/96" value={formatNumber(player.observed_total_p96, 2)} />
                      <Row label="Minutes" value={formatMinutes(player.minutes)} />
                      <Row label="GA/96" value={formatNumber(player.goals_conceded_p96, 2)} />
                      <Row label="Save %" value={formatPercent(player.save_pct)} />
                      <Row label="Reliability" value={formatPercent((player.reliability ?? 0) * 100, 0)} />
                    </dl>
                    <div className="mt-3">
                      <StatusBadge status={player.sample_status} />
                    </div>
                  </article>
                );
              }
              return (
                <article key={player.player_id} className="card card-pad">
                  <Link
                    href={`/players/${player.slug}`}
                    className="text-lg font-semibold hover:text-[var(--accent)]"
                  >
                    {player.name}
                  </Link>
                  <p className="text-sm text-[var(--text-muted)]">
                    {player.team_abbreviation ?? player.team}
                  </p>
                  <div className="mt-3 text-3xl font-semibold text-[var(--accent)] metric-value">
                    {formatKeeperIQ(player.keeperiq)}
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <Row label="Talent G+/96" value={formatNumber(player.talent_p96, 2)} />
                    <Row label="2025 weight" value={formatPercent((player.weights.prior_season ?? 0) * 100, 0)} />
                    <Row label="2026 weight" value={formatPercent((player.weights.live_season ?? 0) * 100, 0)} />
                    <Row label="League prior" value={formatPercent((player.weights.league_prior ?? 0) * 100, 0)} />
                  </dl>
                </article>
              );
            })}
          </div>

          {seasonSelected.length ? (
            <>
              <article className="card card-pad">
                <h2 className="text-lg font-semibold">Component radar</h2>
                <ComponentRadar players={seasonSelected} />
              </article>
              <article className="card card-pad overflow-x-auto">
                <h2 className="text-lg font-semibold">Component table</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Adjusted Goals Added per 96. The better (higher) value in each row is highlighted.
                </p>
                <table className="data-table mt-3">
                  <thead>
                    <tr>
                      <th>Component</th>
                      {seasonSelected.map((player) => (
                        <th key={player.slug} className="num">
                          {player.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPONENT_ORDER.map((key) => {
                      const values = seasonSelected.map(
                        (player) => player.components[key]?.adjusted_p96 ?? null,
                      );
                      const numeric = values.filter(
                        (value): value is number => value !== null && !Number.isNaN(value),
                      );
                      const best =
                        numeric.length > 0 ? Math.max(...numeric) : null;
                      const hasUniqueBest =
                        best !== null && numeric.filter((value) => value === best).length === 1;

                      return (
                        <tr key={key}>
                          <td>{COMPONENT_LABELS[key]}</td>
                          {seasonSelected.map((player, index) => {
                            const value = values[index] ?? null;
                            const isBest =
                              hasUniqueBest && value !== null && value === best;
                            return (
                              <td
                                key={player.slug}
                                className={`num ${isBest ? "font-semibold text-[var(--positive)]" : ""}`}
                              >
                                {formatNumber(value, 3)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </article>
              <div className="grid gap-4 lg:grid-cols-2">
                {seasonSelected.map((player) => (
                  <article key={`notes-${player.slug}`} className="card card-pad">
                    <h3 className="font-semibold">{player.name}</h3>
                    <p className="mt-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      Strengths
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {player.notes.strengths.length ? (
                        player.notes.strengths.map((note) => <li key={note.text}>{note.text}</li>)
                      ) : (
                        <li className="text-[var(--text-muted)]">None flagged.</li>
                      )}
                    </ul>
                    <p className="mt-3 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                      Concerns
                    </p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {player.notes.concerns.length ? (
                        player.notes.concerns.map((note) => <li key={note.text}>{note.text}</li>)
                      ) : (
                        <li className="text-[var(--text-muted)]">None flagged.</li>
                      )}
                    </ul>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="metric-value">{value}</dd>
    </div>
  );
}
