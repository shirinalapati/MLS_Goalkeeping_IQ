/** Compare-page Excel: selected keepers as columns with best values highlighted. */

import type { SeasonPlayer } from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

import { downloadBlob, stampFilename } from "@/lib/exports/meta";

export async function exportCompareWorkbook(args: {
  players: SeasonPlayer[];
  view: string;
}): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MLS KeeperIQ";
  const sheet = workbook.addWorksheet("Comparison");

  if (!args.players.length) {
    sheet.addRow(["No players selected for comparison."]);
  } else {
    const metrics: Array<{
      label: string;
      get: (p: SeasonPlayer) => number | string | null;
      higherBetter: boolean | null;
      numFmt?: string;
    }> = [
      { label: "Club", get: (p) => p.team_abbreviation ?? p.team, higherBetter: null },
      { label: "Age", get: (p) => p.age, higherBetter: null },
      { label: "Sample status", get: (p) => p.sample_status_label, higherBetter: null },
      { label: "Archetype", get: (p) => p.archetype, higherBetter: null },
      { label: "KeeperIQ", get: (p) => p.keeperiq, higherBetter: true, numFmt: "0.0" },
      { label: "Adj G+/96", get: (p) => p.adjusted_total_p96, higherBetter: true, numFmt: "0.00" },
      { label: "Obs G+/96", get: (p) => p.observed_total_p96, higherBetter: true, numFmt: "0.00" },
      { label: "Sample Influence", get: (p) => p.reliability, higherBetter: true, numFmt: "0%" },
      { label: "Minutes", get: (p) => p.minutes, higherBetter: true, numFmt: "#,##0" },
      { label: "GA/96", get: (p) => p.goals_conceded_p96, higherBetter: false, numFmt: "0.00" },
      { label: "Save %", get: (p) => p.save_pct, higherBetter: true, numFmt: "0.0" },
      ...COMPONENT_ORDER.map((key) => ({
        label: `${COMPONENT_LABELS[key]} Adj/96`,
        get: (p: SeasonPlayer) => p.components[key]?.adjusted_p96 ?? null,
        higherBetter: true as boolean | null,
        numFmt: "0.000",
      })),
    ];

    sheet.addRow(["Metric", ...args.players.map((p) => p.name)]);
    const header = sheet.getRow(1);
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F6F66" },
      };
    });

    metrics.forEach((metric) => {
      const values = args.players.map((p) => metric.get(p));
      const numeric = values.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
      let best: number | null = null;
      if (metric.higherBetter !== null && numeric.length) {
        best = metric.higherBetter ? Math.max(...numeric) : Math.min(...numeric);
      }
      const row = sheet.addRow([metric.label, ...values]);
      values.forEach((value, index) => {
        const cell = row.getCell(index + 2);
        if (metric.numFmt && typeof value === "number") cell.numFmt = metric.numFmt;
        if (best !== null && typeof value === "number" && value === best) {
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
    args.players.forEach((_, i) => {
      sheet.getColumn(i + 2).width = 18;
    });
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    stampFilename(`keeperiq-compare-${args.view}`, "xlsx"),
  );
}
