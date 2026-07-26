/** Multi-sheet Excel scouting workbook for analyst workflows. */

import type { ScoutingBrief, ScoutingMatch } from "@/lib/scouting-utils";
import type { DataStatus, SeasonPlayer, TalentPlayer } from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

import {
  buildExportMeta,
  downloadBlob,
  loadDataStatus,
  loadTalent,
  stampFilename,
  type ExportMeta,
} from "@/lib/exports/meta";

function pct(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value;
}

function briefSummary(brief: ScoutingBrief): string {
  const parts = [
    `Season ${brief.season}`,
    `Min shot-stopping ≥ ${brief.minShotStoppingPercentile}`,
    `Min sweeping ≥ ${brief.minSweepingPercentile}`,
    `Min passing ≥ ${brief.minPassingPercentile}`,
    `Minutes ≥ ${brief.minMinutes}`,
    `Sample influence ≥ ${brief.minReliability}`,
  ];
  if (brief.minAge !== null) parts.push(`Age ≥ ${brief.minAge}`);
  if (brief.maxAge !== null) parts.push(`Age ≤ ${brief.maxAge}`);
  if (brief.preferredArchetype) parts.push(`Archetype: ${brief.preferredArchetype}`);
  if (brief.similaritySlug) parts.push(`Similar to: ${brief.similaritySlug}`);
  if (brief.query.trim()) parts.push(`Search: ${brief.query.trim()}`);
  parts.push(brief.includeLimited ? "Includes limited sample" : "Limited sample excluded");
  return parts.join("; ");
}

type Workbook = import("exceljs").Workbook;
type Worksheet = import("exceljs").Worksheet;
type Row = import("exceljs").Row;

function styleHeader(row: Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F6F66" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

function addAutoFilterAndFreeze(sheet: Worksheet, headerRow: number, colCount: number) {
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  sheet.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow, column: colCount },
  };
}

function addShortlistSheet(
  workbook: Workbook,
  matches: ScoutingMatch[],
  meta: ExportMeta,
): void {
  const sheet = workbook.addWorksheet("Shortlist", {
    properties: { defaultColWidth: 14 },
  });
  const headers = [
    "Rank",
    "Player",
    "Club",
    "Age",
    "KeeperIQ",
    "Adjusted G+/96",
    "Sample Influence",
    "Minutes",
    "Shot-stopping %ile",
    "Handling %ile",
    "Claiming %ile",
    "Sweeping %ile",
    "Passing %ile",
    "Fielding %ile",
    "Archetype",
    "Fit score",
    "Why the player matches",
    "Analyst notes",
  ];
  sheet.addRow(headers);
  styleHeader(sheet.getRow(1));

  matches.forEach((match, index) => {
    const p = match.player;
    sheet.addRow([
      index + 1,
      p.name,
      p.team ?? p.team_abbreviation ?? "",
      p.age,
      p.keeperiq,
      p.adjusted_total_p96,
      p.reliability,
      p.minutes,
      pct(p.components.shot_stopping?.percentile),
      pct(p.components.handling?.percentile),
      pct(p.components.claiming?.percentile),
      pct(p.components.sweeping?.percentile),
      pct(p.components.passing?.percentile),
      pct(p.components.fielding?.percentile),
      p.archetype ?? "",
      match.score,
      match.reasons.map((r) => `${r.label}: ${r.detail}`).join(" | "),
      "",
    ]);
  });

  const lastRow = Math.max(matches.length + 1, 2);
  const lastCol = headers.length;

  for (let r = 2; r <= lastRow; r += 1) {
    sheet.getCell(r, 5).numFmt = "0.0";
    sheet.getCell(r, 6).numFmt = "0.00";
    sheet.getCell(r, 7).numFmt = "0%";
    sheet.getCell(r, 8).numFmt = "#,##0";
    for (let c = 9; c <= 14; c += 1) sheet.getCell(r, c).numFmt = "0.0";
    sheet.getCell(r, 16).numFmt = "0.0";
  }

  for (const col of [9, 10, 11, 12, 13, 14]) {
    sheet.addConditionalFormatting({
      ref: `${sheet.getColumn(col).letter}2:${sheet.getColumn(col).letter}${lastRow}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [
            { type: "num", value: 0 },
            { type: "num", value: 50 },
            { type: "num", value: 100 },
          ],
          color: [{ argb: "FFF07178" }, { argb: "FFF5F5F5" }, { argb: "FF3DD6C6" }],
        },
      ],
    });
  }

  sheet.getColumn(2).width = 22;
  sheet.getColumn(3).width = 22;
  sheet.getColumn(15).width = 24;
  sheet.getColumn(17).width = 48;
  sheet.getColumn(18).width = 28;

  addAutoFilterAndFreeze(sheet, 1, lastCol);
  sheet.getCell("T1").value =
    "Filters are on. Analyst notes is left blank for staff markup after download.";
  sheet.getColumn(20).width = 40;
}

function addProfilesSheet(
  workbook: Workbook,
  players: SeasonPlayer[],
  talentById: Map<string, TalentPlayer>,
): void {
  const sheet = workbook.addWorksheet("Player Profiles", {
    properties: { defaultColWidth: 12 },
  });
  const headers = [
    "Player",
    "Club",
    "Age",
    "Nationality",
    "Season",
    "Sample status",
    "Archetype",
    "Minutes",
    "Appearances",
    "KeeperIQ",
    "KeeperIQ low",
    "KeeperIQ high",
    "Adj G+/96",
    "Obs G+/96",
    "Sample Influence",
    "Interval low",
    "Interval high",
    "GA",
    "GA/96",
    "Save %",
    "Shots faced",
    "Saves",
    "Goals prevented",
    "Goals prevented/96",
    "PSxG faced",
    ...COMPONENT_ORDER.flatMap((key) => [
      `${COMPONENT_LABELS[key]} Adj/96`,
      `${COMPONENT_LABELS[key]} %ile`,
    ]),
    "Talent KeeperIQ",
    "Talent G+/96",
    "Talent weight prior",
    "Talent weight 2025",
    "Talent weight 2026",
  ];
  sheet.addRow(headers);
  styleHeader(sheet.getRow(1));

  for (const p of players) {
    const talent = talentById.get(p.player_id);
    sheet.addRow([
      p.name,
      p.team ?? "",
      p.age,
      p.nationality ?? "",
      p.season,
      p.sample_status_label,
      p.archetype ?? "",
      p.minutes,
      p.appearances,
      p.keeperiq,
      p.keeperiq_low ?? null,
      p.keeperiq_high ?? null,
      p.adjusted_total_p96,
      p.observed_total_p96,
      p.reliability,
      p.interval_low,
      p.interval_high,
      p.goals_conceded,
      p.goals_conceded_p96,
      p.save_pct,
      p.shots_faced,
      p.saves,
      p.goals_prevented,
      p.goals_prevented_p96,
      p.xgoals_faced,
      ...COMPONENT_ORDER.flatMap((key) => [
        p.components[key]?.adjusted_p96 ?? null,
        p.components[key]?.percentile ?? null,
      ]),
      talent?.keeperiq ?? null,
      talent?.talent_p96 ?? null,
      talent?.weights.league_prior ?? null,
      talent?.weights.prior_season ?? null,
      talent?.weights.live_season ?? null,
    ]);
  }

  addAutoFilterAndFreeze(sheet, 1, headers.length);
}

function addComparisonSheet(workbook: Workbook, matches: ScoutingMatch[]): void {
  const sheet = workbook.addWorksheet("Comparison");
  const selected = matches.slice(0, 4);
  if (!selected.length) {
    sheet.addRow(["No shortlisted keepers to compare."]);
    return;
  }

  const metrics: Array<{
    label: string;
    get: (p: SeasonPlayer) => number | string | null;
    higherBetter: boolean | null;
  }> = [
    { label: "KeeperIQ", get: (p) => p.keeperiq, higherBetter: true },
    { label: "Adj G+/96", get: (p) => p.adjusted_total_p96, higherBetter: true },
    { label: "Obs G+/96", get: (p) => p.observed_total_p96, higherBetter: true },
    { label: "Sample Influence", get: (p) => p.reliability, higherBetter: true },
    { label: "Minutes", get: (p) => p.minutes, higherBetter: true },
    { label: "Age", get: (p) => p.age, higherBetter: null },
    { label: "GA/96", get: (p) => p.goals_conceded_p96, higherBetter: false },
    { label: "Save %", get: (p) => p.save_pct, higherBetter: true },
    ...COMPONENT_ORDER.map((key) => ({
      label: `${COMPONENT_LABELS[key]} Adj/96`,
      get: (p: SeasonPlayer) => p.components[key]?.adjusted_p96 ?? null,
      higherBetter: true as boolean | null,
    })),
  ];

  sheet.addRow(["Metric", ...selected.map((m) => m.player.name)]);
  styleHeader(sheet.getRow(1));

  metrics.forEach((metric) => {
    const values = selected.map((m) => metric.get(m.player));
    const numeric = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
    let best: number | null = null;
    if (metric.higherBetter !== null && numeric.length) {
      best = metric.higherBetter ? Math.max(...numeric) : Math.min(...numeric);
    }
    const row = sheet.addRow([metric.label, ...values]);
    values.forEach((value, colIdx) => {
      if (best !== null && typeof value === "number" && value === best) {
        const cell = row.getCell(colIdx + 2);
        cell.font = { bold: true, color: { argb: "FF0B5F4F" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFB8F0E6" },
        };
      }
    });
  });

  sheet.getColumn(1).width = 24;
  selected.forEach((_, i) => {
    sheet.getColumn(i + 2).width = 18;
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addMethodologySheet(workbook: Workbook): void {
  const sheet = workbook.addWorksheet("Methodology");
  sheet.addRow(["Term", "Definition"]);
  styleHeader(sheet.getRow(1));
  const rows: Array<[string, string]> = [
    [
      "KeeperIQ",
      "Percentile of reliability-adjusted complete goalkeeper impact among MLS peers. 50 ≈ league median. Higher is better.",
    ],
    [
      "Adjusted G+/96",
      "Reliability-adjusted total Goals Added per 96 minutes — the continuous rate behind KeeperIQ.",
    ],
    [
      "Sample Influence",
      "How much observed performance affects the adjusted rating rather than being pulled toward the MLS average.",
    ],
    [
      "Current Talent",
      "Bayesian blend of a league prior, prior-season evidence, and live-season evidence — an estimate of underlying ability, not a single-season observed score.",
    ],
    ["Qualified", "Enough minutes for a stable read under the season’s qualification rule."],
    ["Provisional", "Moderate sample; usable with caution."],
    [
      "Limited Sample",
      "Small sample; heavily regressed and hidden by default on leaderboards.",
    ],
    ...COMPONENT_ORDER.map(
      (key) =>
        [
          COMPONENT_LABELS[key],
          `Component Goals Added contribution for ${COMPONENT_LABELS[key].toLowerCase()}, evaluated in a common goal-equivalent unit.`,
        ] as [string, string],
    ),
  ];
  rows.forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).width = 22;
  sheet.getColumn(2).width = 88;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addDataStatusSheet(
  workbook: Workbook,
  status: DataStatus,
  meta: ExportMeta,
  brief: ScoutingBrief,
): void {
  const sheet = workbook.addWorksheet("Data Status");
  sheet.addRow(["Field", "Value"]);
  styleHeader(sheet.getRow(1));
  const lines: Array<[string, string]> = [
    ["Source", meta.source],
    ["Scouting season", brief.season],
    ["Recruitment brief", briefSummary(brief)],
    ["Displayed data", status.data_is_current ? "Current" : "Fallback"],
  ];
  for (const [season, detail] of Object.entries(status.seasons)) {
    lines.push(
      [`${season} goalkeepers`, String(detail.goalkeepers)],
      [`${season} matches covered`, String(detail.matches_covered)],
      [`${season} total minutes`, String(detail.total_minutes)],
      [`${season} qualified`, String(detail.sample_counts.qualified)],
      [`${season} provisional`, String(detail.sample_counts.provisional)],
      [`${season} limited`, String(detail.sample_counts.limited)],
      [`${season} max match date`, detail.max_match_date ?? "—"],
    );
  }
  lines.forEach((row) => sheet.addRow(row));
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 72;
}

function addDashboardSheet(workbook: Workbook, matches: ScoutingMatch[]): void {
  const sheet = workbook.addWorksheet("Dashboard");
  sheet.addRow(["MLS KeeperIQ — Scouting Dashboard"]);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF1F6F66" } };
  sheet.addRow(["Use the Shortlist Fit score column to build charts in Excel if needed."]);
  sheet.addRow([]);
  sheet.addRow(["Top shortlist by fit score"]);
  sheet.addRow(["Player", "Fit score", "KeeperIQ", "Adj G+/96", "Sample Influence"]);
  styleHeader(sheet.getRow(5));

  const top = matches.slice(0, 10);
  top.forEach((match) => {
    sheet.addRow([
      match.player.name,
      match.score,
      match.player.keeperiq,
      match.player.adjusted_total_p96,
      match.player.reliability,
    ]);
  });

  // Summary counts for a lightweight “dashboard”
  sheet.addRow([]);
  sheet.addRow(["Shortlist size", matches.length]);
  sheet.addRow([
    "Median KeeperIQ (shortlist)",
    top.length
      ? top.map((m) => m.player.keeperiq ?? 0).sort((a, b) => a - b)[Math.floor(top.length / 2)]
      : null,
  ]);
  sheet.getColumn(1).width = 28;
  for (let c = 2; c <= 5; c += 1) sheet.getColumn(c).width = 14;
}

export async function exportScoutingWorkbook(args: {
  brief: ScoutingBrief;
  matches: ScoutingMatch[];
  seasonPlayers: SeasonPlayer[];
}): Promise<void> {
  const ExcelJS = await import("exceljs");
  const status = await loadDataStatus();
  const talent = await loadTalent();
  const meta = buildExportMeta(status, args.brief.season);
  const talentById = new Map(talent.map((row) => [row.player_id, row]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MLS KeeperIQ";
  workbook.created = new Date();
  workbook.description = "MLS KeeperIQ scouting workbook";

  addShortlistSheet(workbook, args.matches, meta);
  addProfilesSheet(workbook, args.seasonPlayers, talentById);
  addComparisonSheet(workbook, args.matches);
  addMethodologySheet(workbook);
  addDataStatusSheet(workbook, status, meta, args.brief);
  addDashboardSheet(workbook, args.matches);

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    stampFilename(`keeperiq-scouting-${args.brief.season}`, "xlsx"),
  );
}
