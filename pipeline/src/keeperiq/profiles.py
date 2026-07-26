"""Deterministic strengths and concerns.

Every statement is generated from an explicit percentile threshold and is
suppressed unless the goalkeeper actually had enough opportunities for that
component to mean anything. Nothing here is narrative: the same inputs always
produce the same sentences, and no claim is made that the data cannot support.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from .config import Config
from .rates import TOTAL_KEY
from .ratings import LIMITED, PROVISIONAL


def _band(percentile: float, cfg: Config) -> str | None:
    thresholds = cfg.section("profile_thresholds")
    if percentile >= float(thresholds["elite_percentile"]):
        return "elite"
    if percentile >= float(thresholds["strong_percentile"]):
        return "strong"
    if percentile <= float(thresholds["poor_percentile"]):
        return "poor"
    if percentile <= float(thresholds["weak_percentile"]):
        return "weak"
    return None


def build_notes(cfg: Config, row: pd.Series) -> dict[str, list[dict[str, Any]]]:
    """Return ``{"strengths": [...], "concerns": [...]}`` for one goalkeeper."""
    thresholds = cfg.section("profile_thresholds")
    min_opportunities = float(thresholds["min_opportunities_for_claim"])
    strengths: list[dict[str, Any]] = []
    concerns: list[dict[str, Any]] = []

    for spec in cfg.components:
        percentile = row.get(f"pct_adj_{spec.key}")
        opportunities = row.get(f"opp_{spec.key}")
        if pd.isna(percentile) or pd.isna(opportunities):
            continue
        if float(opportunities) < min_opportunities:
            continue
        band = _band(float(percentile), cfg)
        if band is None:
            continue
        entry = {
            "component": spec.key,
            "label": spec.label,
            "percentile": round(float(percentile), 1),
            "band": band,
            "opportunities": int(opportunities),
        }
        if band == "elite":
            entry["text"] = f"Elite adjusted {spec.label.lower()} percentile."
            strengths.append(entry)
        elif band == "strong":
            entry["text"] = f"Strong {spec.label.lower()} contribution."
            strengths.append(entry)
        elif band == "poor":
            entry["text"] = f"{spec.label} contribution well below the MLS median."
            concerns.append(entry)
        else:
            entry["text"] = f"{spec.label} contribution below the MLS median."
            concerns.append(entry)

    strengths.sort(key=lambda item: -item["percentile"])
    concerns.sort(key=lambda item: item["percentile"])

    total_percentile = row.get(f"pct_adj_{TOTAL_KEY}")
    if pd.notna(total_percentile):
        band = _band(float(total_percentile), cfg)
        entry = {
            "component": TOTAL_KEY,
            "label": "Complete impact",
            "percentile": round(float(total_percentile), 1),
            "band": band or "average",
            "opportunities": None,
        }
        if band in ("elite", "strong"):
            entry["text"] = (
                "Top-tier complete impact once every component is valued together."
                if band == "elite"
                else "Above-average complete impact across the full goalkeeping workload."
            )
            strengths.insert(0, entry)
        elif band in ("poor", "weak"):
            entry["text"] = (
                "Complete impact sits well below the MLS median."
                if band == "poor"
                else "Complete impact sits below the MLS median."
            )
            concerns.insert(0, entry)

    status = row.get("sample_status")
    if status == LIMITED:
        concerns.append(
            {
                "component": "sample",
                "label": "Sample",
                "percentile": None,
                "band": "sample",
                "opportunities": None,
                "text": (
                    f"Limited sample ({float(row['minutes']):.0f} minutes); the rating remains "
                    "heavily regressed toward the league average."
                ),
            }
        )
    elif status == PROVISIONAL:
        concerns.append(
            {
                "component": "sample",
                "label": "Sample",
                "percentile": None,
                "band": "sample",
                "opportunities": None,
                "text": (
                    f"Provisional sample ({float(row['minutes']):.0f} minutes); the rating is "
                    "still partly regressed toward the league average."
                ),
            }
        )

    reliability = row.get(f"reliability_{TOTAL_KEY}")
    if pd.notna(reliability) and float(reliability) >= 0.75 and status not in (LIMITED, PROVISIONAL):
        strengths.append(
            {
                "component": "sample",
                "label": "Sample",
                "percentile": None,
                "band": "sample",
                "opportunities": None,
                "text": (
                    f"Large, reliable sample ({float(row['minutes']):.0f} minutes); little "
                    "regression is applied."
                ),
            }
        )

    return {"strengths": strengths, "concerns": concerns}
