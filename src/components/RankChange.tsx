import { formatSigned } from "@/lib/format";

/** Rank places gained (positive) or lost (negative) versus a prior ranking. */
export function RankChange({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-[var(--text-faint)]">NA</span>;
  }
  if (value === 0) {
    return <span className="text-[var(--text-muted)]">0</span>;
  }
  const positive = value > 0;
  return (
    <span className={positive ? "text-[var(--positive)]" : "text-[var(--negative)]"}>
      {positive ? "▲" : "▼"} {formatSigned(value, 0)}
    </span>
  );
}
