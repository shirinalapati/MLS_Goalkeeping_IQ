export function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <span className="group relative inline-flex items-center gap-1">
      <span>{label}</span>
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--border-strong)] text-[0.6rem] text-[var(--text-muted)]"
        aria-hidden
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+0.4rem)] left-1/2 z-20 hidden w-56 -translate-x-1/2 rounded-md border border-[var(--border)] bg-[#12161c] p-2 text-left text-[0.7rem] font-normal normal-case tracking-normal text-[var(--text)] shadow-lg group-hover:block group-focus-within:block"
      >
        {children}
      </span>
    </span>
  );
}
