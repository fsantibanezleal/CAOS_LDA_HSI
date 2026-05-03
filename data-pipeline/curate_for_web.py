"""Walk derived/ and write the contract manifest the web app reads.

Output: data/derived/manifests/index.json

Schema:
{
  "generated_at": "ISO8601",
  "git_sha": str | None,
  "builders": {builder_id: {version, files_count, total_bytes}},
  "scenes": [list of scene_ids],
  "artifacts": [
    {"id", "path", "format", "bytes", "schema?", "scene_id?"}
  ],
  "claims_allowed": [...]
}

The web app cross-checks this index before claiming any number.
Anything not in `claims_allowed` is forbidden in the UI.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR


MANIFEST_DIR = DERIVED_DIR / "manifests"
MANIFEST_PATH = MANIFEST_DIR / "index.json"

# Builders + the set of derived directories they own
BUILDER_DIRS = [
    ("build_eda_per_scene", "eda/per_scene"),
    ("build_topic_views", "topic_views"),
    ("build_topic_to_data", "topic_to_data"),
    ("build_spectral_browser", "spectral_browser"),
    ("build_spectral_density", "spectral_density"),
    ("build_validation_blocks", "validation_blocks"),
]

# What the web app is allowed to claim — must trace to one or more derived
# artifacts. Listed by topic so the eventual UI can render them by section.
CLAIMS_ALLOWED = [
    {
        "id": "class_distribution_per_scene",
        "description": "Per-class pixel counts and relative frequencies for each labelled scene",
        "source_pattern": "eda/per_scene/<scene>.class_distribution",
    },
    {
        "id": "imbalance_gini",
        "description": "Class imbalance Gini coefficient per scene",
        "source_pattern": "eda/per_scene/<scene>.imbalance_gini",
    },
    {
        "id": "class_mean_spectra_with_percentiles",
        "description": "Per-class mean and std spectra plus percentiles 5/25/50/75/95",
        "source_pattern": "eda/per_scene/<scene>.class_mean_spectra",
    },
    {
        "id": "class_distance_cosine_sam",
        "description": "Pairwise spectral cosine and SAM (radians) between class mean spectra",
        "source_pattern": "eda/per_scene/<scene>.class_distance_*",
    },
    {
        "id": "band_discriminative_power",
        "description": "Per-band Fisher ratio, ANOVA F-statistic with p-value, and mutual information vs label",
        "source_pattern": "eda/per_scene/<scene>.band_discriminative",
    },
    {
        "id": "silhouette_label_as_cluster",
        "description": "Silhouette score (cosine) using ground-truth labels as cluster ids",
        "source_pattern": "eda/per_scene/<scene>.silhouette_label_as_cluster_cosine",
    },
    {
        "id": "topic_count_K",
        "description": "K used for the canonical LDA fit per scene",
        "source_pattern": "topic_views/<scene>.topic_count",
    },
    {
        "id": "topic_prevalence",
        "description": "Mean theta over the corpus (LDAvis-faithful disc area)",
        "source_pattern": "topic_views/<scene>.topic_prevalence",
    },
    {
        "id": "top_words_with_relevance_lambda",
        "description": "Top-N words per topic ranked by relevance(lambda) using the actual corpus marginal P(w)",
        "source_pattern": "topic_views/<scene>.top_words_per_topic.lambda_*",
    },
    {
        "id": "topic_distance_matrices",
        "description": "Pairwise cosine, Jensen-Shannon, Hellinger, and top-15 word Jaccard between topics",
        "source_pattern": "topic_views/<scene>.topic_distance_*",
    },
    {
        "id": "intertopic_2d_js_mds",
        "description": "LDAvis-faithful 2D MDS on the Jensen-Shannon distance between phi rows",
        "source_pattern": "topic_views/<scene>.topic_intertopic_2d_js",
    },
    {
        "id": "intertopic_3d_js_mds",
        "description": "3D MDS on Jensen-Shannon — the rotatable inter-topic map the spec requires",
        "source_pattern": "topic_views/<scene>.topic_intertopic_3d_js",
    },
    {
        "id": "topic_pair_log_odds",
        "description": "log(P(w|topic_i)/P(w|topic_j)) ranked tokens for every ordered topic pair",
        "source_pattern": "topic_views/<scene>.topic_pair_log_odds",
    },
    {
        "id": "topic_perplexity",
        "description": "Held-out perplexity of the canonical LDA fit",
        "source_pattern": "topic_views/<scene>.perplexity",
    },
    {
        "id": "P_label_given_topic",
        "description": "Posterior label distribution among documents whose dominant topic is k (and the strict variant theta_k > 0.5)",
        "source_pattern": "topic_to_data/<scene>.p_label_given_topic_*",
    },
    {
        "id": "kl_to_label_prior_per_topic",
        "description": "KL divergence between P(label|topic) and the empirical label prior, per topic",
        "source_pattern": "topic_to_data/<scene>.kl_to_label_prior_per_topic",
    },
    {
        "id": "top_documents_per_topic",
        "description": "Top-50 documents by theta_k for every topic with their full theta vector and label",
        "source_pattern": "topic_to_data/<scene>.top_documents_per_topic",
    },
    {
        "id": "dominant_topic_map",
        "description": "H x W per-pixel argmax(theta) sentinel-uint8 map (255 = unlabelled / not sampled)",
        "source_pattern": "topic_to_data/<scene>.dominant_topic_map",
    },
    {
        "id": "theta_embedding_pca_2d_3d",
        "description": "PCA 2D and 3D coordinates of theta per document (sampled to 2k), coloured by label / dominant topic / confidence",
        "source_pattern": "topic_to_data/<scene>.theta_embedding_pca_*",
    },
    {
        "id": "spectral_browser",
        "description": "Sampled spectra binary (float32) plus per-document metadata for thousands-of-spectra rendering",
        "source_pattern": "spectral_browser/<scene>/{spectra.bin,metadata.json}",
    },
    {
        "id": "spectral_density_band_x_reflectance",
        "description": "Precomputed band x reflectance density heatmaps overall, per label, and per dominant topic",
        "source_pattern": "spectral_density/<scene>/{density_global.bin,density_by_label,density_by_topic,manifest.json}",
    },
    {
        "id": "validation_block_corpus_integrity",
        "description": "Document count, vocabulary size, document-length quartiles, zero-token-doc rate",
        "source_pattern": "validation_blocks/<scene>.blocks[corpus-integrity].metrics",
    },
    {
        "id": "validation_block_topic_stability",
        "description": "Hungarian-matched cosine and top-15 word Jaccard between LDA fits across 3 seeds",
        "source_pattern": "validation_blocks/<scene>.blocks[topic-stability].metrics",
    },
    {
        "id": "validation_block_supervision_association",
        "description": "ARI/NMI of K-means(theta) vs label, plus 5-fold logistic regression macro F1 on theta",
        "source_pattern": "validation_blocks/<scene>.blocks[supervision-association].metrics",
    },
]


def file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def collect_artifacts() -> list[dict]:
    artifacts: list[dict] = []
    for builder_id, sub_dir in BUILDER_DIRS:
        base = DERIVED_DIR / sub_dir
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(DERIVED_DIR)
            ext = path.suffix.lower()
            fmt = {
                ".json": "json",
                ".bin": "binary",
                ".npy": "numpy_npy",
            }.get(ext, "raw")
            entry = {
                "id": str(rel).replace("\\", "/"),
                "builder": builder_id,
                "path": "data/derived/" + str(rel).replace("\\", "/"),
                "format": fmt,
                "bytes": file_size(path),
            }
            # Try to capture scene_id from the path, using folders/files.
            parts = rel.parts
            # patterns: <sub>/<scene>.json or <sub>/<scene>/<file>
            if len(parts) >= 2:
                guess = parts[1]
                if guess.endswith(".json"):
                    guess = guess[:-5]
                entry["scene_id"] = guess
            artifacts.append(entry)
    return artifacts


def collect_builder_summary(artifacts: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for art in artifacts:
        b = art["builder"]
        out.setdefault(b, {"files_count": 0, "total_bytes": 0})
        out[b]["files_count"] += 1
        out[b]["total_bytes"] += art["bytes"]
    return out


def collect_scenes(artifacts: list[dict]) -> list[str]:
    return sorted({a["scene_id"] for a in artifacts if "scene_id" in a})


def get_git_sha() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.stdout.strip()
    except Exception:
        return None


def main() -> int:
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    artifacts = collect_artifacts()
    builders = collect_builder_summary(artifacts)
    scenes = collect_scenes(artifacts)
    git_sha = get_git_sha()

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "git_sha": git_sha,
        "builders": builders,
        "scenes": scenes,
        "artifacts": artifacts,
        "claims_allowed": CLAIMS_ALLOWED,
        "rule": "Any number rendered by the web app must trace to one of these claims_allowed entries; anything else is forbidden in the UI.",
    }
    with MANIFEST_PATH.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, separators=(",", ":"))

    total_bytes = sum(a["bytes"] for a in artifacts)
    print(
        f"[curate] manifest: {len(artifacts)} artifacts, "
        f"{len(scenes)} scenes, "
        f"{len(builders)} builders, "
        f"{total_bytes / 1024 / 1024:.2f} MB derived total -> "
        f"{MANIFEST_PATH.relative_to(ROOT)}",
        flush=True,
    )
    print(f"[curate] git_sha: {git_sha}")
    print(f"[curate] claims_allowed: {len(CLAIMS_ALLOWED)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
