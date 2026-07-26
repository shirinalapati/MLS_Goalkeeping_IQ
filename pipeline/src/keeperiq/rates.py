"""Rate construction shared by every downstream stage.

All rates are expressed per 96 minutes. American Soccer Analysis publishes
Goals Added on a per-96 basis because 96 minutes is close to the average length
of an MLS match once stoppage time is included, so a "per 96" figure is
readable as "per full match played".
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from .config import Config

TOTAL_KEY = "total"


def per_96(values: pd.Series, minutes: pd.Series, basis: int) -> pd.Series:
    """Convert a counting stat to a per-96 rate, guarding against zero minutes.

    A goalkeeper with no minutes has no defined rate, so the result is missing
    rather than zero or infinite.
    """
    safe_minutes = minutes.where(minutes > 0)
    return values / safe_minutes * basis


def add_totals(cfg: Config, frame: pd.DataFrame) -> pd.DataFrame:
    """Add Total G+ and total opportunity columns.

    The source publishes no goalkeeper Total G+ field, so Total is defined as
    the sum of the six components. Because every component is measured in the
    same goal-equivalent unit against the same positional baseline, the sum is
    additive and there is nothing to double count. ``transform`` separately
    reconciles raw shot-stopping against the independent xGoals feed.
    """
    frame = frame.copy()
    ga_columns = [f"ga_{key}" for key in cfg.component_keys]
    opp_columns = [f"opp_{key}" for key in cfg.component_keys]

    present = frame[ga_columns].notna()
    # A goalkeeper-season is only given a Total when every component is present;
    # partial sums would silently understate a keeper's value.
    complete = present.all(axis=1)
    frame[f"ga_{TOTAL_KEY}"] = np.where(complete, frame[ga_columns].sum(axis=1), np.nan)
    frame[f"opp_{TOTAL_KEY}"] = frame[opp_columns].sum(axis=1, min_count=1)
    frame["components_complete"] = complete
    return frame


def add_rates(cfg: Config, frame: pd.DataFrame) -> pd.DataFrame:
    """Add per-96 Goals Added rates and per-96 opportunity (involvement) rates."""
    frame = add_totals(cfg, frame)
    basis = cfg.minutes_basis
    minutes = frame["minutes"].astype(float)
    for key in [*cfg.component_keys, TOTAL_KEY]:
        frame[f"ga_{key}_p96"] = per_96(frame[f"ga_{key}"].astype(float), minutes, basis)
        frame[f"opp_{key}_p96"] = per_96(frame[f"opp_{key}"].astype(float), minutes, basis)
    return frame


def add_traditional_metrics(frame: pd.DataFrame, basis: int) -> pd.DataFrame:
    """Add the traditional goalkeeping metrics KeeperIQ is contrasted against."""
    frame = frame.copy()
    minutes = frame["minutes"].astype(float)
    frame["goals_conceded_p96"] = per_96(frame["goals_conceded"].astype(float), minutes, basis)
    frame["shots_faced_p96"] = per_96(frame["shots_faced"].astype(float), minutes, basis)
    frame["xgoals_faced_p96"] = per_96(frame["xgoals_faced"].astype(float), minutes, basis)

    shots = frame["shots_faced"].astype(float)
    saves = frame["saves"].astype(float)
    # Save percentage is undefined when no shots on target were faced.
    frame["save_pct"] = np.where(shots > 0, saves / shots * 100.0, np.nan)

    # Goals prevented: expected goals from the shots faced minus goals actually
    # conceded. Positive means the goalkeeper conceded fewer than expected.
    frame["goals_prevented"] = frame["xgoals_faced"].astype(float) - frame[
        "goals_conceded"
    ].astype(float)
    frame["goals_prevented_p96"] = per_96(frame["goals_prevented"], minutes, basis)
    return frame
