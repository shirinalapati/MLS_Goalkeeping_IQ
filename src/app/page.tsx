import type { Metadata } from "next";
import Link from "next/link";

import { getMethodology } from "@/lib/data";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: {
    absolute: "About & Methodology · MLS KeeperIQ",
  },
  description:
    "About MLS KeeperIQ — context-adjusted goalkeeper evaluation, how to use the platform, and full methodology.",
};

export default async function AboutMethodologyPage() {
  const method = await getMethodology();
  const q2025 = method.qualification["2025"];
  const q2026 = method.qualification["2026"];
  const bootstrap = method.bootstrap;

  return (
    <div className="container-page prose-page space-y-2">
      <section>
        <p className="eyebrow">MLS KeeperIQ</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--text)] md:text-4xl">
          About & Methodology
        </h1>
        <p className="mt-3 max-w-3xl">
          <strong>Primary data source:</strong>{" "}
          <a href={method.source.attribution_url} className="text-[var(--accent)]">
            {method.source.provider}
          </a>
          <br />
          <strong>Rate convention:</strong> Per {method.minutes_basis} minutes
        </p>
        <p className="mt-4 max-w-3xl">
          MLS KeeperIQ is a context-adjusted goalkeeper evaluation platform designed to answer a
          simple question:
        </p>
        <p className="mt-3 max-w-3xl text-lg font-medium text-[var(--text)]">
          Which MLS goalkeepers provide the greatest complete on-field value when shot-stopping,
          handling, claiming, sweeping, passing, and fielding are evaluated together?
        </p>
        <p className="mt-4 max-w-3xl">
          Traditional goalkeeper statistics often focus on goals allowed, clean sheets, and save
          percentage. Those numbers describe outcomes, but they do not fully separate goalkeeper
          performance from the defensive environment in front of the player.
        </p>
        <p className="max-w-3xl">
          A goalkeeper behind a team that regularly concedes high-quality chances can allow many
          goals while still performing above expectation. Another goalkeeper may produce strong
          traditional numbers while facing relatively easy shots and receiving substantial protection
          from the defense.
        </p>
        <p className="max-w-3xl">KeeperIQ is designed to provide a more complete evaluation.</p>
        <p className="mt-4 max-w-3xl rounded-lg border border-[rgba(61,214,198,0.35)] bg-[var(--accent-dim)] px-4 py-3 text-[var(--text)]">
          <strong>Metric glossary:</strong> Use the highlighted{" "}
          <strong>Open glossary</strong> button in the top navigation on any page. It defines
          leaderboard columns and other metrics, and each term links to the matching section below
          for a fuller explanation.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/overview" className="btn btn-primary no-underline">
            Go to overview
          </Link>
          <Link href="/leaderboard" className="btn no-underline">
            Open leaderboard
          </Link>
          <Link href="/scouting" className="btn no-underline">
            Scouting tool
          </Link>
        </div>
      </section>

      <section>
        <h2>What KeeperIQ measures</h2>
        <p>
          KeeperIQ evaluates six areas of goalkeeper impact:
        </p>
        <ul>
          <li>Shot Stopping</li>
          <li>Handling</li>
          <li>Claiming</li>
          <li>Sweeping</li>
          <li>Passing</li>
          <li>Fielding</li>
        </ul>
        <p>
          These components are based on American Soccer Analysis goalkeeper Goals Added estimates.
          Each component is expressed in the same goal-equivalent value framework, allowing them to
          be combined without assigning subjective weights such as “40% shot-stopping” or “20%
          passing.”
        </p>
        <p>
          KeeperIQ then applies sample-size adjustment, uncertainty estimation, and percentile
          ranking to make the results easier to interpret.
        </p>
        <p>The platform includes three primary evaluation views.</p>

        <h3>2025 Final</h3>
        <p>
          A completed-season evaluation of goalkeeper performance during the 2025 MLS season. This
          view uses the full season and provides the most stable comparison of observed performance.
        </p>

        <h3>2026 Live</h3>
        <p>
          A continuously updated view of goalkeeper performance during the current 2026 MLS season.
          Because the season is still in progress, ratings are adjusted for sample size and
          accompanied by qualification labels and uncertainty estimates.
        </p>

        <h3>Current Talent</h3>
        <p>An estimate of each goalkeeper’s present underlying ability. This view combines:</p>
        <ul>
          <li>A league-average prior</li>
          <li>Reliability-adjusted 2025 performance</li>
          <li>Available 2026 evidence</li>
        </ul>
        <p>
          Current Talent is not the same as a season leaderboard. It is designed to answer how good
          a goalkeeper appears to be now, rather than simply who has accumulated the most value
          during one season.
        </p>
      </section>

      <section>
        <h2>How to use the platform</h2>

        <h3>
          <Link href="/leaderboard" className="text-[var(--accent)] no-underline hover:underline">
            Leaderboard
          </Link>
        </h3>
        <p>
          Compare MLS goalkeepers by KeeperIQ, adjusted Goals Added rate, component performance,
          traditional statistics, and sample reliability.
        </p>

        <h3>
          <Link href="/scouting" className="text-[var(--accent)] no-underline hover:underline">
            Scouting
          </Link>
        </h3>
        <p>
          Search for goalkeepers who match a desired performance profile across shot-stopping,
          distribution, claiming, sweeping, and other attributes.
        </p>
        <p>
          Use the <strong>Export</strong> control on the Scouting page to download decision-ready
          files from the active brief and shortlist: an <strong>Excel</strong> workbook (shortlist,
          full player profiles, comparison, methodology, and data status), a{" "}
          <strong>PowerPoint</strong> scouting brief for staff meetings, and a short{" "}
          <strong>Word</strong> recruitment memo.
        </p>

        <h3>
          <Link href="/compare" className="text-[var(--accent)] no-underline hover:underline">
            Compare
          </Link>
        </h3>
        <p>
          Evaluate multiple goalkeepers side by side using component scores, traditional metrics,
          uncertainty, and current-talent estimates.
        </p>
        <p>
          The Compare page has the same <strong>Export</strong> menu for Excel and PowerPoint when
          the selected keepers are available in the current season view. The leaderboard also offers
          a lighter <strong>Export Excel</strong> action for the filtered table.
        </p>

        <h3>
          <Link href="/archetypes" className="text-[var(--accent)] no-underline hover:underline">
            Archetypes
          </Link>
        </h3>
        <p>
          Explore goalkeeper impact profiles based on the areas in which players generate or lose
          value. These profiles describe how value is distributed across the six components. They
          should not automatically be interpreted as tactical playing styles unless supported by the
          available activity data.
        </p>

        <h3>Player Profiles</h3>
        <p>Review an individual goalkeeper’s:</p>
        <ul>
          <li>KeeperIQ score</li>
          <li>Observed and adjusted performance</li>
          <li>Component breakdown</li>
          <li>Ranking history</li>
          <li>Traditional statistics</li>
          <li>Sample reliability</li>
          <li>Uncertainty interval</li>
          <li>2025 and 2026 comparison</li>
          <li>Current-talent weighting</li>
        </ul>

        <h3>
          <Link
            href="/overview#season-coverage"
            className="text-[var(--accent)] no-underline hover:underline"
          >
            Season coverage
          </Link>
        </h3>
        <p>
          On Overview, review keepers, matches, minutes, qualification counts, and match cutoffs for
          each season behind the leaderboards.
        </p>
      </section>

      <section>
        <h2 id="leaderboard-columns">Leaderboard columns</h2>
        <p>
          The leaderboard glossary links here for terms that are mainly about reading the table
          rather than the full scoring model.
        </p>

        <h3 id="rank">Rk (rank)</h3>
        <p>
          Rank within the active view, ordered by KeeperIQ unless the user sorts another column.
          Rank 1 is best. On season boards, rank uses the reliability-adjusted complete-impact
          ordering among the displayed pool.
        </p>

        <h3 id="sort-direction">↑ / ↓ (sort direction)</h3>
        <p>
          Clicking a column header sorts the table by that metric. An upward arrow means ascending
          (low to high); a downward arrow means descending (high to low).
        </p>

        <h3 id="rank-change-vs-2025">vs ’25</h3>
        <p>
          Shown on the 2026 Live leaderboard only. It is the change in KeeperIQ rank versus the same
          goalkeeper’s rank on the 2025 Final leaderboard:
        </p>
        <pre className="formula">{`vs ’25 = Rank_2025_Final − Rank_2026_Live`}</pre>
        <p>
          A positive value (▲) means the keeper climbed to a better rank number. A negative value
          (▼) means the keeper dropped. <strong>NA</strong> means the keeper was not ranked in 2025
          Final.
        </p>

        <h3 id="minutes">Min (minutes)</h3>
        <p>
          Minutes played in the season behind that row. On 2025 Final and 2026 Live, this is that
          season’s minutes. On Current Talent, the table shows 2026 minutes when the keeper has
          played in 2026; otherwise it shows 2025 Final minutes so the component profile still has a
          workload context.
        </p>

        <h3 id="goals-allowed">GA/96</h3>
        <p>
          Goals allowed (conceded) per {method.minutes_basis} minutes:
        </p>
        <pre className="formula">
          {`GA/96 = Goals Conceded × ${method.minutes_basis} / Minutes`}
        </pre>
        <p>
          Lower is traditionally better, but goals allowed mix goalkeeper performance with the
          defensive environment. KeeperIQ is designed to provide a more complete alternative; see
          also{" "}
          <a href="#traditional-metrics" className="text-[var(--accent)]">
            Traditional metrics comparison
          </a>
          .
        </p>

        <h3 id="save-percentage">SV%</h3>
        <p>
          Save percentage among shots on target faced:
        </p>
        <pre className="formula">SV% = Saves / Shots Faced on Target × 100</pre>
        <p>
          SV% does not fully account for shot difficulty. Post-shot expected goals (PSxG) and
          shot-stopping Goals Added are the context-adjusted alternatives described under{" "}
          <a href="#shot-stopping" className="text-[var(--accent)]">
            Shot Stopping
          </a>
          .
        </p>
      </section>

      <section>
        <h2 id="methodology">Methodology</h2>

        <h3 id="per-96">Why per {method.minutes_basis} minutes?</h3>
        <p>
          Rates are expressed per {method.minutes_basis} minutes, following American Soccer
          Analysis’ published Goals Added convention.
        </p>
        <p>
          The figure is intended to approximate the average duration of an MLS match after accounting
          for stoppage time. Using the same convention as the underlying source also prevents
          unnecessary conversions and keeps KeeperIQ results comparable with published ASA values.
        </p>

        <h3 id="additive-goals-added">Additive Goals Added</h3>
        <p>
          American Soccer Analysis publishes goalkeeper Goals Added components in a common
          goal-equivalent unit relative to a positional baseline. KeeperIQ uses this additivity
          rather than creating arbitrary component weights.
        </p>
        <pre className="formula">
          Observed Total G+ = Shot Stopping + Handling + Claiming + Sweeping + Passing + Fielding
        </pre>
        <p>
          The source does not publish a separate goalkeeper Total field, so KeeperIQ calculates the
          total directly from the six components.
        </p>
        <p>
          Raw shot-stopping Goals Added is also cross-checked against the independent expected-goals
          feed using:
        </p>
        <pre className="formula">xG Faced − Goals Conceded</pre>
        <p>
          This is used as a validation check rather than as a replacement for the published
          shot-stopping component.
        </p>
      </section>

      <section>
        <h2 id="goalkeeper-components">Goalkeeper components</h2>
        <p>
          The six component totals come from American Soccer Analysis’ goalkeeper Goals Added
          model. KeeperIQ does not re-estimate those action values from event data. It ingests ASA’s
          published component totals and opportunity counts, then converts them into rates and
          reliability-adjusted estimates.
        </p>
        <p>
          Conceptually, ASA values most on-ball actions by how much they change expected possession
          value — the difference between the team’s chance of scoring and conceding before versus
          after the action:
        </p>
        <pre className="formula">
          {`Action G+ ≈ (P_score_after − P_concede_after) − (P_score_before − P_concede_before)`}
        </pre>
        <p>
          Here, <strong>P means probability</strong> (a number between 0 and 1):
        </p>
        <ul>
          <li>
            <code>P_score</code> — probability the team in possession scores from the current
            possession state
          </li>
          <li>
            <code>P_concede</code> — probability that same team concedes from the opposing
            possession that would follow
          </li>
          <li>
            <code>_before</code> / <code>_after</code> — those probabilities immediately before and
            after the goalkeeper’s action
          </li>
        </ul>
        <p>
          So <code>P_score − P_concede</code> is the net expected goal value of a possession state,
          and Action G+ is how much that net value improved (or worsened) because of the action.
        </p>
        <p>
          Goalkeeper components use that same goal-equivalent unit, with a few keeper-specific
          definitions published by ASA. KeeperIQ uses the{" "}
          <code>goals_added_above_avg</code> field, so a value of 0 means roughly an average MLS
          goalkeeper on that component.
        </p>

        <h3 id="shot-stopping">Shot Stopping</h3>
        <p>
          <strong>Source field:</strong> Shotstopping
        </p>
        <p>
          Value added by preventing or conceding goals relative to the difficulty of the shots
          faced, measured against an average goalkeeper.
        </p>
        <p>
          <strong>Opportunity denominator:</strong> Shots faced on target.
        </p>
        <p>
          ASA defines shot-stopping Goals Added from <strong>PSxG</strong> and goals conceded:
        </p>
        <pre className="formula">Shot Stopping G+ = PSxG Faced − Goals Conceded</pre>
        <p>
          <strong>PSxG</strong> means <strong>post-shot expected goals</strong>: the estimated
          probability that a shot on target becomes a goal{" "}
          <em>after</em> it has been struck, once the model knows where the shot is going (for
          example, toward the corner versus straight at the keeper).
        </p>
        <ul>
          <li>
            Ordinary <strong>xG</strong> (expected goals) is usually estimated before or at the
            moment of the shot, mainly from location and chance context.
          </li>
          <li>
            <strong>PSxG</strong> updates that estimate using post-shot information such as shot
            placement, so it better reflects how hard the shot was for the goalkeeper to stop.
          </li>
          <li>
            <strong>PSxG Faced</strong> is the sum of those post-shot probabilities across the
            shots on target the goalkeeper faced.
          </li>
        </ul>
        <p>
          So if a keeper faces shots totaling 10.0 PSxG and concedes 8 goals, Shot Stopping G+ is
          about +2.0: two goals prevented relative to post-shot chance quality. Positive values mean
          fewer goals than PSxG implied; negative values mean more. KeeperIQ also reconciles the
          raw shot-stopping total against the independent xGoals feed using the same difference as a
          validation check.
        </p>

        <h3 id="handling">Handling</h3>
        <p>
          <strong>Source field:</strong> Handling
        </p>
        <p>
          Value added by the quality of parries, catches, and rebound control after a shot is
          stopped.
        </p>
        <p>
          <strong>Opportunity denominator:</strong> Handling actions.
        </p>
        <p>
          ASA compares the typical rebound danger of a saved shot (<code>xRebound</code>) with the
          realized rebound danger after the goalkeeper’s parry or hold (<code>xParry</code>):
        </p>
        <pre className="formula">Handling G+ = xRebound − xParry</pre>
        <p>
          Holding the ball is rewarded with the full <code>xRebound</code> value that an average
          goalkeeper would typically give up on a similar shot. A soft parry into a dangerous area
          reduces that credit.
        </p>

        <h3 id="claiming">Claiming</h3>
        <p>
          <strong>Source field:</strong> Claiming
        </p>
        <p>
          Value added by claiming or punching crosses and set pieces inside the penalty area,
          including the cost of failed claims.
        </p>
        <p>
          <strong>Opportunity denominator:</strong> Claim attempts.
        </p>
        <p>
          ASA values claim attempts from the change in expected possession value around the cross
          or aerial contest:
        </p>
        <pre className="formula">
          {`Claiming G+ = PossessionValue_after − PossessionValue_before`}
        </pre>
        <p>
          A failed claim that drops the ball into a high-value shooting chance can cost a large
          amount of Goals Added. Successful claims, punches, and smothered loose balls are included
          here.
        </p>

        <h3 id="sweeping">Sweeping</h3>
        <p>
          <strong>Source field:</strong> Sweeping
        </p>
        <p>
          Value added by defensive actions taken outside the penalty area to break up play behind
          the defensive line.
        </p>
        <p>
          <strong>Opportunity denominator:</strong> Sweeping actions.
        </p>
        <p>
          ASA treats sweeping as the goalkeeper version of interrupting play — primarily successful
          and unsuccessful tackles and clearances with the feet outside the box. Value again comes
          from the change in expected possession value around those actions:
        </p>
        <pre className="formula">
          {`Sweeping G+ = PossessionValue_after − PossessionValue_before`}
        </pre>

        <h3 id="passing">Passing</h3>
        <p>
          <strong>Source field:</strong> Passing
        </p>
        <p>
          Value added by distribution relative to the expected outcome of the same pass attempted by
          an average goalkeeper.
        </p>
        <p>
          <strong>Opportunity denominator:</strong> Passes attempted.
        </p>
        <p>
          Goalkeeper passes, including goal kicks, are valued like field-player passes: the change
          in expected possession value from before the pass to after it, with completed passes
          sharing credit between passer and receiver:
        </p>
        <pre className="formula">
          {`Passing G+ = PossessionValue_after − PossessionValue_before`}
        </pre>
        <p>
          Completed value is split between the goalkeeper and the intended receiver according to
          ASA’s passer/receiver allocation. Failed or low-value long balls remain a known limitation
          of possession-value models without tracking data.
        </p>

        <h3 id="fielding">Fielding</h3>
        <p>
          <strong>Source field:</strong> Fielding
        </p>
        <p>
          Value added by controlling and securing loose balls, back-passes, and other non-shot
          receptions.
        </p>
        <p>
          <strong>Opportunity denominator:</strong> Fielding actions.
        </p>
        <p>
          ASA groups remaining keeper on-ball actions here — receiving, dribbling, fouls won or
          conceded, and rare shooting events — and values them with the same possession-value
          difference:
        </p>
        <pre className="formula">
          {`Fielding G+ = PossessionValue_after − PossessionValue_before`}
        </pre>
        <p>
          This bucket is often near zero or slightly negative because a small number of high-cost
          mistakes (for example, a foul that creates a dangerous free kick or penalty) can outweigh
          many routine secure receptions.
        </p>

        <h3 id="asa-to-keeperiq-rates">From ASA totals to KeeperIQ rates</h3>
        <p>
          In the formulas below, a <strong>component</strong> (written as{" "}
          <code>c</code>) means one of the six goalkeeper impact areas: Shot Stopping, Handling,
          Claiming, Sweeping, Passing, or Fielding. The same steps are applied separately to each
          component, then the six adjusted rates are added together.
        </p>
        <p>
          KeeperIQ starts from ASA’s season (or match) totals and opportunity counts for that
          component, then builds the rates shown on the site:
        </p>
        <pre className="formula">
          {`Observed G+/96_c = Component G+_c × 96 / Minutes

Observed value per opportunity_c = Component G+_c / Opportunities_c

Adjusted value per opportunity_c =
  LeagueMean_c + (n_c / (n_c + k_c)) × (Observed value per opportunity_c − LeagueMean_c)

Adjusted opportunities/96_c =
  LeagueWorkload_c + (Minutes / (Minutes + k_minutes_c))
  × (Observed opportunities/96_c − LeagueWorkload_c)

Adjusted G+/96_c =
  Adjusted value per opportunity_c × Adjusted opportunities/96_c`}
        </pre>
        <p>
          Example: if <code>c</code> is Passing, then <code>Component G+_c</code> is that
          goalkeeper’s ASA Passing Goals Added total, <code>Opportunities_c</code> is passes
          attempted, and <code>k_c</code> is the Passing shrinkage constant.
        </p>
        <p>
          <code>n_c</code> is the opportunity count for that component, and <code>k_c</code> is the
          component-specific shrinkage constant shown in the reliability table below. The six
          adjusted component rates are then summed into Adjusted Total G+/96.
        </p>
        <p>
          For ASA’s full goalkeeper Goals Added write-up, see{" "}
          <a
            href="https://www.americansocceranalysis.com/home/2021/6/20/valuing-goalkeepers-with-goals-added"
            className="text-[var(--accent)]"
            target="_blank"
            rel="noreferrer"
          >
            Valuing goalkeepers with goals added
          </a>
          .
        </p>
      </section>

      <section>
        <h2 id="observed-and-adjusted">Observed and adjusted performance</h2>
        <p>KeeperIQ displays both observed and reliability-adjusted performance.</p>

        <h3 id="observed-performance">Observed performance</h3>
        <p>
          Observed performance reflects what happened during the selected period without sample-size
          regression. It is useful for describing the goalkeeper’s actual season but can be unstable
          when the player has faced relatively few opportunities.
        </p>

        <h3 id="adjusted-performance">Reliability-adjusted performance</h3>
        <p>
          Goalkeeper outcomes are noisy. A small number of shots, passes, claims, or mistakes can
          have an unusually large effect on early-season ratings.
        </p>
        <p>
          For each component, KeeperIQ shrinks the observed per-opportunity value toward the
          season’s league mean:
        </p>
        <pre className="formula">
          {`Adjusted Rate = League Mean + (n / (n + k)) × (Observed Rate − League Mean)`}
        </pre>
        <p>Where:</p>
        <ul>
          <li>
            <code>n</code> is the goalkeeper’s number of opportunities.
          </li>
          <li>
            <code>k</code> is the component-specific shrinkage constant.
          </li>
          <li>
            <code>n / (n + k)</code> represents the estimated reliability of the observed rate.
          </li>
        </ul>
        <p>
          As the goalkeeper accumulates more relevant opportunities, the adjusted estimate moves
          closer to the observed performance.
        </p>
        <p>
          Workload, measured as opportunities per {method.minutes_basis} minutes, is adjusted
          separately using a minutes-based constant. This prevents a short appearance from producing
          an unrealistic projected volume of shots, claims, passes, or sweeping actions.
        </p>
      </section>

      <section>
        <h2 id="small-sample-noise">How KeeperIQ controls small-sample noise</h2>
        <p>
          Goalkeeper component values vary substantially across small samples. This table shows both
          the empirical repeatability of each raw component and how strongly KeeperIQ regresses a
          typical observation toward the league average. Low repeatability does not indicate that
          the adjustment failed; it indicates that the unadjusted number should receive less weight.
        </p>
        <p className="font-medium text-[var(--text)]">
          These diagnostics describe the stability of the raw component inputs, not the stability of
          the final KeeperIQ rating.
        </p>
        <p>
          Shrinkage constants (<code>k</code>) are estimated from match-level data covering{" "}
          {method.reliability_seasons[0]} through{" "}
          {method.reliability_seasons[method.reliability_seasons.length - 1]} when the data contains
          enough information to distinguish goalkeeper differences from sampling noise.
        </p>
        <p>Column meanings:</p>
        <ul>
          <li>
            <strong>k</strong> — the shrinkage constant used in{" "}
            <code>n / (n + k)</code>. Larger <code>k</code> means you need more opportunities before
            the observed rate is trusted. Think of it as “how many opportunities equal one full
            unit of trust.”
          </li>
          <li>
            <strong>Source</strong> — <em>Empirical</em> means <code>k</code> was estimated from
            historical MLS data. <em>Fallback</em> means the estimate was unstable, so KeeperIQ uses
            a conservative configured constant instead (heavy regression).
          </li>
          <li>
            <strong>Reliability at median</strong> — for a goalkeeper with a median opportunity
            sample, the weight on their observed rate:{" "}
            <code>n_median / (n_median + k)</code>. Near 1.0 means “mostly trust the observed
            number.” Near 0.0 means “mostly use the league average.”
          </li>
          <li>
            <strong>Split-half correlation</strong> — how consistently the same keepers look similar
            if you split their matches in half. Higher means the component is more repeatable;
            near 0 (or negative) means noisy / unstable season to season within a season.
          </li>
        </ul>
        <div className="table-wrap not-prose my-4">
          <table className="data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th className="num">k</th>
                <th>Source</th>
                <th className="num">Reliability at median</th>
                <th className="num">Split-half correlation</th>
              </tr>
            </thead>
            <tbody>
              {method.components.map((component) => (
                <tr key={component.key}>
                  <td>{component.label}</td>
                  <td className="num">{formatNumber(component.k, 1)}</td>
                  <td className="capitalize">{component.source}</td>
                  <td className="num">{formatNumber(component.reliability_at_median, 2)}</td>
                  <td className="num">{formatNumber(component.split_half_correlation, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>How to read the current results:</strong>
        </p>
        <ul>
          <li>
            <strong>Passing</strong> is the most trustworthy component at normal samples (high
            reliability, high split-half correlation) because keepers attempt many passes.
          </li>
          <li>
            <strong>Claiming</strong> and <strong>Handling</strong> are noisier at typical samples
            (lower reliability), so extreme early-season values are pulled harder toward average.
          </li>
          <li>
            <strong>Shot Stopping</strong> shows some signal, but substantial uncertainty remains
            even over a typical season (split-half correlation around 0.17 is limited, not strong).
          </li>
          <li>
            <strong>Sweeping</strong> and <strong>Fielding</strong> are marked Fallback. Their
            within-season repeatability is essentially zero, so KeeperIQ rejects fragile empirical{" "}
            <code>k</code> estimates and uses conservative configured constants. Any
            reliability-at-median weight for these components is a configuration choice for
            shrinkage — not evidence that the component is that fraction “reliable.”
          </li>
        </ul>
        <p>
          Bottom line: a lower reliability value means more regression toward the league mean; a
          higher one means the observed component can move the rating more freely. Fallback rows
          should be read as “we refuse to overclaim signal,” not as calibrated skill reliability.
        </p>
      </section>

      <section>
        <h2 id="adjusted-total">Calculating adjusted total value</h2>
        <p>For each component, KeeperIQ estimates:</p>
        <ul>
          <li>Reliability-adjusted value per opportunity</li>
          <li>
            Reliability-adjusted opportunity volume per {method.minutes_basis} minutes
          </li>
          <li>
            Reliability-adjusted component value per {method.minutes_basis} minutes
          </li>
        </ul>
        <p>The six adjusted component values are then added:</p>
        <pre className="formula">
          {`Adjusted Total G+/${method.minutes_basis} = Σ Adjusted Component G+/${method.minutes_basis}`}
        </pre>
        <p>
          This preserves the additive Goals Added framework while reducing the influence of extreme
          values created by limited samples.
        </p>
      </section>

      <section>
        <h2 id="keeperiq-score">KeeperIQ score</h2>
        <p>
          KeeperIQ is the percentile of a goalkeeper’s reliability-adjusted Total Goals Added per{" "}
          {method.minutes_basis} minutes within the qualified and provisional MLS comparison pool.
        </p>
        <p>
          It is calculated using minutes-weighted percentile ranking so that a small number of
          low-minute players do not disproportionately define the league distribution.
        </p>

        <h3>Interpreting the score</h3>
        <ul>
          <li>50 represents approximately the median MLS peer.</li>
          <li>A higher score represents stronger reliability-adjusted complete impact.</li>
          <li>A lower score represents weaker reliability-adjusted complete impact.</li>
        </ul>
        <p>KeeperIQ is a percentile score, not a physical performance unit.</p>
        <p>
          A goalkeeper with a KeeperIQ of 80 ranks above approximately 80% of the eligible comparison
          pool. It does not mean that the goalkeeper is 30% better than a player with a score of 50.
        </p>
        <p>
          Differences between 80 and 70 should not be interpreted as equivalent to differences
          between 60 and 50.
        </p>
        <p>
          The underlying adjusted Goals Added rate is always displayed alongside the KeeperIQ
          percentile.
        </p>
      </section>

      <section>
        <h2 id="current-talent">Current Talent</h2>
        <p>
          The Current Talent view estimates how good a goalkeeper appears to be at the present time.
          It combines three sources of information:
        </p>
        <ul>
          <li>A league-average prior</li>
          <li>Reliability-adjusted 2025 evidence</li>
          <li>Live 2026 evidence</li>
        </ul>
        <p>The estimate uses a normal-normal update:</p>
        <pre className="formula">
          {`Talent = (P_prior·μ + P_2025·y_2025 + P_2026·y_2026) / (P_prior + P_2025 + P_2026)`}
        </pre>
        <p>Where:</p>
        <ul>
          <li>
            <code>μ</code> is the league-average prior.
          </li>
          <li>
            <code>y_2025</code> is the 2025 performance estimate.
          </li>
          <li>
            <code>y_2026</code> is the available 2026 evidence.
          </li>
          <li>
            <code>P</code> represents the precision assigned to each source.
          </li>
        </ul>
        <p>
          The 2025 evidence is discounted using the estimated amount of year-over-year performance
          drift.
        </p>
        <p>
          A goalkeeper with little 2026 evidence remains relatively close to his 2025 estimate. As
          the 2026 sample grows, the estimate moves increasingly toward current-season performance.
        </p>
        <p>
          A goalkeeper entering MLS without a 2025 league record does not receive an artificial
          penalty. He begins from the league-average prior and moves away from it as MLS evidence
          accumulates.
        </p>
        <p>Every player profile displays the proportion of the estimate coming from:</p>
        <ul>
          <li>League prior</li>
          <li>2025 performance</li>
          <li>2026 performance</li>
        </ul>
        <p>
          Current Talent is an estimate of underlying ability, not a record of accumulated season
          value.
        </p>
      </section>

      <section>
        <h2 id="qualification">Qualification</h2>
        <p>
          KeeperIQ retains players with limited samples but distinguishes them using three labels:
        </p>
        <ul>
          <li>Qualified</li>
          <li>Provisional</li>
          <li>Limited Sample</li>
        </ul>
        <p>Reliability adjustment is applied regardless of status.</p>
        <p>
          Limited Sample players remain accessible on profiles and can be included using the
          leaderboard toggle, but they are hidden by default.
        </p>

        <h3>2025 qualification</h3>
        <p>Because the 2025 season is complete, fixed thresholds are used.</p>
        <ul>
          <li>
            <strong>Qualified:</strong> At least {formatNumber(q2025?.qualified_minutes, 0)} minutes
          </li>
          <li>
            <strong>Provisional:</strong> At least {formatNumber(q2025?.provisional_minutes, 0)}{" "}
            minutes
          </li>
          <li>
            <strong>Limited Sample:</strong> Fewer than{" "}
            {formatNumber(q2025?.provisional_minutes, 0)} minutes
          </li>
        </ul>
        <p>
          The {formatNumber(q2025?.qualified_minutes, 0)}-minute threshold represents approximately
          one quarter of a full MLS goalkeeper season.
        </p>

        <h3>2026 qualification</h3>
        <p>
          Because the 2026 season is still in progress, thresholds scale with the maximum
          goalkeeper minutes recorded in the league.
        </p>
        <p>
          The current maximum is {formatNumber(q2026?.max_goalkeeper_minutes, 0)} minutes.
        </p>
        <ul>
          <li>
            <strong>Qualified:</strong> At least 50% of the maximum, currently{" "}
            {formatNumber(q2026?.qualified_minutes, 0)} minutes
          </li>
          <li>
            <strong>Provisional:</strong> At least 20% of the maximum, currently{" "}
            {formatNumber(q2026?.provisional_minutes, 1)} minutes
          </li>
          <li>
            <strong>Limited Sample:</strong> Below the provisional threshold
          </li>
        </ul>
        <p>Absolute floors are also applied:</p>
        <ul>
          <li>
            <strong>Qualified floor:</strong> 270 minutes
          </li>
          <li>
            <strong>Provisional floor:</strong> 90 minutes
          </li>
        </ul>
        <p>The live thresholds rise as the season progresses.</p>
      </section>

      <section>
        <h2>Uncertainty</h2>
        <p>
          A single rating cannot fully communicate the uncertainty surrounding goalkeeper
          performance.
        </p>
        <p>
          When match-level data is available, KeeperIQ estimates uncertainty in adjusted Total Goals
          Added per {method.minutes_basis} through a nonparametric match-level bootstrap.
        </p>
        <p>The process uses:</p>
        <ul>
          <li>{String(bootstrap.resamples ?? 2000)} resamples</li>
          <li>
            {Math.round(Number(bootstrap.interval ?? 0.9) * 100)}% uncertainty interval
          </li>
          <li>Full reapplication of the reliability-adjustment process within each resample</li>
        </ul>
        <p>
          Current Talent intervals use the analytic posterior standard deviation from the
          normal-normal model.
        </p>
        <p>
          KeeperIQ does not generate artificial intervals when the required data is unavailable.
          Missing intervals remain blank rather than displaying unsupported precision.
        </p>
        <p>Displayed values are also rounded appropriately:</p>
        <ul>
          <li>KeeperIQ: Whole number or one decimal</li>
          <li>Total Goals Added rates (Adj / Obs G+/96): Two decimals</li>
          <li>Component Goals Added rates: Three decimals (so small non-shot contributions are not rounded away)</li>
          <li>Percentages: One decimal when appropriate</li>
        </ul>
      </section>

      <section>
        <h2 id="traditional-metrics">Traditional metrics comparison</h2>
        <p>
          KeeperIQ does not claim that goals allowed, clean sheets, or save percentage are useless.
          These statistics describe meaningful outcomes. However, they do not independently isolate
          goalkeeper contribution.
        </p>
        <p>The platform therefore compares:</p>
        <ul>
          <li>Goals allowed rank against KeeperIQ rank</li>
          <li>
            Goals allowed per {method.minutes_basis} against adjusted Total G+ per{" "}
            {method.minutes_basis}
          </li>
          <li>Save percentage against adjusted shot-stopping</li>
          <li>Expected goals faced minus goals conceded against shot-stopping G+</li>
          <li>Team defensive environment against goalkeeper evaluation</li>
        </ul>
        <p>
          The leaderboard also identifies players with the largest differences between
          traditional-statistic rankings and KeeperIQ rankings.
        </p>
        <p>
          A disagreement does not automatically prove that one metric is correct and the other is
          wrong. It identifies cases where the context-adjusted model reaches a meaningfully
          different conclusion from the traditional result.
        </p>
      </section>

      <section>
        <h2>Limitations</h2>

        <h3>Team tactical context</h3>
        <p>
          A team’s defensive line, pressing intensity, possession strategy, and build-up
          instructions affect the opportunities available to its goalkeeper. A goalkeeper cannot
          attempt a sweep, claim, or pass that the team’s structure never requires.
        </p>

        <h3>Defensive environment</h3>
        <p>
          Shot difficulty is partly controlled by the underlying ASA models, but the volume and type
          of chances still reflect the team’s defensive performance. No public model can perfectly
          separate the goalkeeper from the defenders and tactical system around him.
        </p>

        <h3>Teammate effects on distribution</h3>
        <p>
          Passing Goals Added credits the goalkeeper for pass outcomes that also depend on receiver
          positioning, aerial ability, pressure resistance, team spacing, and tactical instructions.
          Passing value should therefore be interpreted as goalkeeper contribution within a team
          environment, not as a completely isolated technical grade.
        </p>

        <h3>Claiming and sweeping opportunities</h3>
        <p>
          Some teams invite more crosses, through balls, and space behind the defensive line than
          others. A low claiming or sweeping total can reflect limited opportunity rather than
          passivity or poor ability.
        </p>

        <h3>Goalkeeper volatility</h3>
        <p>
          Goalkeeper performance remains highly variable, even after reliability adjustment. A small
          number of exceptional saves, difficult shots, failed claims, or distribution errors can
          materially affect a season.
        </p>

        <h3>Small samples</h3>
        <p>
          Limited Sample ratings are heavily regressed toward the league mean. They should not be
          interpreted as precise measurements of underlying talent.
        </p>

        <h3>Source-model limitations</h3>
        <p>
          Goals Added is itself a model-based estimate. KeeperIQ is an independent evaluation layer
          built on top of those estimates, not an objective or complete description of goalkeeper
          quality.
        </p>

        <h3>Performance versus talent</h3>
        <p>
          A season-performance rating and a Current Talent estimate answer different questions. A
          goalkeeper can perform exceptionally over a limited period without the model concluding
          that his underlying ability has permanently changed by the same amount.
        </p>

        <h3>Players entering MLS</h3>
        <p>
          Goalkeepers arriving from other leagues may have substantial professional experience that
          is not represented in the MLS dataset. Without a prior MLS season, the Current Talent
          model begins from the league-average prior until local evidence accumulates. This should
          not be interpreted as a claim that the player was average before entering MLS.
        </p>
      </section>

      <section>
        <h2>Data attribution</h2>
        <p>
          Goalkeeper Goals Added components and shot-stopping data are provided by{" "}
          <a href={method.source.attribution_url} className="text-[var(--accent)]">
            American Soccer Analysis
          </a>
          .
        </p>
        <p>
          MLS KeeperIQ is an independent project and is not affiliated with or endorsed by American
          Soccer Analysis, Major League Soccer, or any MLS club.
        </p>
        <p>KeeperIQ adds:</p>
        <ul>
          <li>Reliability adjustment</li>
          <li>Qualification logic</li>
          <li>Uncertainty estimates</li>
          <li>Percentile scoring</li>
          <li>Current-talent modeling</li>
          <li>Historical ranking snapshots</li>
          <li>Comparison and scouting tools</li>
          <li>Interactive presentation of the public data</li>
        </ul>
        <p>
          All ratings should be interpreted as model estimates rather than definitive judgments of
          player quality.
        </p>
      </section>
    </div>
  );
}
