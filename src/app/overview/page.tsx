import type { Metadata } from "next";
import Link from "next/link";

import { StatusBadge } from "@/components/StatusBadge";
import { getDataStatus, getSeason, getTalent } from "@/lib/data";
import { formatDate, formatKeeperIQ, formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Overview",
  description: "MLS KeeperIQ overview — leaders, freshness, and rank disagreements.",
};

export default async function OverviewPage() {
  const [season2025, season2026, talent, status] = await Promise.all([
    getSeason(2025),
    getSeason(2026),
    getTalent(),
    getDataStatus(),
  ]);

  const top2025 = season2025.players
    .filter((player) => player.sample_status !== "limited")
    .slice(0, 5);
  const top2026 = season2026.players
    .filter((player) => player.sample_status !== "limited")
    .slice(0, 5);
  const topTalent = talent.players.slice(0, 5);

  const disagreements = [...season2025.players]
    .filter((player) => player.rank_disagreement !== null && player.sample_status === "qualified")
    .sort((a, b) => Math.abs(b.rank_disagreement ?? 0) - Math.abs(a.rank_disagreement ?? 0))
    .slice(0, 4);

  return (
    <div className="container-page space-y-8">
      <section className="card card-pad">
        <p className="eyebrow">MLS Goalkeeper Evaluation</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-4xl">
          Which goalkeepers provide the greatest complete on-field value?
        </h1>
        <p className="mt-4 max-w-3xl text-[var(--text-muted)]">
          Goals allowed and raw save percentage punish goalkeepers for the defence in front of them.
          KeeperIQ evaluates shot-stopping, handling, claiming, sweeping, passing, and fielding in a
          common Goals Added unit, then adjusts for sample reliability. The result is a percentile
          score of complete impact relative to MLS peers — not a physical unit, and not a weighted
          cocktail of arbitrary percentages.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/leaderboard" className="btn btn-primary no-underline">
            Open leaderboard
          </Link>
          <Link href="/scouting" className="btn no-underline">
            Scouting tool
          </Link>
          <Link href="/" className="btn no-underline">
            About & methodology
          </Link>
          <Link href="/compare" className="btn no-underline">
            Compare keepers
          </Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetaCard
          label="2025 Final"
          value={`${season2025.counts.qualified} qualified`}
          detail={`Complete season · through ${formatDate(season2025.max_match_date)}`}
          href="/leaderboard?view=2025"
        />
        <MetaCard
          label="2026 Live"
          value={`${season2026.counts.qualified} qualified`}
          detail={`Refreshed ${formatDate(status.last_successful_update)} · matches through ${formatDate(season2026.max_match_date)}`}
          href="/leaderboard?view=2026"
        />
        <MetaCard
          label="Data freshness"
          value={status.data_is_current ? "Current" : "Fallback"}
          detail={`Last successful refresh ${formatDate(status.last_successful_update)}`}
          href="#season-coverage"
        />
      </section>

      <section id="season-coverage" className="space-y-3">
        <div>
          <p className="eyebrow">Dataset</p>
          <h2 className="mt-1 text-xl font-semibold">Season coverage</h2>
          <p className="mt-1 max-w-3xl text-sm text-[var(--text-muted)]">
            How many keepers and matches sit behind each leaderboard view, plus the qualification
            thresholds for that season.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(status.seasons).map(([season, detail]) => (
            <article key={season} className="card card-pad">
              <h3 className="text-lg font-semibold">{season} season</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <CoverageItem label="Goalkeepers" value={String(detail.goalkeepers)} />
                <CoverageItem label="Match rows" value={String(detail.goalkeeper_match_rows)} />
                <CoverageItem label="Matches covered" value={String(detail.matches_covered)} />
                <CoverageItem
                  label="Total minutes"
                  value={detail.total_minutes.toLocaleString()}
                />
                <CoverageItem label="Qualified" value={String(detail.sample_counts.qualified)} />
                <CoverageItem label="Provisional" value={String(detail.sample_counts.provisional)} />
                <CoverageItem label="Limited" value={String(detail.sample_counts.limited)} />
                <CoverageItem label="Max match date" value={formatDate(detail.max_match_date)} />
              </dl>
              <p className="mt-3 text-xs text-[var(--text-muted)]">
                {detail.qualification.explanation}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <LeaderCard title="2025 Final leaders" players={top2025} href="/leaderboard?view=2025" />
        <LeaderCard title="2026 Live leaders" players={top2026} href="/leaderboard?view=2026" />
        <LeaderCard
          title="Current talent leaders"
          players={topTalent.map((player) => ({
            slug: player.slug ?? player.player_id,
            name: player.name ?? "Unknown",
            team_abbreviation: player.team_abbreviation,
            keeperiq: player.keeperiq,
            adjusted_total_p96: player.talent_p96,
            sample_status: "qualified" as const,
          }))}
          href="/leaderboard?view=talent"
          note="Bayesian blend of 2025 prior evidence and 2026 live evidence."
        />
      </section>

      <section className="card card-pad">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Why goals allowed misleads</p>
            <h2 className="mt-1 text-xl font-semibold">Largest 2025 rank disagreements</h2>
          </div>
          <Link href="/leaderboard?view=2025" className="text-sm text-[var(--accent)]">
            Explore the leaderboard
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-muted)]">
          A disagreement does not prove one metric is “right”. It identifies goalkeepers whose
          context-adjusted complete impact ranks differently from traditional goals-allowed ranking.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {disagreements.map((player) => (
            <Link
              key={player.player_id}
              href={`/players/${player.slug}`}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4 no-underline hover:border-[var(--accent)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{player.name}</div>
                  <div className="text-sm text-[var(--text-muted)]">
                    {player.team_abbreviation} · KeeperIQ #{player.rank_pool} · GA #
                    {player.rank_goals_conceded_pool}
                  </div>
                </div>
                <div
                  className={
                    (player.rank_disagreement ?? 0) > 0
                      ? "text-[var(--positive)]"
                      : "text-[var(--negative)]"
                  }
                >
                  {(player.rank_disagreement ?? 0) > 0 ? "↑" : "↓"}{" "}
                  {Math.abs(player.rank_disagreement ?? 0)}
                </div>
              </div>
              <div className="mt-2 text-xs text-[var(--text-muted)]">
                KeeperIQ {formatKeeperIQ(player.keeperiq)} · Adj{" "}
                {formatNumber(player.adjusted_total_p96, 2)} · GA/96{" "}
                {formatNumber(player.goals_conceded_p96, 2)}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetaCard({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <Link href={href} className="card card-pad block no-underline hover:border-[var(--accent)]">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{detail}</p>
    </Link>
  );
}

function CoverageItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium text-[var(--text)]">{value}</dd>
    </div>
  );
}

function LeaderCard({
  title,
  players,
  href,
  note,
}: {
  title: string;
  players: Array<{
    slug: string;
    name: string;
    team_abbreviation: string | null | undefined;
    keeperiq: number | null;
    adjusted_total_p96: number | null;
    sample_status: "qualified" | "provisional" | "limited";
  }>;
  href: string;
  note?: string;
}) {
  return (
    <section className="card card-pad">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link href={href} className="text-sm text-[var(--accent)]">
          View all
        </Link>
      </div>
      {note ? <p className="mt-1 text-xs text-[var(--text-muted)]">{note}</p> : null}
      <ol className="mt-4 space-y-3">
        {players.map((player, index) => (
          <li key={player.slug} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-5 text-sm text-[var(--text-muted)]">{index + 1}</span>
              <div>
                <Link
                  href={`/players/${player.slug}`}
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {player.name}
                </Link>
                <div className="text-xs text-[var(--text-muted)]">
                  {player.team_abbreviation ?? "—"} · Adj{" "}
                  {formatNumber(player.adjusted_total_p96, 2)}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold text-[var(--accent)] metric-value">
                {formatKeeperIQ(player.keeperiq)}
              </div>
              <StatusBadge status={player.sample_status} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
