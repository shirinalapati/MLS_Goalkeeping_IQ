"use client";

import { useState } from "react";

interface ExportMenuProps {
  align?: "left" | "right";
  compact?: boolean;
  disabled?: boolean;
  busyLabel?: string;
  onExcel: () => Promise<void>;
  onPowerpoint?: () => Promise<void>;
  onWord?: () => Promise<void>;
}

export function ExportMenu({
  align = "right",
  compact = false,
  disabled = false,
  onExcel,
  onPowerpoint,
  onWord,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  const excelOnly = compact && !onPowerpoint && !onWord;

  return (
    <div className={`relative ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        className={compact ? "btn" : "btn btn-primary"}
        disabled={disabled || busy !== null}
        onClick={() => {
          if (excelOnly) {
            void run("Excel", onExcel);
            return;
          }
          setOpen((value) => !value);
        }}
      >
        {busy ? `Exporting ${busy}…` : compact ? "Export Excel" : "Export"}
      </button>
      {open && !excelOnly ? (
        <div
          className={`absolute z-30 mt-2 min-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <button
            type="button"
            className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)]"
            onClick={() => void run("Excel", onExcel)}
          >
            Excel workbook
          </button>
          {onPowerpoint ? (
            <button
              type="button"
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)]"
              onClick={() => void run("PowerPoint", onPowerpoint)}
            >
              PowerPoint brief
            </button>
          ) : null}
          {onWord ? (
            <button
              type="button"
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--bg-elevated)]"
              onClick={() => void run("Word", onWord)}
            >
              Word memo
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="mt-1 text-xs text-[var(--negative)]">{error}</p> : null}
    </div>
  );
}
