import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComponentBars } from "@/components/charts/ComponentBars";
import { ComponentRadar } from "@/components/charts/ComponentRadar";
import { TimelineChart } from "@/components/charts/TimelineChart";
import { StatusBadge } from "@/components/StatusBadge";
import { getAllPlayerSlugs, getPlayerProfile, getSeason, getTalent } from "@/lib/data";
import {
  formatDate,
  formatKeeperIQ,
  formatMinutes,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import { formatRankLabel, rankAmong } from "@/lib/player-ranks";
import { COMPONENT_LABELS, COMPONENT_ORDER, type ComponentKey } from "@/lib/types";

export async function generateStaticParams() {
  const slugs = await getAllPlayerSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPlayerProfile(slug);
  if (!profile) return { title: "Player not found" };
  return {
    title: profile.name,
    description: `KeeperIQ profile for ${profile.name}, including observed and reliability-adjusted Goals Added.`,
  };
}

export default async function PlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const profile = await getPlayerProfile(slug);
  if (!profile) notFound();

  const seasons = profile.available_seasons;
  const selected =
    query.season && seasons.includes(Number(query.season))
      ? Number(query.season)
      : seasons[0]!;
  const season = profile.seasons[String(selected)];
  if (!season) notFound();

  const otherSeason = seasons.find((value) => value !== selected);
  const other = otherSeason ? profile.seasons[String(otherSeason)] : null;

  const [seasonPayload, talentPayload] = await Promise.all([getSeason(selected), getTalent()]);
  const peers = seasonPayload.players;
  const playerId = season.player_id;

  const ranks = {
    adjusted: rankAmong(peers, playerId, (p) => p.adjusted_total_p96, { higherIsBetter: true }),
    observed: rankAmong(peers, playerId, (p) => p.observed_total_p96, { higherIsBetter: true }),
    minutes: rankAmong(peers, playerId, (p) => p.minutes, { higherIsBetter: true }),
    appearances: rankAmong(peers, playerId, (p) => p.appearances, { higherIsBetter: true }),
    goalsAllowed: rankAmong(peers, playerId, (p) => p.goals_conceded, { higherIsBetter: false }),
    ga96: rankAmong(peers, playerId, (p) => p.goals_conceded_p96, { higherIsBetter: false }),
    savePct: rankAmong(peers, playerId, (p) => p.save_pct, { higherIsBetter: true }),
    goalsPrevented: rankAmong(peers, playerId, (p) => p.goals_prevented, { higherIsBetter: true }),
    goalsPrevented96: rankAmong(peers, playerId, (p) => p.goals_prevented_p96, {
      higherIsBetter: true,
    }),
    reliability: rankAmong(peers, playerId, (p) => p.reliability, { higherIsBetter: true }),
    shotsFaced: rankAmong(peers, playerId, (p) => p.shots_faced, { higherIsBetter: true }),
    saves: rankAmong(peers, playerId, (p) => p.saves, { higherIsBetter: true }),
  };

  const componentRanks = Object.fromEntries(
    COMPONENT_ORDER.map((key) => [
      key,
      rankAmong(peers, playerId, (p) => p.components[key]?.adjusted_p96, { higherIsBetter: true }),
    ]),
  ) as Record<ComponentKey, ReturnType<typeof rankAmong>>;

  const opportunityRanks = Object.fromEntries(
    COMPONENT_ORDER.map((key) => [
      key,
      rankAmong(peers, playerId, (p) => p.components[key]?.opportunities, {
        higherIsBetter: true,
      }),
    ]),
  ) as Record<ComponentKey, ReturnType<typeof rankAmong>>;

  const talentPeers = talentPayload.players;
  const talentRank = profile.talent
    ? rankAmong(talentPeers, profile.talent.player_id, (p) => p.talent_p96, {
        higherIsBetter: true,
      })
    : null;

  return (
    <div className="container-page space-y-6">
      <section className="card card-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Goalkeeper profile</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">{profile.name}</h1>
            <p className="mt-1 text-[var(--text-muted)]">
              {season.team ?? "Unknown club"}
              {season.changed_teams ? " · multiple clubs this season" : ""}
              {season.nationality ? ` · ${season.nationality}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={season.sample_status} />
              {season.archetype ? (
                <span className="badge badge-qualified">{season.archetype}</span>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-semibold text-[var(--accent)] metric-value">
              {formatKeeperIQ(season.keeperiq)}
            </div>
            <div className="text-sm text-[var(--text-muted)]">
              KeeperIQ · {formatRankLabel(ranks.adjusted.rank, ranks.adjusted.pool) ?? "unranked"}
            </div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">
              90% interval {formatNumber(season.interval_low, 2)} –{" "}
              {formatNumber(season.interval_high, 2)} Adj G+/96
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {seasons.map((value) => (
            <Link
              key={value}
              href={`/players/${slug}?season=${value}`}
              className={`btn no-underline ${value === selected ? "btn-active" : ""}`}
            >
              {value}
            </Link>
          ))}
          <Link href={`/compare?players=${slug}`} className="btn no-underline">
            Compare
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Adjusted G+/96"
          value={formatNumber(season.adjusted_total_p96, 2)}
          rank={ranks.adjusted}
        />
        <Metric
          label="Observed G+/96"
          value={formatNumber(season.observed_total_p96, 2)}
          rank={ranks.observed}
        />
        <Metric label="Minutes" value={formatMinutes(season.minutes)} rank={ranks.minutes} />
        <Metric
          label="Appearances"
          value={String(season.appearances ?? "—")}
          rank={ranks.appearances}
        />
        <Metric
          label="Goals allowed"
          value={String(season.goals_conceded ?? "—")}
          rank={ranks.goalsAllowed}
        />
        <Metric
          label="GA / 96"
          value={formatNumber(season.goals_conceded_p96, 2)}
          rank={ranks.ga96}
        />
        <Metric label="Save %" value={formatPercent(season.save_pct)} rank={ranks.savePct} />
        <Metric
          label="Goals prevented"
          value={formatNumber(season.goals_prevented, 2)}
          rank={ranks.goalsPrevented}
        />
        <Metric
          label="Goals prevented / 96"
          value={formatNumber(season.goals_prevented_p96, 2)}
          rank={ranks.goalsPrevented96}
        />
        <Metric
          label="Sample Influence"
          description="Sample Influence shows how much the goalkeeper’s observed performance affects the adjusted rating rather than being pulled toward the MLS average."
          value={formatPercent((season.reliability ?? 0) * 100, 0)}
          rank={ranks.reliability}
        />
        <Metric
          label="Shots faced"
          value={String(season.shots_faced ?? "—")}
          rank={ranks.shotsFaced}
        />
        <Metric label="Saves" value={String(season.saves ?? "—")} rank={ranks.saves} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card card-pad">
          <h2 className="text-lg font-semibold">Component percentiles</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Reliability-adjusted component percentiles versus the season reference pool.
          </p>
          <ComponentRadar players={[season]} />
        </article>
        <article className="card card-pad">
          <h2 className="text-lg font-semibold">Component contributions</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Adjusted Goals Added per 96 by component. Positive is above an average MLS goalkeeper.
          </p>
          <ComponentBars player={season} />
        </article>
      </section>

      <section className="card card-pad overflow-x-auto">
        <h2 className="text-lg font-semibold">Component detail</h2>
        <div className="mt-1 space-y-1 text-sm text-[var(--text-muted)]">
          <p>
            <strong className="text-[var(--text)]">Quality rank</strong> — place among all {selected}{" "}
            keepers by adjusted Goals Added per 96 for that skill (#1 = best rate).
          </p>
          <p>
            <strong className="text-[var(--text)]">Volume rank</strong> — place by how many of those
            actions they faced or attempted (#1 = most opportunities). This is workload, not quality.
          </p>
          <p>
            Percentile is the reliability-adjusted standing in the season reference pool — related to
            quality, but not the same number as Quality rank.
          </p>
        </div>
        <table className="data-table mt-3">
          <thead>
            <tr>
              <th>Component</th>
              <th className="num">Adj / 96</th>
              <th className="num">Obs / 96</th>
              <th className="num">Quality rank</th>
              <th className="num">Percentile</th>
              <th className="num">Opportunities</th>
              <th className="num">Volume rank</th>
              <th className="num">Reliability</th>
            </tr>
          </thead>
          <tbody>
            {COMPONENT_ORDER.map((key) => {
              const component = season.components[key];
              const adjRank = componentRanks[key];
              const oppRank = opportunityRanks[key];
              return (
                <tr key={key}>
                  <td>{COMPONENT_LABELS[key]}</td>
                  <td className="num">{formatNumber(component?.adjusted_p96, 3)}</td>
                  <td className="num">{formatNumber(component?.observed_p96, 3)}</td>
                  <td className="num">
                    {adjRank.rank !== null ? `#${adjRank.rank}` : "—"}
                    <span className="text-[var(--text-faint)]">/{adjRank.pool}</span>
                  </td>
                  <td className="num">{formatNumber(component?.percentile, 1)}</td>
                  <td className="num">{component?.opportunities ?? "—"}</td>
                  <td className="num">
                    {oppRank.rank !== null ? `#${oppRank.rank}` : "—"}
                    <span className="text-[var(--text-faint)]">/{oppRank.pool}</span>
                  </td>
                  <td className="num">{formatPercent((component?.reliability ?? 0) * 100, 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {COMPONENT_ORDER.map((key) => {
          const component = season.components[key];
          const adjRank = componentRanks[key];
          return (
            <Metric
              key={key}
              label={`${COMPONENT_LABELS[key]} Adj G+/96`}
              value={formatNumber(component?.adjusted_p96, 3)}
              rank={adjRank}
            />
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="card card-pad">
          <h2 className="text-lg font-semibold">Strengths</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {season.notes.strengths.length ? (
              season.notes.strengths.map((note) => (
                <li key={note.text} className="rounded-md border border-[var(--border)] px-3 py-2">
                  {note.text}
                </li>
              ))
            ) : (
              <li className="text-[var(--text-muted)]">No above-threshold strengths flagged.</li>
            )}
          </ul>
        </article>
        <article className="card card-pad">
          <h2 className="text-lg font-semibold">Concerns</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {season.notes.concerns.length ? (
              season.notes.concerns.map((note) => (
                <li key={note.text} className="rounded-md border border-[var(--border)] px-3 py-2">
                  {note.text}
                </li>
              ))
            ) : (
              <li className="text-[var(--text-muted)]">No below-threshold concerns flagged.</li>
            )}
          </ul>
        </article>
      </section>

      <section className="card card-pad">
        <h2 className="text-lg font-semibold">Season timeline</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Match G+/96 and the season-to-date rolling rate. Axes are labelled in Goals Added per 96
          minutes.
        </p>
        <div className="mt-4">
          <TimelineChart timeline={season.timeline} />
        </div>
      </section>

      {profile.talent ? (
        <section className="card card-pad">
          <h2 className="text-lg font-semibold">Current talent estimate</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            A Bayesian combination of the league prior, 2025 evidence, and 2026 evidence. This is an
            estimate of underlying ability, not an observed season statistic.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric
              label="Talent KeeperIQ"
              value={formatKeeperIQ(profile.talent.keeperiq)}
              rank={talentRank}
            />
            <Metric
              label="Talent G+/96"
              value={formatNumber(profile.talent.talent_p96, 2)}
              rank={talentRank}
            />
            <Metric
              label="Interval"
              value={`${formatNumber(profile.talent.talent_low, 2)} – ${formatNumber(profile.talent.talent_high, 2)}`}
            />
            <Metric label="Prior source" value={profile.talent.prior_source.replaceAll("_", " ")} />
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <WeightBar label="League prior" value={profile.talent.weights.league_prior} />
            <WeightBar label="2025 evidence" value={profile.talent.weights.prior_season} />
            <WeightBar label="2026 evidence" value={profile.talent.weights.live_season} />
          </div>
        </section>
      ) : null}

      {other ? (
        <section className="card card-pad">
          <h2 className="text-lg font-semibold">
            {selected} versus {otherSeason}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3 text-sm">
            <CompareCell
              label="KeeperIQ"
              a={formatKeeperIQ(season.keeperiq)}
              b={formatKeeperIQ(other.keeperiq)}
            />
            <CompareCell
              label="Adj G+/96"
              a={formatNumber(season.adjusted_total_p96, 2)}
              b={formatNumber(other.adjusted_total_p96, 2)}
            />
            <CompareCell
              label="Minutes"
              a={formatMinutes(season.minutes)}
              b={formatMinutes(other.minutes)}
            />
          </div>
        </section>
      ) : null}

      {season.ranking_history.length > 1 ? (
        <section className="card card-pad overflow-x-auto">
          <h2 className="text-lg font-semibold">Ranking history</h2>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th>Captured</th>
                <th>Match cutoff</th>
                <th className="num">Rank</th>
                <th className="num">KeeperIQ</th>
                <th className="num">Adj G+/96</th>
              </tr>
            </thead>
            <tbody>
              {season.ranking_history.map((point) => (
                <tr key={point.captured_at}>
                  <td>{formatDate(point.captured_at)}</td>
                  <td>{formatDate(point.max_match_date)}</td>
                  <td className="num">{point.rank}</td>
                  <td className="num">{formatKeeperIQ(point.keeperiq)}</td>
                  <td className="num">{formatNumber(point.adj_total_p96, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {season.team_stints.length > 1 ? (
        <section className="card card-pad">
          <h2 className="text-lg font-semibold">Club stints</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {season.team_stints.map((stint) => (
              <li key={`${stint.team_id}-${stint.first_match}`}>
                <strong>{stint.team_name}</strong> · {stint.appearances} apps ·{" "}
                {formatMinutes(stint.minutes)} min · {formatDate(stint.first_match)} –{" "}
                {formatDate(stint.last_match)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  description,
  value,
  rank,
}: {
  label: string;
  description?: string;
  value: string;
  rank?: { rank: number | null; pool: number } | null;
}) {
  const rankLabel = rank ? formatRankLabel(rank.rank, rank.pool) : null;
  return (
    <article className="card card-pad">
      <p className="eyebrow">{label}</p>
      {description ? (
        <p className="mt-1 text-xs leading-snug text-[var(--text-muted)]">{description}</p>
      ) : null}
      <p className="mt-2 text-2xl font-semibold metric-value">{value}</p>
      {rankLabel ? <p className="mt-1 text-sm text-[var(--text-muted)]">{rankLabel}</p> : null}
    </article>
  );
}

function WeightBar({ label, value }: { label: string; value: number | null }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="metric-value">{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-elevated)]">
        <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CompareCell({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 font-medium">
        {a} <span className="text-[var(--text-faint)]">vs</span> {b}
      </div>
    </div>
  );
}
