import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page card card-pad text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
      <p className="mt-3 text-[var(--text-muted)]">
        That route does not exist. The leaderboard and player directory are good places to restart.
      </p>
      <div className="mt-5 flex justify-center gap-3">
        <Link href="/" className="btn btn-primary no-underline">
          Overview
        </Link>
        <Link href="/leaderboard" className="btn no-underline">
          Leaderboard
        </Link>
      </div>
    </div>
  );
}
