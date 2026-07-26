"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { LEADERBOARD_GLOSSARY, type GlossaryEntry } from "@/lib/glossary";

interface GlossaryButtonProps {
  entries?: GlossaryEntry[];
  label?: string;
}

export function GlossaryButton({
  entries = LEADERBOARD_GLOSSARY,
  label = "Open glossary",
}: GlossaryButtonProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn btn-primary glossary-launch"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="card flex max-h-[min(85vh,720px)] w-full max-w-xl flex-col shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div>
                <p className="eyebrow">Reference</p>
                <h2 id={titleId} className="mt-1 text-xl font-semibold tracking-tight">
                  Metric glossary
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  What each column means. Component G+/96 values use three decimals so small
                  non-shot contributions are not rounded to 0.00.
                </p>
                <p className="mt-2 text-sm text-[var(--text)]">
                  Click any metric title to jump to that topic in{" "}
                  <strong>About & Methodology</strong> and learn more.
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="btn shrink-0"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>
            <dl className="overflow-y-auto px-5 py-3">
              {entries.map((entry) => (
                <div
                  key={entry.term}
                  className="border-b border-[var(--border)] py-3 last:border-b-0"
                >
                  <dt>
                    <Link
                      href={entry.href}
                      className="font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
                      onClick={() => setOpen(false)}
                    >
                      {entry.term}
                    </Link>
                  </dt>
                  <dd className="mt-1 text-sm text-[var(--text-muted)]">{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      ) : null}
    </>
  );
}
