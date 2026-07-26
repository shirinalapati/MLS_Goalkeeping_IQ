"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GlossaryButton } from "@/components/GlossaryButton";
import { clsx } from "@/lib/format";

const LINKS = [
  { href: "/", label: "About & Methodology" },
  { href: "/overview", label: "Overview" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/scouting", label: "Scouting" },
  { href: "/compare", label: "Compare" },
  { href: "/archetypes", label: "Archetypes" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[rgba(11,13,16,0.88)] backdrop-blur-md">
      <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href="/" className="flex items-center gap-2.5 no-underline hover:text-[var(--text)]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-dim)] text-sm font-bold text-[var(--accent)]">
            KQ
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight">MLS KeeperIQ</span>
            <span className="block text-[0.68rem] text-[var(--text-muted)]">
              Context-adjusted goalkeeper evaluation
            </span>
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Primary" className="flex flex-wrap gap-1">
            {LINKS.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    "rounded-md px-2.5 py-1.5 text-sm no-underline transition-colors",
                    active
                      ? "bg-[var(--accent-dim)] font-semibold text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text)]",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <GlossaryButton />
        </div>
      </div>
    </header>
  );
}
