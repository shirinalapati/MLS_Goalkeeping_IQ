/** Compact leaderboard Excel export for analyst review. */

import type { SeasonPlayer } from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

import {
  buildExportMeta,
  downloadBlob,
  loadDataStatus,
  stampFilename,
} from "@/lib/exports/meta";

export async function exportLeaderboardWorkbook(args: {
  players: SeasonPlayer[];
  view: string;
}): Promise<void> {
  const ExcelJS = await import("exceljs");
  const status = await loadDataStatus();
  const meta = buildExportMeta(status, args.view === "talent" ? "2026" : args.view);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MLS KeeperIQ";
  const sheet = workbook.addWorksheet("Leaderboard");

  const headers = [
    "Rank",
    "Player",
    "Club",
    "Minutes",
    "KeeperIQ",
    "Adj G+/96",
    "Obs G+/96",
    "Sample Influence",
    ...COMPONENT_ORDER.map((key) => `${COMPONENT_LABELS[key]} Adj/96`),
    "GA/96",
    "Save %",
    "Sample",
    "Archetype",
  ];
  sheet.addRow(headers);
  const header = sheet.getRow(1);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F6F66" },
    };
  });

  args.players.forEach((p, index) => {
    sheet.addRow([
      p.rank ?? index + 1,
      p.name,
      p.team_abbreviation ?? p.team ?? "",
      p.minutes,
      p.keeperiq,
      p.adjusted_total_p96,
      p.observed_total_p96,
      p.reliability,
      ...COMPONENT_ORDER.map((key) => p.components[key]?.adjusted_p96 ?? null),
      p.goals_conceded_p96,
      p.save_pct,
      p.sample_status_label,
      p.archetype ?? "",
    ]);
  });

  const lastRow = Math.max(args.players.length + 1, 2);
  for (let r = 2; r <= lastRow; r += 1) {
    sheet.getCell(r, 5).numFmt = "0.0";
    sheet.getCell(r, 6).numFmt = "0.00";
    sheet.getCell(r, 7).numFmt = "0.00";
    sheet.getCell(r, 8).numFmt = "0%";
    for (let c = 9; c < 9 + COMPONENT_ORDER.length; c += 1) {
      sheet.getCell(r, c).numFmt = "0.000";
    }
  }

  for (let c = 9; c < 9 + COMPONENT_ORDER.length; c += 1) {
    const letter = sheet.getColumn(c).letter;
    sheet.addConditionalFormatting({
      ref: `${letter}2:${letter}${lastRow}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [
            { type: "min" },
            { type: "percentile", value: 50 },
            { type: "max" },
          ],
          color: [{ argb: "FFF07178" }, { argb: "FFF5F5F5" }, { argb: "FF3DD6C6" }],
        },
      ],
    });
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getColumn(2).width = 22;

  const metaSheet = workbook.addWorksheet("Data Status");
  metaSheet.addRow(["Field", "Value"]);
  [
    ["View", args.view],
    ["Source", meta.source],
  ].forEach((row) => metaSheet.addRow(row));
  metaSheet.getColumn(1).width = 28;
  metaSheet.getColumn(2).width = 40;

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    stampFilename(`keeperiq-leaderboard-${args.view}`, "xlsx"),
  );
}
