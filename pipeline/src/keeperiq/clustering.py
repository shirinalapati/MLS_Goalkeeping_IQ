"""Goalkeeper style archetypes.

The source publishes an action count for every Goals Added component, so these
are genuine *involvement* variables (claim attempts per 96, sweeping actions per
96, passes attempted per 96, ...) rather than value estimates. Clustering
standardised involvement therefore produces real playing-style archetypes and
not a relabelling of who is good.

The number of clusters is chosen by silhouette score across the candidates in
configuration, and every candidate's score is exported so the choice is
auditable. Labels are derived from the centroid values themselves: a cluster is
only called "Proactive Sweeper" if sweeping involvement is actually its most
distinctive elevated dimension.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

from .config import Config
from .logging_utils import get_logger

LOG = get_logger("clustering")

# Which elevated dimension implies which label, and the fallback when a cluster
# has no distinctive dimension.
DIMENSION_LABELS: dict[str, tuple[str, str]] = {
    "sweeping_actions_p96": (
        "Proactive Sweeper",
        "Steps well outside the penalty area more often than most MLS goalkeepers.",
    ),
    "claiming_actions_p96": (
        "Box Commander",
        "Attacks crosses and set pieces at an unusually high rate.",
    ),
    "passing_actions_p96": (
        "Build-Up Distributor",
        "Involved in possession far more often than a typical goalkeeper.",
    ),
    "shot_stopping_actions_p96": (
        "High-Volume Shot Stopper",
        "Faces a heavy shot workload, usually behind a defence that concedes chances.",
    ),
    "handling_actions_p96": (
        "Busy Handler",
        "Deals with a high rate of post-shot situations, parries, and rebounds.",
    ),
    "fielding_actions_p96": (
        "Sweeper-Keeper Receiver",
        "Receives and secures loose balls and back-passes very frequently.",
    ),
}

BALANCED_LABEL = (
    "Balanced All-Rounder",
    "No single involvement dimension stands out; workload is spread evenly.",
)
RESERVED_LABEL = (
    "Low-Involvement Keeper",
    "Below-average involvement across most dimensions, typically behind a controlling side.",
)


@dataclass
class ClusterDiagnostics:
    chosen_k: int
    silhouette_scores: dict[int, float]
    inertia: dict[int, float]
    variables: list[str]
    n_players: int
    min_minutes: float
    seed: int
    note: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "chosen_k": self.chosen_k,
            "silhouette_scores": {str(k): round(v, 4) for k, v in self.silhouette_scores.items()},
            "inertia": {str(k): round(v, 4) for k, v in self.inertia.items()},
            "variables": self.variables,
            "n_players": self.n_players,
            "min_minutes": self.min_minutes,
            "seed": self.seed,
            "note": self.note,
        }


@dataclass
class ClusterResult:
    assignments: pd.DataFrame
    profiles: list[dict[str, Any]]
    diagnostics: ClusterDiagnostics


def _label_for_centroid(
    centroid: pd.Series, used: set[str]
) -> tuple[str, str, list[str]]:
    """Name a cluster from its standardised centroid.

    A dimension counts as "distinctive" only if it is at least half a standard
    deviation above the league mean, so we never claim a style a cluster does
    not actually have.
    """
    elevated = centroid[centroid >= 0.5].sort_values(ascending=False)
    distinctive = [str(name) for name in elevated.index]

    for name in distinctive:
        label, description = DIMENSION_LABELS.get(str(name), ("", ""))
        if label and label not in used:
            return label, description, distinctive

    if not distinctive:
        if (centroid <= -0.35).sum() >= 3:
            return RESERVED_LABEL[0], RESERVED_LABEL[1], distinctive
        return BALANCED_LABEL[0], BALANCED_LABEL[1], distinctive

    # Every matching label is taken; qualify the strongest dimension instead.
    top = distinctive[0]
    base_label, description = DIMENSION_LABELS.get(str(top), BALANCED_LABEL)
    return f"{base_label} (Secondary)", description, distinctive


def build_archetypes(cfg: Config, frame: pd.DataFrame) -> ClusterResult | None:
    """Cluster goalkeepers by standardised involvement rates."""
    settings = cfg.section("clustering")
    if not settings.get("enabled", True):
        return None

    variables = [str(v) for v in settings["style_variables"]]
    # Style variables are named ``<component>_actions_p96``; the frame stores
    # them as ``opp_<component>_p96``.
    column_for = {
        variable: f"opp_{variable.removesuffix('_actions_p96')}_p96" for variable in variables
    }
    missing = [v for v, column in column_for.items() if column not in frame.columns]
    if missing:
        LOG.warning("Skipping archetypes; missing involvement columns for %s", missing)
        return None

    min_minutes = float(settings["min_minutes"])
    usable = frame[frame["minutes"] >= min_minutes].dropna(
        subset=list(column_for.values())
    )
    usable = usable.sort_values("player_id").reset_index(drop=True)

    candidates = [int(k) for k in settings["candidate_k"]]
    if len(usable) <= max(candidates) + 1:
        LOG.warning(
            "Skipping archetypes; only %d goalkeepers cleared the %.0f-minute bar",
            len(usable),
            min_minutes,
        )
        return None

    matrix = usable[[column_for[v] for v in variables]].to_numpy(dtype=float)
    means = matrix.mean(axis=0)
    sds = matrix.std(axis=0, ddof=0)
    sds[sds == 0] = 1.0
    standardised = (matrix - means) / sds

    seed = int(settings["seed"])
    n_init = int(settings["n_init"])
    scores: dict[int, float] = {}
    inertia: dict[int, float] = {}
    fitted: dict[int, KMeans] = {}
    for k in candidates:
        model = KMeans(n_clusters=k, random_state=seed, n_init=n_init)
        labels = model.fit_predict(standardised)
        if len(set(labels)) < 2:
            continue
        scores[k] = float(silhouette_score(standardised, labels))
        inertia[k] = float(model.inertia_)
        fitted[k] = model

    if not scores:
        LOG.warning("Skipping archetypes; no candidate k produced a valid partition")
        return None

    chosen_k = max(scores, key=lambda k: (round(scores[k], 4), -k))
    model = fitted[chosen_k]
    labels = model.predict(standardised)

    centroids = pd.DataFrame(model.cluster_centers_, columns=variables)
    # Name larger clusters first so the most common style claims its label.
    sizes = pd.Series(labels).value_counts()
    used: set[str] = set()
    profiles: list[dict[str, Any]] = []
    naming: dict[int, tuple[str, str, list[str]]] = {}
    for cluster_id in sizes.index:
        label, description, distinctive = _label_for_centroid(
            centroids.loc[int(cluster_id)], used
        )
        used.add(label)
        naming[int(cluster_id)] = (label, description, distinctive)

    for cluster_id in sorted(naming):
        label, description, distinctive = naming[cluster_id]
        members = usable.loc[labels == cluster_id]
        profiles.append(
            {
                "cluster_id": int(cluster_id),
                "label": label,
                "description": description,
                "size": len(members),
                "distinctive_variables": distinctive,
                "centroid": {
                    variable: round(float(centroids.loc[cluster_id, variable]), 3)
                    for variable in variables
                },
                "centroid_raw": {
                    variable: round(
                        float(members[column_for[variable]].mean()), 2
                    )
                    for variable in variables
                },
                "median_keeperiq": (
                    round(float(members["keeperiq"].median()), 1)
                    if "keeperiq" in members and members["keeperiq"].notna().any()
                    else None
                ),
            }
        )

    assignments = pd.DataFrame(
        {
            "player_id": usable["player_id"].to_numpy(),
            "archetype_cluster": labels.astype(int),
            "archetype_label": [naming[int(c)][0] for c in labels],
        }
    )

    diagnostics = ClusterDiagnostics(
        chosen_k=chosen_k,
        silhouette_scores=scores,
        inertia=inertia,
        variables=variables,
        n_players=len(usable),
        min_minutes=min_minutes,
        seed=seed,
        note=(
            "k-means on standardised per-96 involvement rates. k chosen by the highest "
            "silhouette score among the configured candidates, ties broken toward fewer "
            "clusters. Labels are assigned from centroid values and only claim a style when "
            "that dimension is at least 0.5 standard deviations above the league mean."
        ),
    )
    LOG.info(
        "Archetypes: k=%d, silhouette=%.3f, %d goalkeepers, labels=%s",
        chosen_k,
        scores[chosen_k],
        len(usable),
        [p["label"] for p in profiles],
    )
    return ClusterResult(assignments=assignments, profiles=profiles, diagnostics=diagnostics)
