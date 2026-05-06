"""Hierarchical super-topics across scenes.

Reads `data/derived/topic_views/<scene>.json` for every labelled scene,
resamples each scene's per-topic spectral profile to a common 224-band
400 – 2500 nm grid, stacks all topics into one matrix
(n_total_topics × 224), computes pairwise cosine distances, and runs
agglomerative hierarchical clustering with average linkage.

For each canonical cut level K_super in {4, 6, 8, 10, 12}, reports
the resulting super-topic assignment, mean centroid spectrum, member
list (scene_id, topic_k pairs), within-cluster cohesion, and the
dendrogram in linkage-matrix form so the public web app can render it.

Output: `data/derived/super_topics/super_topics.json`
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR


TOPIC_VIEWS_DIR = DERIVED_DIR / "topic_views"
OUTPUT_DIR = DERIVED_DIR / "super_topics"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

# Common grid for cross-scene resampling. Uses the AVIRIS 400 – 2500 nm
# range at 224 bands (~9.4 nm/band). Pavia U topics (430 – 860 nm) are
# resampled within their valid wavelength range only and zero-padded
# elsewhere; the cosine similarity therefore reflects only the bands
# Pavia actually covered.
COMMON_LOW_NM = 400.0
COMMON_HIGH_NM = 2500.0
COMMON_BANDS = 224
COMMON_GRID = np.linspace(COMMON_LOW_NM, COMMON_HIGH_NM, COMMON_BANDS)

CUT_LEVELS = [4, 6, 8, 10, 12]


def resample_to_common_grid(
    profile: np.ndarray, scene_grid: np.ndarray
) -> np.ndarray:
    """Linear interpolation onto the common grid; zero outside the
    scene's wavelength range so the cosine product reflects only
    common bands."""
    out = np.zeros_like(COMMON_GRID, dtype=np.float64)
    valid = (COMMON_GRID >= scene_grid.min()) & (COMMON_GRID <= scene_grid.max())
    if valid.any():
        out[valid] = np.interp(COMMON_GRID[valid], scene_grid, profile)
    return out


def load_scene_phi(scene_id: str) -> tuple[np.ndarray, np.ndarray] | None:
    """Returns (resampled_phi[K, 224], original_wavelengths) or None."""
    src = TOPIC_VIEWS_DIR / f"{scene_id}.json"
    if not src.is_file():
        return None
    payload = json.loads(src.read_text(encoding="utf-8"))
    phi = np.asarray(payload.get("topic_band_profiles", []), dtype=np.float64)
    wls = np.asarray(payload.get("wavelengths_nm", []), dtype=np.float64)
    if phi.size == 0 or wls.size == 0 or phi.shape[1] != wls.size:
        return None
    resampled = np.stack(
        [resample_to_common_grid(phi[k], wls) for k in range(phi.shape[0])]
    )
    return resampled, wls


def cosine_distance_matrix(M: np.ndarray) -> np.ndarray:
    """Cosine distance for rows of M; result is (n × n) symmetric with 0
    diagonal."""
    norms = np.linalg.norm(M, axis=1, keepdims=True)
    M_norm = M / np.where(norms < 1e-12, 1.0, norms)
    cos = np.clip(M_norm @ M_norm.T, -1.0, 1.0)
    return 1.0 - cos


def cluster_summary(
    labels: np.ndarray,
    member_metadata: list[dict],
    profiles: np.ndarray,
    cut: int,
) -> dict:
    """For one cut level, produce cluster centroids + members."""
    clusters: dict[int, dict] = {}
    for cluster_id in np.unique(labels):
        mask = labels == cluster_id
        members = [member_metadata[int(i)] for i in np.flatnonzero(mask)]
        member_profiles = profiles[mask]
        centroid = member_profiles.mean(axis=0)
        # Within-cluster cohesion: mean cosine to centroid
        cnorm = float(np.linalg.norm(centroid))
        cos_to_centroid: list[float] = []
        if cnorm > 1e-12:
            unit_c = centroid / cnorm
            for row in member_profiles:
                rn = float(np.linalg.norm(row))
                if rn > 1e-12:
                    cos_to_centroid.append(float(np.clip(row @ unit_c / rn, -1.0, 1.0)))
        clusters[int(cluster_id)] = {
            "cluster_id": int(cluster_id),
            "n_members": int(mask.sum()),
            "scene_set": sorted({m["scene_id"] for m in members}),
            "members": members,
            "centroid_profile_round6": [round(float(x), 6) for x in centroid],
            "within_cluster_mean_cosine_to_centroid": (
                round(float(np.mean(cos_to_centroid)), 6) if cos_to_centroid else None
            ),
            "within_cluster_min_cosine_to_centroid": (
                round(float(np.min(cos_to_centroid)), 6) if cos_to_centroid else None
            ),
        }
    return {
        "cut_level": int(cut),
        "n_clusters": int(len(clusters)),
        "clusters": [clusters[k] for k in sorted(clusters)],
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    profiles_per_scene: list[np.ndarray] = []
    member_metadata: list[dict] = []

    for scene_id in LABELLED_SCENES:
        loaded = load_scene_phi(scene_id)
        if loaded is None:
            print(f"[super_topics] {scene_id} skipped (no topic_views)", flush=True)
            continue
        resampled, wls = loaded
        profiles_per_scene.append(resampled)
        coverage = (
            f"{int(round(float(wls.min())))} – {int(round(float(wls.max())))} nm"
        )
        for k in range(resampled.shape[0]):
            member_metadata.append({
                "scene_id": scene_id,
                "topic_k": int(k),
                "scene_wavelength_coverage": coverage,
            })
        print(
            f"[super_topics] {scene_id}: K={resampled.shape[0]} "
            f"({coverage})",
            flush=True,
        )

    if not profiles_per_scene:
        print("[super_topics] no scenes loaded — aborting.", flush=True)
        return 1

    profiles = np.vstack(profiles_per_scene)
    n_total = profiles.shape[0]
    print(
        f"[super_topics] stacked {n_total} topics across "
        f"{len(profiles_per_scene)} scenes onto common 224-band grid",
        flush=True,
    )

    # Cosine distance + average linkage
    dist = cosine_distance_matrix(profiles)
    np.fill_diagonal(dist, 0.0)
    condensed = squareform(dist, checks=False)
    Z = linkage(condensed, method="average")

    # Multi-cut summary
    cuts: list[dict] = []
    for cut in CUT_LEVELS:
        labels = fcluster(Z, t=cut, criterion="maxclust")
        cuts.append(
            cluster_summary(np.asarray(labels), member_metadata, profiles, cut)
        )

    # Pairwise scene-vs-scene super-topic alignment counts
    # (how many times two scenes share a super-topic at K_super=8)
    cut8 = cuts[2]  # CUT_LEVELS[2] == 8
    scene_pair_counts: dict[str, dict[str, int]] = {}
    for cluster in cut8["clusters"]:
        scenes_in_cluster = cluster["scene_set"]
        for sa in scenes_in_cluster:
            for sb in scenes_in_cluster:
                if sa == sb:
                    continue
                scene_pair_counts.setdefault(sa, {}).setdefault(sb, 0)
                scene_pair_counts[sa][sb] += 1

    payload = {
        "n_topics_total": int(n_total),
        "n_scenes": len(profiles_per_scene),
        "scenes": [s for s in LABELLED_SCENES if (TOPIC_VIEWS_DIR / f"{s}.json").is_file()],
        "common_grid": {
            "low_nm": COMMON_LOW_NM,
            "high_nm": COMMON_HIGH_NM,
            "n_bands": COMMON_BANDS,
        },
        "linkage_method": "average",
        "distance": "cosine_on_common_grid",
        "linkage_matrix_round6": [
            [round(float(Z[i, 0]), 6), round(float(Z[i, 1]), 6),
             round(float(Z[i, 2]), 6), int(Z[i, 3])]
            for i in range(Z.shape[0])
        ],
        "cuts": cuts,
        "scene_pair_super_topic_overlap_at_cut8": scene_pair_counts,
        "members": member_metadata,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_hierarchical_super_topics v0.1",
    }

    out_path = OUTPUT_DIR / "super_topics.json"
    with out_path.open("w", encoding="utf-8") as h:
        json.dump(payload, h, separators=(",", ":"))

    print(
        f"[super_topics] wrote {out_path.relative_to(ROOT)}: "
        f"{n_total} topics into {len(CUT_LEVELS)} cut levels "
        f"(K={CUT_LEVELS}); biggest cluster at K=8 has "
        f"{max(c['n_members'] for c in cut8['clusters'])} members.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
