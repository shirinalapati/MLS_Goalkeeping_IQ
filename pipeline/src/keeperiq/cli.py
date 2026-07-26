"""Command line entry point for the KeeperIQ pipeline."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .build import run_pipeline
from .config import load_config
from .fetch import SourceUnavailableError
from .logging_utils import configure_logging, get_logger
from .schema import SchemaError
from .scrape import ScrapePolicyError, ScrapeSchemaError, scrape_wikipedia_rosters

LOG = get_logger("cli")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="keeperiq",
        description="MLS KeeperIQ data pipeline, DuckDB loader, and roster scraper.",
    )
    parser.add_argument(
        "--config",
        type=Path,
        default=None,
        help="Path to keeperiq.yml (defaults to pipeline/config/keeperiq.yml).",
    )
    parser.add_argument(
        "--log-level",
        default=None,
        help="Logging level (DEBUG, INFO, WARNING, ERROR).",
    )
    sub = parser.add_subparsers(dest="command")

    build_cmd = sub.add_parser("build", help="Fetch ASA data, score keepers, export JSON + DuckDB.")
    build_cmd.add_argument(
        "--force",
        action="store_true",
        help="Ignore the raw ASA cache and re-fetch every endpoint.",
    )
    build_cmd.add_argument(
        "--offline",
        action="store_true",
        help="Rebuild from cached raw payloads only; never touch the network.",
    )
    build_cmd.add_argument(
        "--no-snapshot",
        action="store_true",
        help="Rebuild outputs without recording a dated snapshot.",
    )

    scrape_cmd = sub.add_parser(
        "scrape",
        help="Scrape supplementary Wikipedia club roster HTML (not ASA).",
    )
    scrape_cmd.add_argument(
        "--force",
        action="store_true",
        help="Ignore cached HTML and re-download roster pages.",
    )
    scrape_cmd.add_argument(
        "--no-persist",
        action="store_true",
        help="Parse and write JSON only; do not insert into DuckDB.",
    )

    # Preserve the previous default invocation: `python -m keeperiq.cli` means build.
    parser.set_defaults(command="build", force=False, offline=False, no_snapshot=False)
    return parser


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    # Default to the build subcommand so `python -m keeperiq.cli --offline` still works.
    if not argv or argv[0] not in {"build", "scrape", "-h", "--help"}:
        argv = ["build", *argv]

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(args.log_level)

    try:
        cfg = load_config(args.config)
        if args.command == "scrape":
            result = scrape_wikipedia_rosters(
                cfg,
                force=bool(args.force),
                persist=not bool(getattr(args, "no_persist", False)),
            )
            print(
                json.dumps(
                    {
                        "scrape_run_id": result.scrape_run_id,
                        "pages_succeeded": result.pages_succeeded,
                        "pages_attempted": result.pages_attempted,
                        "players": len(result.rows),
                        "goalkeepers": len(result.goalkeepers),
                        "notes": result.notes,
                    },
                    indent=2,
                )
            )
            return 0

        status = run_pipeline(
            cfg,
            force=bool(args.force),
            offline=bool(args.offline),
            write_snapshots=not bool(args.no_snapshot),
        )
    except (SchemaError, SourceUnavailableError, ScrapePolicyError, ScrapeSchemaError) as exc:
        LOG.error("Pipeline aborted: %s", exc)
        return 2
    except Exception as exc:
        LOG.exception("Pipeline failed unexpectedly: %s", exc)
        return 1

    summary = {
        "validation_status": status["validation_status"],
        "data_is_current": status["data_is_current"],
        "last_successful_update": status["last_successful_update"],
        "database": status.get("database"),
        "seasons": {
            season: {
                "goalkeepers": detail["goalkeepers"],
                "max_match_date": detail["max_match_date"],
            }
            for season, detail in status["seasons"].items()
        },
        "snapshots_written": status["snapshots_written"],
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
