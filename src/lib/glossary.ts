/** Shared glossary definitions for leaderboard and related views. */

export interface GlossaryEntry {
  term: string;
  definition: string;
  /** In-page anchor on About & Methodology (`/`). */
  href: string;
}

export const LEADERBOARD_GLOSSARY: GlossaryEntry[] = [
  {
    term: "Rk",
    href: "/#rank",
    definition:
      "Rank within the current view, ordered by KeeperIQ (best = 1). Click column headers to change the sort.",
  },
  {
    term: "↑ / ↓",
    href: "/#sort-direction",
    definition:
      "Sort direction on the active column. ↑ means ascending (low to high); ↓ means descending (high to low).",
  },
  {
    term: "vs ’25",
    href: "/#rank-change-vs-2025",
    definition:
      "On the 2026 Live board only: change in KeeperIQ rank versus the 2025 Final leaderboard. ▲ means climbed (better rank); ▼ means dropped. NA means the goalkeeper was not ranked in 2025 Final.",
  },
  {
    term: "Min",
    href: "/#minutes",
    definition:
      "Minutes played in the season behind that row. On Current Talent, this is 2026 minutes when available, otherwise 2025 Final minutes.",
  },
  {
    term: "KeeperIQ",
    href: "/#keeperiq-score",
    definition:
      "Percentile of reliability-adjusted complete goalkeeper impact among MLS peers. 50 ≈ league median. Higher is better. On Current Talent, this is the talent-estimate percentile, not a single-season observed score.",
  },
  {
    term: "Adj G+/96",
    href: "/#adjusted-performance",
    definition:
      "Reliability-adjusted total Goals Added per 96 minutes — the continuous rate behind KeeperIQ. On Current Talent, this is the Bayesian talent estimate (talent G+/96).",
  },
  {
    term: "Obs G+/96",
    href: "/#observed-performance",
    definition:
      "Observed total Goals Added per 96 minutes before sample-size shrinkage. Useful for what actually happened; noisier in small samples.",
  },
  {
    term: "Shot",
    href: "/#shot-stopping",
    definition:
      "Adjusted shot-stopping Goals Added per 96. Value from preventing or conceding goals relative to post-shot chance quality (PSxG).",
  },
  {
    term: "Handling",
    href: "/#handling",
    definition:
      "Adjusted handling Goals Added per 96. Value from catches, parries, and rebound control after a shot is stopped.",
  },
  {
    term: "Claiming",
    href: "/#claiming",
    definition:
      "Adjusted claiming Goals Added per 96. Value from claiming or punching crosses and set pieces, including the cost of failed claims.",
  },
  {
    term: "Sweeping",
    href: "/#sweeping",
    definition:
      "Adjusted sweeping Goals Added per 96. Value from defensive actions outside the penalty area that interrupt play behind the defensive line.",
  },
  {
    term: "Passing",
    href: "/#passing",
    definition:
      "Adjusted passing Goals Added per 96. Value from goalkeeper distribution relative to an average goalkeeper on similar passes.",
  },
  {
    term: "Fielding",
    href: "/#fielding",
    definition:
      "Adjusted fielding Goals Added per 96. Value from controlling loose balls, back-passes, and other non-shot receptions.",
  },
  {
    term: "GA/96",
    href: "/#goals-allowed",
    definition:
      "Goals allowed (conceded) per 96 minutes. A traditional outcome rate — lower is usually better, but it does not isolate goalkeeper skill from defensive context.",
  },
  {
    term: "SV%",
    href: "/#save-percentage",
    definition:
      "Save percentage: saves divided by shots on target faced, as a percent. Traditional metric; does not fully account for shot difficulty.",
  },
  {
    term: "Sample",
    href: "/#qualification",
    definition:
      "Qualification label for how much playing time supports the rating: Qualified (enough minutes for a stable read), Provisional (moderate sample), or Limited Sample (small sample; heavily regressed and hidden by default).",
  },
];
