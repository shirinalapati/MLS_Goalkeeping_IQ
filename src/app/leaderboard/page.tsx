import type { Metadata } from "next";
import Link from "next/link";

import { Leaderboard } from "@/components/leaderboard/Leaderboard";
import { getSeason, getTalent } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { ViewId } from "@/lib/types";

export const metadata: Metadata = {
  title: "Leaderboard",
  description:
    "2025 Final, 2026 Live, and Current Talent leaderboards for MLS goalkeepers.",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view = (["2025", "2026", "talent"].includes(params.view ?? "")
    ? params.view
    : "2026") as ViewId;

  const [season2025, season2026, talent] = await Promise.all([
    getSeason(2025),
    getSeason(2026),
    getTalent(),
  ]);

  const activeSeason = view === "2025" ? season2025 : season2026;
  const teams = Array.from(
    new Set(
      [...season2025.players, ...season2026.players]
        .map((player) => player.team_abbreviation)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();

  return (
    <div className="container-page space-y-6">
      <section>
        <p className="eyebrow">Rankings</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
          KeeperIQ is the percentile of a goalkeeper’s reliability-adjusted complete impact. The
          adjusted G+/96 rate beside it is the underlying continuous measure.
        </p>
      </section>

      <div className="tabs">
        {(
          [
            ["2025", "2025 Final"],
            ["2026", "2026 Live"],
            ["talent", "Current Talent"],
          ] as const
        ).map(([id, label]) => (
          <Link
            key={id}
            href={`/leaderboard?view=${id}`}
            className={`btn no-underline ${view === id ? "btn-active" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {view === "talent" ? (
        <p className="text-sm text-[var(--text-muted)]">
          Current Talent is an estimate, not an observed season statistic. Weights depend on how
          much reliable 2026 evidence each goalkeeper has. Latest match date:{" "}
          {formatDate(talent.max_match_date)}.
        </p>
      ) : null}

      <Leaderboard
        view={view}
        seasonPlayers={activeSeason.players}
        talentPlayers={talent.players}
        priorFinalPlayers={season2025.players}
        liveSeasonPlayers={season2026.players}
        teams={teams}
        maxMatchDate={
          view === "talent" ? talent.max_match_date : activeSeason.max_match_date
        }
        qualificationNote={
          view === "talent"
            ? "Talent view ranks the Bayesian combination of 2025 prior evidence and 2026 live evidence."
            : activeSeason.qualification.explanation
        }
      />
    </div>
  );
}
