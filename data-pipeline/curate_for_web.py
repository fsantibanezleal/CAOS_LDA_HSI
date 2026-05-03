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
    ("build_eda_hidsag", "eda/hidsag"),
    ("build_topic_views", "topic_views"),
    ("build_topic_to_data", "topic_to_data"),
    ("build_topic_to_library", "topic_to_library"),
    ("build_spectral_browser", "spectral_browser"),
    ("build_spectral_density", "spectral_density"),
    ("build_validation_blocks", "validation_blocks"),
    ("build_wordifications", "wordifications"),
    ("build_spatial_validation", "spatial"),
    ("build_groupings", "groupings"),
    ("build_cross_method_agreement", "cross_method_agreement"),
    ("build_quantization_sensitivity", "quantization_sensitivity"),
    ("build_topic_model_variants", "topic_variants"),
    ("build_method_statistics_hidsag", "method_statistics_hidsag"),
    ("build_external_validation", "external_validation"),
    ("build_narratives", "narratives"),
    ("build_interpretability", "interpretability"),
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
    {
        "id": "hidsag_eda_per_subset",
        "description": "Per-subset HIDSAG measurement EDA: numeric variable distributions, Pearson and Spearman correlation matrices, dominant targets, modality band counts",
        "source_pattern": "eda/hidsag/<subset_code>.json",
    },
    {
        "id": "topic_to_library_top_n",
        "description": "Top-5 USGS / AVIRIS spectral-library samples per topic by cosine and SAM, plus the full topic x library distance matrices",
        "source_pattern": "topic_to_library/<scene>.{top_n_per_topic,topic_x_library_*}",
    },
    {
        "id": "spatial_validation_morans_I_iou",
        "description": "Moran's I of dominant-topic map, connected-component sizes per topic, and best-IoU label for each topic",
        "source_pattern": "spatial/<scene>.{morans_I_*,connected_components_per_topic,topic_label_iou}",
    },
    {
        "id": "wordifications_v1_v2_v3_grid",
        "description": "V1, V2, V3 recipes (V3 = band-bin ordered, the previously-missing Procemin recipe) at 3 quantization schemes (uniform, quantile, lloyd_max) x 3 Q values (8, 16, 32). Per-config vocab stats, document-length distribution, zero-token-doc rate, corpus-marginal entropy bits, top-20 tokens.",
        "source_pattern": "wordifications/<scene>_<recipe>_<scheme>_Q<q>.json",
    },
    {
        "id": "groupings_alternative_document_constructors",
        "description": "Alternative document constructors per scene: pixel baseline, SLIC at 500 / 2000 superpixels, fixed patches at 7 / 15 px, Felzenszwalb graph segmentation. Per-method group sizes, per-group mean spectra, between/within variance ratio, ARI / NMI / V-measure vs ground-truth label.",
        "source_pattern": "groupings/<method>/<scene>.json",
    },
    {
        "id": "cross_method_agreement_matrix",
        "description": "Pairwise ARI / NMI / V-measure matrix between every grouping method (label, dominant LDA topic, every method from build_groupings) per scene. Quantifies how different ways of grouping spectra agree or disagree.",
        "source_pattern": "cross_method_agreement/<scene>.{ari_matrix,nmi_matrix,v_measure_matrix}",
    },
    {
        "id": "quantization_sensitivity",
        "description": "Per-scene Hungarian-matched cosine and ARI of the canonical LDA fit vs probe fits over recipe x scheme x Q grid. Closes the validation block 'quantization-sensitivity'.",
        "source_pattern": "quantization_sensitivity/<scene>.{probes,summary}",
    },
    {
        "id": "topic_model_variants",
        "description": "Multi-library topic-model variants (sklearn online / sparse, NMF, gensim VB / multicore, tomotopy LDA / HDP / CTM, ProdLDA via Pyro). Each variant produces phi, theta, top_words, NPMI coherence, JS-MDS 2D coords and pairwise distance matrices.",
        "source_pattern": "topic_variants/<variant>/<scene>.json",
    },
    {
        "id": "method_statistics_hidsag",
        "description": "Per-HIDSAG-subset statistical enrichment of the existing measured-target benchmarks: bootstrap CI95, pairwise Wilcoxon signed-rank with Holm correction, Cliff's delta, Friedman chi-square + Nemenyi post-hoc on R2 and macro F1 across targets, plus per-target rank and win-rate.",
        "source_pattern": "method_statistics_hidsag/<subset>.json",
    },
    {
        "id": "external_validation_literature",
        "description": "Per-scene topic alignment to canonical literature signatures (kaolinite / alunite / hematite / calcite / chlorite / muscovite / illite-smectite / concrete / asphalt / vegetation) using AVIRIS-resampled cosine matching against the shipped USGS subset.",
        "source_pattern": "external_validation/<scene>_literature.json",
    },
    {
        "id": "external_validation_hidsag_methods",
        "description": "Per-HIDSAG-subset best-method headline (regression and classification) extracted from method_statistics_hidsag for the eventual web app's headline panel.",
        "source_pattern": "external_validation/<subset>_methods.json",
    },
    {
        "id": "narratives",
        "description": "Per-scene 'captures / separates / unites / enables' rollup across every method present in cross_method_agreement, fed by EDA, topic_views, topic_to_data, topic_to_library, spatial, validation_blocks, external_validation. The eventual web app's method comparison panel reads from here.",
        "source_pattern": "narratives/<scene>.json",
    },
    {
        "id": "interpretability_topic_cards",
        "description": "Per-topic interpretability card: peak wavelength, FWHM, top words at lambda 0.5/0.7, P(label|topic) top-3, KL to label prior, closest USGS top-3, closest literature category, spatial best-IoU label and connected components.",
        "source_pattern": "interpretability/<scene>/topic_cards.json",
    },
    {
        "id": "interpretability_band_cards",
        "description": "Per-band interpretability card: Fisher ratio, ANOVA F + p, mutual information vs label, contribution per topic.",
        "source_pattern": "interpretability/<scene>/band_cards.json",
    },
    {
        "id": "interpretability_document_cards",
        "description": "Per-top-document interpretability card: theta vector, dominant topic, label, location.",
        "source_pattern": "interpretability/<scene>/document_cards.json",
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
