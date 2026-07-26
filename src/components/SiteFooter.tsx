import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-[var(--border)] py-8 text-sm text-[var(--text-muted)]">
      <div className="container-page flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p>
          Goalkeeper Goals Added and shot-stopping data from{" "}
          <a
            href="https://www.americansocceranalysis.com/"
            className="text-[var(--accent)] underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            American Soccer Analysis
          </a>
          . KeeperIQ is an independent evaluation layer on top of those public estimates.
        </p>
        <div className="flex gap-4">
          <Link href="/">About & methodology</Link>
          <Link href="/overview">Overview</Link>
          <Link href="/overview#season-coverage">Season coverage</Link>
        </div>
      </div>
    </footer>
  );
}
