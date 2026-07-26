import type { SampleStatus } from "@/lib/types";

const CLASS: Record<SampleStatus, string> = {
  qualified: "badge badge-qualified",
  provisional: "badge badge-provisional",
  limited: "badge badge-limited",
};

const LABEL: Record<SampleStatus, string> = {
  qualified: "Qualified",
  provisional: "Provisional",
  limited: "Limited Sample",
};

export function StatusBadge({ status }: { status: SampleStatus }) {
  return <span className={CLASS[status]}>{LABEL[status]}</span>;
}
