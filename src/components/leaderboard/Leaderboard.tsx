"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ExportMenu } from "@/components/exports/ExportMenu";
import { RankChange } from "@/components/RankChange";
import { StatusBadge } from "@/components/StatusBadge";
import { exportLeaderboardWorkbook } from "@/lib/exports/excel-leaderboard";
import {
  clsx,
  formatKeeperIQ,
  formatMinutes,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { filterLeaderboard, rankChangeVsPriorFinal } from "@/lib/leaderboard-utils";
import type {
  ComponentStats,
  SampleStatus,
  SeasonPlayer,
  TalentPlayer,
  ViewId,
} from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

type SortKey =
  | "rank"
  | "name"
  | "team"
  | "minutes"
  | "keeperiq"
  | "adjusted_total_p96"
  | "observed_total_p96"
  | "goals_conceded_p96"
  | "save_pct"
  | "reliability"
  | ComponentSort;

type ComponentSort = `comp_${(typeof COMPONENT_ORDER)[number]}`;

interface LeaderboardProps {
  view: ViewId;
  seasonPlayers: SeasonPlayer[];
  talentPlayers: TalentPlayer[];
  /** 2025 Final players — ranks for Δ, and component fallback on Talent. */
  priorFinalPlayers?: SeasonPlayer[];
  /** 2026 Live players — preferred component profile on Talent. */
  liveSeasonPlayers?: SeasonPlayer[];
  teams: string[];
  maxMatchDate: string | null;
  qualificationNote: string;
}

function emptyComponents(): Record<string, ComponentStats> {
  return Object.fromEntries(
    COMPONENT_ORDER.map((key) => [
      key,
      {
        observed_p96: null,
        adjusted_p96: null,
        baseline_p96: null,
        total: null,
        raw_total: null,
        percentile: null,
        observed_percentile: null,
        opportunities: null,
        opportunities_p96: null,
        reliability: null,
      },
    ]),
  );
}

/**
 * Build a talent leaderboard row.
 *
 * KeeperIQ / Adj G+/96 stay as the Bayesian talent estimate. Component columns
 * are filled from the latest available season profile (2026 Live if the keeper
 * has minutes there, otherwise 2025 Final) — not a separate component-level
 * talent model.
 */
function talentAsRow(
  player: TalentPlayer,
  liveById: Map<string, SeasonPlayer>,
  priorById: Map<string, SeasonPlayer>,
): SeasonPlayer {
  const live = liveById.get(player.player_id);
  const prior = priorById.get(player.player_id);
  const hasLiveMinutes = (player.live_season_minutes ?? 0) > 0;
  const profile = hasLiveMinutes ? (live ?? prior ?? null) : (prior ?? live ?? null);

  const sampleStatus: SampleStatus = player.in_live_season
    ? (player.live_season_minutes ?? 0) >= 826
      ? "qualified"
      : (player.live_season_minutes ?? 0) >= 270
        ? "provisional"
        : "limited"
    : (player.prior_season_minutes ?? 0) >= 900
      ? "qualified"
      : "limited";

  return {
    player_id: player.player_id,
    slug: player.slug ?? player.player_id,
    name: player.name ?? "Unknown",
    season: profile?.season ?? 0,
    team_id: profile?.team_id ?? null,
    team: player.team ?? profile?.team ?? null,
    team_abbreviation: player.team_abbreviation ?? profile?.team_abbreviation ?? null,
    changed_teams: profile?.changed_teams ?? false,
    nationality: player.nationality ?? profile?.nationality ?? null,
    birth_date: profile?.birth_date ?? player.birth_date ?? null,
    age: profile?.age ?? player.age ?? null,
    minutes: hasLiveMinutes ? player.live_season_minutes : player.prior_season_minutes,
    appearances: profile?.appearances ?? null,
    sample_status: profile?.sample_status ?? sampleStatus,
    sample_status_label: profile?.sample_status_label ?? "Talent estimate",
    keeperiq: player.keeperiq,
    adjusted_total_p96: player.talent_p96,
    observed_total_p96: player.live_season_rate ?? prior?.observed_total_p96 ?? null,
    baseline_total_p96: player.league_prior_rate,
    adjusted_total: null,
    reliability: player.weights.live_season,
    interval_low: player.talent_low,
    interval_high: player.talent_high,
    interval_se: player.talent_sd,
    rank: player.rank,
    rank_observed: null,
    rank_goals_conceded: profile?.rank_goals_conceded ?? null,
    rank_pool: null,
    rank_goals_conceded_pool: null,
    rank_disagreement: null,
    goals_conceded: profile?.goals_conceded ?? null,
    goals_conceded_p96: profile?.goals_conceded_p96 ?? null,
    shots_faced: profile?.shots_faced ?? null,
    shots_faced_p96: profile?.shots_faced_p96 ?? null,
    saves: profile?.saves ?? null,
    save_pct: profile?.save_pct ?? null,
    xgoals_faced: profile?.xgoals_faced ?? null,
    goals_prevented: profile?.goals_prevented ?? null,
    goals_prevented_p96: profile?.goals_prevented_p96 ?? null,
    previous_rank: null,
    rank_change: null,
    keeperiq_change: null,
    components: profile?.components ?? emptyComponents(),
    archetype: profile?.archetype ?? null,
    notes: profile?.notes ?? { strengths: [], concerns: [] },
  };
}

function valueForSort(player: SeasonPlayer, key: SortKey): string | number | null {
  if (key.startsWith("comp_")) {
    const component = key.slice(5) as (typeof COMPONENT_ORDER)[number];
    return player.components[component]?.adjusted_p96 ?? null;
  }
  switch (key) {
    case "name":
      return player.name;
    case "team":
      return player.team_abbreviation ?? player.team ?? "";
    case "rank":
      return player.rank;
    case "minutes":
      return player.minutes;
    case "keeperiq":
      return player.keeperiq;
    case "adjusted_total_p96":
      return player.adjusted_total_p96;
    case "observed_total_p96":
      return player.observed_total_p96;
    case "goals_conceded_p96":
      return player.goals_conceded_p96;
    case "save_pct":
      return player.save_pct;
    case "reliability":
      return player.reliability;
    default:
      return null;
  }
}

export function Leaderboard({
  view,
  seasonPlayers,
  talentPlayers,
  priorFinalPlayers = [],
  liveSeasonPlayers = [],
  teams,
  maxMatchDate,
  qualificationNote,
}: LeaderboardProps) {
  const [query, setQuery] = useState("");
  const [team, setTeam] = useState("all");
  const [includeLimited, setIncludeLimited] = useState(false);
  const [minMinutes, setMinMinutes] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  const priorFinalRanks = useMemo(() => {
    const ranks = new Map<string, number>();
    for (const player of priorFinalPlayers) {
      if (player.rank !== null && player.rank !== undefined) {
        ranks.set(player.player_id, player.rank);
      }
    }
    return ranks;
  }, [priorFinalPlayers]);

  const liveById = useMemo(() => {
    const map = new Map<string, SeasonPlayer>();
    for (const player of liveSeasonPlayers) map.set(player.player_id, player);
    return map;
  }, [liveSeasonPlayers]);

  const priorById = useMemo(() => {
    const map = new Map<string, SeasonPlayer>();
    for (const player of priorFinalPlayers) map.set(player.player_id, player);
    return map;
  }, [priorFinalPlayers]);

  const rows = useMemo(() => {
    const source =
      view === "talent"
        ? talentPlayers.map((player) => talentAsRow(player, liveById, priorById))
        : seasonPlayers;
    const filtered = filterLeaderboard(source, {
      query,
      team,
      includeLimited,
      minMinutes,
    });

    const sorted = [...filtered].sort((left, right) => {
      const a = valueForSort(left, sortKey);
      const b = valueForSort(right, sortKey);
      if (a === null || a === undefined) return 1;
      if (b === null || b === undefined) return -1;
      if (typeof a === "string" && typeof b === "string") {
        return sortAsc ? a.localeCompare(b) : b.localeCompare(a);
      }
      const delta = Number(a) - Number(b);
      if (delta !== 0) return sortAsc ? delta : -delta;
      return left.player_id.localeCompare(right.player_id);
    });
    return sorted;
  }, [
    view,
    liveById,
    priorById,
    seasonPlayers,
    talentPlayers,
    query,
    team,
    includeLimited,
    minMinutes,
    sortKey,
    sortAsc,
  ]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc((value) => !value);
      return;
    }
    setSortKey(key);
    setSortAsc(key === "name" || key === "team" || key === "rank" || key === "goals_conceded_p96");
  }

  function header(label: string, key: SortKey, className = "") {
    const active = sortKey === key;
    return (
      <th className={className}>
        <button
          type="button"
          className={clsx(
            "inline-flex items-center gap-1 bg-transparent p-0 text-inherit",
            active && "text-[var(--accent)]",
          )}
          onClick={() => toggleSort(key)}
        >
          <span>{label}</span>
          <span aria-hidden>{active ? (sortAsc ? "↑" : "↓") : ""}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card card-pad grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--text-muted)]">Search</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Player or team"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--text-muted)]">Team</span>
          <select className="select" value={team} onChange={(event) => setTeam(event.target.value)}>
            <option value="all">All teams</option>
            {teams.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--text-muted)]">
            Minimum minutes ({minMinutes})
          </span>
          <input
            className="input"
            type="range"
            min={0}
            max={3000}
            step={90}
            value={minMinutes}
            onChange={(event) => setMinMinutes(Number(event.target.value))}
          />
        </label>
        <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-end xl:flex-col xl:items-stretch">
          <label className="flex items-center gap-2 pb-1 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={includeLimited}
              onChange={(event) => setIncludeLimited(event.target.checked)}
            />
            Include Limited Sample
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
        <p>
          Showing <strong className="text-[var(--text)]">{rows.length}</strong> goalkeepers
          {maxMatchDate ? <> · data through {maxMatchDate}</> : null}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p className="max-w-xl text-right text-xs">{qualificationNote}</p>
          <ExportMenu
            compact
            align="right"
            disabled={rows.length === 0}
            onExcel={() =>
              exportLeaderboardWorkbook({
                players: rows,
                view,
              })
            }
          />
        </div>
      </div>

      {view === "2026" ? (
        <p className="text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">vs ’25</strong> is change in KeeperIQ rank versus
          the 2025 Final leaderboard. ▲ means climbed (better rank number); ▼ means dropped.{" "}
          <strong className="text-[var(--text)]">NA</strong> means the goalkeeper was not ranked in
          2025 Final.
        </p>
      ) : null}

      {view === "talent" ? (
        <p className="text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text)]">KeeperIQ</strong> and{" "}
          <strong className="text-[var(--text)]">Adj G+/96</strong> are the Current Talent
          estimate. Component columns (Shot–Fielding) come from the latest available season
          profile — 2026 Live when the keeper has minutes there, otherwise 2025 Final. They are
          not a separate Bayesian talent blend by component.
        </p>
      ) : null}

      <div className="table-wrap max-h-[70vh] overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              {header("Rk", "rank", "num")}
              {view === "2026" ? <th className="num hide-sm">vs ’25</th> : null}
              {header("Player", "name")}
              {header("Team", "team", "hide-sm")}
              {header("Min", "minutes", "num")}
              {header("KeeperIQ", "keeperiq", "num")}
              {header("Adj G+/96", "adjusted_total_p96", "num")}
              {header("Obs G+/96", "observed_total_p96", "num hide-md")}
              {COMPONENT_ORDER.map((key) =>
                header(
                  COMPONENT_LABELS[key].split(" ")[0]!,
                  `comp_${key}`,
                  "num hide-md",
                ),
              )}
              {header("GA/96", "goals_conceded_p96", "num hide-sm")}
              {header("SV%", "save_pct", "num hide-md")}
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((player) => (
              <tr key={player.player_id}>
                <td className="num metric-value">{player.rank ?? "—"}</td>
                {view === "2026" ? (
                  <td className="num hide-sm">
                    <RankChange value={rankChangeVsPriorFinal(player, priorFinalRanks)} />
                  </td>
                ) : null}
                <td>
                  <Link
                    href={`/players/${player.slug}`}
                    className="font-medium text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {player.name}
                  </Link>
                  <div className="mt-1 hidden text-xs text-[var(--text-muted)] max-[720px]:block">
                    {player.team_abbreviation ?? player.team}
                  </div>
                </td>
                <td className="hide-sm">{player.team_abbreviation ?? player.team ?? "—"}</td>
                <td className="num">{formatMinutes(player.minutes)}</td>
                <td className="num font-semibold text-[var(--accent)]">
                  {formatKeeperIQ(player.keeperiq)}
                </td>
                <td className="num">{formatNumber(player.adjusted_total_p96, 2)}</td>
                <td className="num hide-md">{formatNumber(player.observed_total_p96, 2)}</td>
                {COMPONENT_ORDER.map((key) => (
                  <td key={key} className="num hide-md">
                    {formatNumber(player.components[key]?.adjusted_p96, 3)}
                  </td>
                ))}
                <td className="num hide-sm">{formatNumber(player.goals_conceded_p96, 2)}</td>
                <td className="num hide-md">{formatPercent(player.save_pct)}</td>
                <td>
                  <StatusBadge status={player.sample_status as SampleStatus} />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={16} className="py-10 text-center text-[var(--text-muted)]">
                  No goalkeepers match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile cards for the densest columns */}
      <div className="grid gap-3 md:hidden">
        {rows.slice(0, 25).map((player) => (
          <Link
            key={`card-${player.player_id}`}
            href={`/players/${player.slug}`}
            className="card card-pad block no-underline hover:border-[var(--accent)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-[var(--text-muted)]">#{player.rank}</div>
                <div className="text-base font-semibold">{player.name}</div>
                <div className="text-sm text-[var(--text-muted)]">
                  {player.team_abbreviation ?? player.team} · {formatMinutes(player.minutes)} min
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold text-[var(--accent)] metric-value">
                  {formatKeeperIQ(player.keeperiq)}
                </div>
                <div className="text-xs text-[var(--text-muted)]">KeeperIQ</div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
              <span>Adj {formatNumber(player.adjusted_total_p96, 2)}</span>
              <span>Obs {formatNumber(player.observed_total_p96, 2)}</span>
              <span>GA/96 {formatNumber(player.goals_conceded_p96, 2)}</span>
              <StatusBadge status={player.sample_status as SampleStatus} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
