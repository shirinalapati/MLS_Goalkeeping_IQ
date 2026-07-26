import type { Metadata } from "next";
import Link from "next/link";

import { getArchetypes } from "@/lib/data";
import { formatKeeperIQ, formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Archetypes",
  description: "Playing-style clusters of MLS goalkeepers based on involvement rates.",
};

export default async function ArchetypesPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const payload = await getArchetypes();
  const season = params.season ?? String(payload.default_season);
  const data = payload.seasons[season] ?? payload.seasons[String(payload.default_season)];

  return (
    <div className="container-page space-y-6">
      <section>
        <p className="eyebrow">Playing styles</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Goalkeeper archetypes</h1>
        <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
          {data?.available
            ? `This season uses ${data.profiles.length} distinct archetypes`
            : "Archetypes group keepers by playing style"}
          {" "}
          from a cluster model on standardised involvement rates — claim attempts, sweeping
          actions, passes, fielding actions, handling actions, and shots faced per 96 minutes —
          not from Goals Added values. Labels are assigned only when a centroid actually elevates
          the corresponding dimension. Archetypes describe involvement style, not quality.
        </p>
      </section>

      <div className="tabs">
        {Object.keys(payload.seasons).map((value) => (
          <Link
            key={value}
            href={`/archetypes?season=${value}`}
            className={`btn no-underline ${value === season ? "btn-active" : ""}`}
          >
            {value}
          </Link>
        ))}
      </div>

      {!data?.available ? (
        <div className="card card-pad text-[var(--text-muted)]">
          {data?.reason ?? "Archetypes are unavailable for this season."}
        </div>
      ) : (
        <>
          <p className="text-sm text-[var(--text-muted)]">
            <strong className="text-[var(--text)]">{data.profiles.length} archetypes</strong> in{" "}
            {season}. The count can differ by season when the model selects a different number of
            clusters.
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            Each involvement rate shows a rank out of {data.profiles.length} — where this archetype
            stands among the {data.profiles.length} archetype centroids for that stat in {season}{" "}
            (#1 = highest involvement rate). These ranks compare styles to each other, not
            individual keepers, and they are not quality rankings.
          </p>
          <section className="grid gap-4 lg:grid-cols-2">
            {data.profiles.map((profile) => (
              <article key={profile.cluster_id} className="card card-pad">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{profile.label}</h2>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{profile.description}</p>
                  </div>
                  <div className="text-right text-sm text-[var(--text-muted)]">
                    <div>{profile.size} keepers</div>
                    <div>Median IQ {formatKeeperIQ(profile.median_keeperiq)}</div>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(profile.centroid_raw).map(([key, value]) => {
                    const rank = rankAmongArchetypes(data.profiles, key, profile.cluster_id);
                    return (
                      <div key={key} className="rounded-md border border-[var(--border)] px-2 py-1.5">
                        <dt className="text-xs text-[var(--text-muted)]">
                          {key.replaceAll("_", " ")}
                        </dt>
                        <dd className="metric-value">{formatNumber(value, 1)} / 96</dd>
                        {rank !== null ? (
                          <dd className="mt-0.5 text-xs text-[var(--text-muted)]">
                            Rank #{rank} of {data.profiles.length} archetypes
                          </dd>
                        ) : null}
                      </div>
                    );
                  })}
                </dl>
              </article>
            ))}
          </section>

          <section className="card card-pad overflow-x-auto">
            <h2 className="text-lg font-semibold">Members</h2>
            <table className="data-table mt-3">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th>Archetype</th>
                  <th className="num">KeeperIQ</th>
                  <th className="num">Adj G+/96</th>
                  <th className="num">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((member) => (
                  <tr key={member.player_id}>
                    <td>
                      <Link href={`/players/${member.slug}`} className="hover:text-[var(--accent)]">
                        {member.name}
                      </Link>
                    </td>
                    <td>{member.team ?? "—"}</td>
                    <td>{member.label}</td>
                    <td className="num">{formatKeeperIQ(member.keeperiq)}</td>
                    <td className="num">{formatNumber(member.adjusted_total_p96, 2)}</td>
                    <td className="num">{member.minutes ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

        </>
      )}
    </div>
  );
}

/** Competition rank of one archetype centroid vs the others (higher rate = better). */
function rankAmongArchetypes(
  profiles: Array<{ cluster_id: number | string; centroid_raw: Record<string, number> }>,
  metricKey: string,
  clusterId: number | string,
): number | null {
  const values = profiles
    .map((profile) => ({
      cluster_id: profile.cluster_id,
      value: profile.centroid_raw[metricKey],
    }))
    .filter((entry): entry is { cluster_id: number | string; value: number } =>
      typeof entry.value === "number" && Number.isFinite(entry.value),
    );

  const target = values.find((entry) => entry.cluster_id === clusterId);
  if (!target) return null;

  const better = values.filter((entry) => entry.value > target.value).length;
  return better + 1;
}
