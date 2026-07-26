/** PowerPoint scouting brief for sporting-staff presentations. */

import type { ScoutingBrief, ScoutingMatch } from "@/lib/scouting-utils";
import type { SeasonPlayer } from "@/lib/types";
import { COMPONENT_LABELS, COMPONENT_ORDER } from "@/lib/types";

import {
  buildExportMeta,
  downloadBlob,
  loadDataStatus,
  stampFilename,
} from "@/lib/exports/meta";

function briefLines(brief: ScoutingBrief): string[] {
  return [
    `Season: ${brief.season}`,
    `Min shot-stopping percentile: ${brief.minShotStoppingPercentile}`,
    `Min sweeping percentile: ${brief.minSweepingPercentile}`,
    `Min passing percentile: ${brief.minPassingPercentile}`,
    `Minutes ≥ ${brief.minMinutes}`,
    `Sample Influence ≥ ${brief.minReliability}`,
    brief.minAge !== null || brief.maxAge !== null
      ? `Age: ${brief.minAge ?? "any"}–${brief.maxAge ?? "any"}`
      : "Age: any",
    `Archetype: ${brief.preferredArchetype ?? "any"}`,
    `Similarity: ${brief.similaritySlug ?? "none"}`,
    brief.includeLimited ? "Includes limited-sample keepers" : "Limited sample excluded",
  ];
}

function cell(text: string, opts?: { bold?: boolean; color?: string }) {
  return { text, options: { bold: opts?.bold, color: opts?.color } };
}

export async function exportScoutingPptx(args: {
  brief: ScoutingBrief;
  matches: ScoutingMatch[];
}): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const status = await loadDataStatus();
  const meta = buildExportMeta(status, args.brief.season);
  const pptx = new PptxGenJS();
  pptx.author = "MLS KeeperIQ";
  pptx.title = "MLS Goalkeeper Scouting Brief";
  pptx.subject = "MLS KeeperIQ scouting brief";

  const top = args.matches.slice(0, 5);
  const accent = "1F6F66";
  const ink = "0B0D10";
  const muted = "5C6678";

  {
    const slide = pptx.addSlide();
    slide.addText("MLS Goalkeeper Scouting Brief", {
      x: 0.6,
      y: 2.0,
      w: 8.8,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: ink,
    });
    slide.addText(
      new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      { x: 0.6, y: 2.9, w: 8.8, h: 0.4, fontSize: 14, color: muted },
    );
    slide.addText(meta.source, { x: 0.6, y: 4.8, w: 8.8, h: 0.3, fontSize: 12, color: accent });
  }

  {
    const slide = pptx.addSlide();
    slide.addText("Recruitment brief", {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.5,
      fontSize: 24,
      bold: true,
      color: ink,
    });
    slide.addText(briefLines(args.brief).join("\n"), {
      x: 0.5,
      y: 1.1,
      w: 9,
      h: 4.2,
      fontSize: 16,
      color: ink,
    });
  }

  {
    const slide = pptx.addSlide();
    slide.addText("Shortlist overview — top five", {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.45,
      fontSize: 22,
      bold: true,
      color: ink,
    });
    if (!top.length) {
      slide.addText("No keepers matched the current brief.", {
        x: 0.5,
        y: 1.2,
        w: 9,
        h: 0.4,
        fontSize: 16,
        color: muted,
      });
    } else {
      slide.addTable(
        [
          [
            cell("Fit #", { bold: true, color: "FFFFFF" }),
            cell("Player", { bold: true, color: "FFFFFF" }),
            cell("Club", { bold: true, color: "FFFFFF" }),
            cell("Age", { bold: true, color: "FFFFFF" }),
            cell("KeeperIQ", { bold: true, color: "FFFFFF" }),
            cell("Fit", { bold: true, color: "FFFFFF" }),
            cell("Archetype", { bold: true, color: "FFFFFF" }),
          ],
          ...top.map((match, index) => [
            cell(String(index + 1)),
            cell(match.player.name),
            cell(match.player.team_abbreviation ?? match.player.team ?? "—"),
            cell(match.player.age != null ? String(match.player.age) : "—"),
            cell(match.player.keeperiq != null ? match.player.keeperiq.toFixed(1) : "—"),
            cell(match.score.toFixed(0)),
            cell(match.player.archetype ?? "—"),
          ]),
        ],
        {
          x: 0.4,
          y: 1.0,
          w: 9.2,
          colW: [0.7, 2.0, 1.0, 0.7, 1.1, 0.8, 2.9],
          border: [
            { pt: 0.5, color: "D0D5DD" },
            { pt: 0.5, color: "D0D5DD" },
            { pt: 0.5, color: "D0D5DD" },
            { pt: 0.5, color: "D0D5DD" },
          ],
          fontFace: "Arial",
          fontSize: 11,
          color: ink,
          align: "left",
          valign: "middle",
        },
      );
    }
  }

  for (const match of top) {
    const slide = pptx.addSlide();
    const p = match.player;
    slide.addText(p.name, {
      x: 0.5,
      y: 0.3,
      w: 7,
      h: 0.45,
      fontSize: 24,
      bold: true,
      color: ink,
    });
    slide.addText(
      `${p.team ?? "—"} · age ${p.age ?? "—"} · ${p.archetype ?? "No archetype"} · Fit ${match.score.toFixed(0)}`,
      { x: 0.5, y: 0.75, w: 9, h: 0.3, fontSize: 12, color: muted },
    );

    slide.addTable(
      [
        [
          cell("KeeperIQ", { bold: true }),
          cell("Adj G+/96", { bold: true }),
          cell("Sample Influence", { bold: true }),
          cell("Minutes", { bold: true }),
          cell("Sample", { bold: true }),
        ],
        [
          cell(p.keeperiq != null ? p.keeperiq.toFixed(1) : "—"),
          cell(p.adjusted_total_p96 != null ? p.adjusted_total_p96.toFixed(2) : "—"),
          cell(p.reliability != null ? `${Math.round(p.reliability * 100)}%` : "—"),
          cell(p.minutes != null ? Math.round(p.minutes).toLocaleString() : "—"),
          cell(p.sample_status_label),
        ],
      ],
      { x: 0.5, y: 1.15, w: 9, colW: [1.8, 1.8, 2.2, 1.6, 1.6], fontSize: 12 },
    );

    slide.addText("Component percentiles", {
      x: 0.5,
      y: 2.15,
      w: 4.5,
      h: 0.3,
      fontSize: 13,
      bold: true,
      color: accent,
    });
    slide.addText(
      COMPONENT_ORDER.map(
        (key) =>
          `${COMPONENT_LABELS[key]}: ${p.components[key]?.percentile != null ? p.components[key]!.percentile!.toFixed(0) : "—"}`,
      ).join("\n"),
      { x: 0.5, y: 2.5, w: 4.5, h: 2.8, fontSize: 13, color: ink },
    );

    const strengths = p.notes.strengths.slice(0, 3).map((n) => n.text);
    const concerns = p.notes.concerns.slice(0, 3).map((n) => n.text);
    slide.addText("Strengths", {
      x: 5.2,
      y: 2.15,
      w: 4.3,
      h: 0.3,
      fontSize: 13,
      bold: true,
      color: accent,
    });
    slide.addText(
      strengths.length ? strengths.map((t) => `• ${t}`).join("\n") : "• None flagged",
      { x: 5.2, y: 2.5, w: 4.3, h: 1.2, fontSize: 11, color: ink },
    );
    slide.addText("Concerns", {
      x: 5.2,
      y: 3.8,
      w: 4.3,
      h: 0.3,
      fontSize: 13,
      bold: true,
      color: "B42318",
    });
    slide.addText(
      concerns.length ? concerns.map((t) => `• ${t}`).join("\n") : "• None flagged",
      { x: 5.2, y: 4.15, w: 4.3, h: 1.0, fontSize: 11, color: ink },
    );
    slide.addText("Why this keeper fits", {
      x: 0.5,
      y: 5.35,
      w: 9,
      h: 0.25,
      fontSize: 12,
      bold: true,
      color: ink,
    });
    slide.addText(match.reasons.map((r) => `${r.label}: ${r.detail}`).join(" · "), {
      x: 0.5,
      y: 5.6,
      w: 9,
      h: 0.5,
      fontSize: 10,
      color: muted,
    });
  }

  {
    const slide = pptx.addSlide();
    slide.addText("Comparison", {
      x: 0.5,
      y: 0.35,
      w: 9,
      h: 0.4,
      fontSize: 22,
      bold: true,
      color: ink,
    });
    if (top.length) {
      slide.addTable(
        [
          [
            cell("Metric", { bold: true, color: "FFFFFF" }),
            ...top.map((m) => cell(m.player.name, { bold: true, color: "FFFFFF" })),
          ],
          [
            cell("KeeperIQ"),
            ...top.map((m) =>
              cell(m.player.keeperiq != null ? m.player.keeperiq.toFixed(1) : "—"),
            ),
          ],
          [
            cell("Adj G+/96"),
            ...top.map((m) =>
              cell(
                m.player.adjusted_total_p96 != null
                  ? m.player.adjusted_total_p96.toFixed(2)
                  : "—",
              ),
            ),
          ],
          [
            cell("Sample Influence"),
            ...top.map((m) =>
              cell(
                m.player.reliability != null
                  ? `${Math.round(m.player.reliability * 100)}%`
                  : "—",
              ),
            ),
          ],
          [
            cell("Minutes"),
            ...top.map((m) =>
              cell(m.player.minutes != null ? String(Math.round(m.player.minutes)) : "—"),
            ),
          ],
          [cell("Fit score"), ...top.map((m) => cell(m.score.toFixed(0)))],
        ],
        {
          x: 0.4,
          y: 1.0,
          w: 9.2,
          fontSize: 11,
          border: [
            { pt: 0.5, color: "D0D5DD" },
            { pt: 0.5, color: "D0D5DD" },
            { pt: 0.5, color: "D0D5DD" },
            { pt: 0.5, color: "D0D5DD" },
          ],
          colW: [2.0, ...top.map(() => 7.2 / top.length)],
        },
      );
    }
  }

  {
    const slide = pptx.addSlide();
    slide.addText("Recommendation", {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.45,
      fontSize: 24,
      bold: true,
      color: ink,
    });
    const primary = top[0];
    const alts = top.slice(1, 3);
    const riskLines = primary
      ? [
          primary.player.sample_status !== "qualified"
            ? `• Sample status is ${primary.player.sample_status_label}`
            : "• Primary target clears qualification thresholds",
          primary.player.reliability != null && primary.player.reliability < 0.25
            ? "• Sample Influence is still low — rating may move with more minutes"
            : "• Sample Influence supports a usable read",
          "• Context and playing style (archetype) should be checked against tactical fit",
        ].join("\n")
      : "• No shortlist produced under the current brief";

    slide.addText(
      [
        `Primary target: ${primary ? primary.player.name : "None — relax filters"}`,
        primary
          ? `${primary.player.team ?? ""} · KeeperIQ ${primary.player.keeperiq?.toFixed(1) ?? "—"} · Fit ${primary.score.toFixed(0)}`
          : "",
        "",
        `Alternatives: ${alts.length ? alts.map((m) => m.player.name).join(", ") : "—"}`,
        "",
        "Key risks:",
        riskLines,
      ]
        .filter(Boolean)
        .join("\n"),
      { x: 0.5, y: 1.1, w: 9, h: 4.2, fontSize: 15, color: ink },
    );
  }

  {
    const slide = pptx.addSlide();
    slide.addText("Methodology & limitations", {
      x: 0.5,
      y: 0.4,
      w: 9,
      h: 0.45,
      fontSize: 22,
      bold: true,
      color: ink,
    });
    slide.addText(
      [
        "• KeeperIQ is a percentile of reliability-adjusted complete Goals Added among MLS peers.",
        "• Adjusted G+/96 shrinks noisy observed rates toward a season baseline (Sample Influence).",
        "• Components: shot stopping, handling, claiming, sweeping, passing, fielding.",
        "• Current Talent blends prior-season and live evidence; it is not a single-season observed score.",
        "• Traditional GA/96 and save % remain context-sensitive and are shown for reference only.",
        `• Source: ${meta.source}.`,
        "• This brief is a decision aid, not a transfer recommendation by itself.",
      ].join("\n"),
      { x: 0.5, y: 1.1, w: 9, h: 4.5, fontSize: 14, color: ink },
    );
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  downloadBlob(blob, stampFilename(`keeperiq-scouting-brief-${args.brief.season}`, "pptx"));
}

export async function exportComparePptx(args: {
  players: SeasonPlayer[];
  view: string;
}): Promise<void> {
  const brief: ScoutingBrief = {
    season: args.view === "2025" ? "2025" : "2026",
    query: "",
    minShotStoppingPercentile: 0,
    minSweepingPercentile: 0,
    minPassingPercentile: 0,
    minAge: null,
    maxAge: null,
    minMinutes: 0,
    minReliability: 0,
    salaryEnabled: false,
    minSalary: null,
    maxSalary: null,
    similaritySlug: null,
    minSimilarity: 0.7,
    preferredArchetype: null,
    includeLimited: true,
  };
  const matches: ScoutingMatch[] = args.players.map((player, index) => ({
    player,
    score: 100 - index,
    similarity: null,
    reasons: [
      {
        code: "compare",
        label: "Comparison set",
        detail: `Selected for side-by-side review in ${args.view}`,
        tone: "info",
      },
    ],
  }));
  await exportScoutingPptx({ brief, matches });
}
