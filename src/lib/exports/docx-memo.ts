/** Concise two-page Word recruitment recommendation memo. */

import type { ScoutingBrief, ScoutingMatch } from "@/lib/scouting-utils";

import {
  buildExportMeta,
  downloadBlob,
  loadDataStatus,
  stampFilename,
} from "@/lib/exports/meta";

export async function exportScoutingMemo(args: {
  brief: ScoutingBrief;
  matches: ScoutingMatch[];
}): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const status = await loadDataStatus();
  const meta = buildExportMeta(status, args.brief.season);
  const top = args.matches.slice(0, 5);
  const primary = top[0];
  const alts = top.slice(1, 3);

  const doc = new Document({
    creator: "MLS KeeperIQ",
    title: "Goalkeeper Recruitment Recommendation",
    description: "MLS KeeperIQ recruitment recommendation",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Goalkeeper Recruitment Recommendation",
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `MLS KeeperIQ  ·  ${meta.seasonLabel}  ·  ${new Date().toLocaleDateString("en-US")}`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: "Objective", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            text: "Identify MLS goalkeepers who clear a defined recruitment profile on context-adjusted complete impact (KeeperIQ), with enough sample influence to support a decision, and who fit the preferred involvement style where specified.",
          }),
          new Paragraph({ text: "Target profile", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            text: [
              `Season ${args.brief.season}`,
              `Shot-stopping ≥ ${args.brief.minShotStoppingPercentile}th percentile`,
              `Sweeping ≥ ${args.brief.minSweepingPercentile}`,
              `Passing ≥ ${args.brief.minPassingPercentile}`,
              `Minutes ≥ ${args.brief.minMinutes}`,
              `Sample Influence ≥ ${args.brief.minReliability}`,
              args.brief.minAge != null || args.brief.maxAge != null
                ? `Age ${args.brief.minAge ?? "any"}–${args.brief.maxAge ?? "any"}`
                : "Age unrestricted",
              `Archetype: ${args.brief.preferredArchetype ?? "any"}`,
              `Similarity constraint: ${args.brief.similaritySlug ?? "none"}`,
            ].join("; ") + ".",
          }),
          new Paragraph({ text: "Recommended players", heading: HeadingLevel.HEADING_1 }),
          primary
            ? new Paragraph({
                children: [
                  new TextRun({ text: "Primary: ", bold: true }),
                  new TextRun({
                    text: `${primary.player.name} (${primary.player.team_abbreviation ?? primary.player.team ?? "—"}) — KeeperIQ ${primary.player.keeperiq?.toFixed(1) ?? "—"}, Adj G+/96 ${primary.player.adjusted_total_p96?.toFixed(2) ?? "—"}, Sample Influence ${primary.player.reliability != null ? `${Math.round(primary.player.reliability * 100)}%` : "—"}, Fit ${primary.score.toFixed(0)}. Archetype: ${primary.player.archetype ?? "—"}.`,
                  }),
                ],
              })
            : new Paragraph({
                text: "No keepers matched the current brief. Relax percentile floors, minutes, or sample constraints.",
              }),
          ...alts.map(
            (match) =>
              new Paragraph({
                children: [
                  new TextRun({ text: "Alternative: ", bold: true }),
                  new TextRun({
                    text: `${match.player.name} — KeeperIQ ${match.player.keeperiq?.toFixed(1) ?? "—"}, Fit ${match.score.toFixed(0)}, ${match.player.archetype ?? "no archetype"}.`,
                  }),
                ],
              }),
          ),
          new Paragraph({ text: "Supporting evidence", heading: HeadingLevel.HEADING_1 }),
          ...(primary
            ? primary.reasons.map(
                (reason) =>
                  new Paragraph({
                    text: `• ${reason.label}: ${reason.detail}`,
                  }),
              )
            : [new Paragraph({ text: "• No shortlist evidence available." })]),
          ...(primary?.player.notes.strengths.slice(0, 3).map(
            (note) =>
              new Paragraph({
                text: `• Strength — ${note.text}`,
              }),
          ) ?? []),
          new Paragraph({ text: "Risks", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            text: primary
              ? [
                  primary.player.sample_status !== "qualified"
                    ? `• Sample status is ${primary.player.sample_status_label}; treat the rating as less stable.`
                    : "• Primary target meets the season qualification bar.",
                  primary.player.reliability != null && primary.player.reliability < 0.25
                    ? "• Sample Influence remains low — additional minutes may move the adjusted rating."
                    : "• Sample Influence is adequate for a provisional decision.",
                  "• Tactical fit (archetype and club context) should be validated with coaching staff.",
                ].join("\n")
              : "• No primary target identified under the active filters.",
          }),
          new Paragraph({ text: "Next steps", heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            text: [
              "1. Review the Excel shortlist and add Analyst notes where useful.",
              "2. Present the PowerPoint brief to sporting staff for primary/alternative debate.",
              "3. Cross-check medical, contract, and availability constraints outside KeeperIQ.",
              "4. Re-run the brief after the next data refresh if Sample Influence is still rising.",
            ].join("\n"),
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `\nSource: ${meta.source}. This memo is a decision aid generated from the active scouting filters and shortlist — not a full methodology document.`,
                italics: true,
                size: 18,
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, stampFilename(`keeperiq-recruitment-memo-${args.brief.season}`, "docx"));
}
