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
    # ---- precompute layer ---------------------------------------------
    ("build_eda_per_scene", "eda/per_scene"),
    ("build_eda_hidsag", "eda/hidsag"),
    ("build_topic_views", "topic_views"),
    ("build_topic_to_data", "topic_to_data"),
    ("build_topic_to_library", "topic_to_library"),
    ("build_spectral_browser", "spectral_browser"),
    ("build_spectral_density", "spectral_density"),
    ("build_validation_blocks", "validation_blocks"),
    ("build_wordifications", "wordifications"),
    # build_wordifications_v4plus shares the wordifications/ output
    # directory with V1/V2/V3, so it is *not* listed here to avoid
    # double-counting. The recipe ids V4 / V5 / V10 are surfaced via
    # claims_allowed below.
    ("build_spatial_validation", "spatial"),
    ("build_groupings", "groupings"),
    ("build_cross_method_agreement", "cross_method_agreement"),
    ("build_quantization_sensitivity", "quantization_sensitivity"),
    ("build_topic_model_variants", "topic_variants"),
    ("build_method_statistics_hidsag", "method_statistics_hidsag"),
    ("build_external_validation", "external_validation"),
    ("build_narratives", "narratives"),
    ("build_interpretability", "interpretability"),
    ("build_representations", "representations"),
    ("build_lda_sweep", "lda_sweep"),
    ("build_dmr_lda_hidsag", "topic_variants/dmr_lda_hidsag"),
    ("build_optuna_hyperparam_search", "lda_hyperparam_search"),
    ("build_linear_probe_panel", "linear_probe_panel"),
    ("build_mutual_information", "mutual_information"),
    ("build_rate_distortion_curve", "rate_distortion_curve"),
    ("build_topic_routed_classifier", "topic_routed_classifier"),
    ("build_embedded_baseline", "embedded_baseline"),
    ("build_topic_stability", "topic_stability"),
    ("build_topic_to_usgs_v7", "topic_to_usgs_v7"),
    ("build_topic_anomaly", "topic_anomaly"),
    ("build_topic_spatial_continuous", "topic_spatial_continuous"),
    ("build_topic_spatial_full", "topic_spatial_full"),
    ("build_endmember_baseline", "endmember_baseline"),
    ("build_cross_scene_transfer", "cross_scene_transfer"),
    ("build_bayesian_classification_labelled", "method_statistics_labelled"),
    ("build_hierarchical_super_topics", "super_topics"),
    ("build_hidsag_cross_preprocessing_stability", "hidsag_cross_preprocessing_stability"),
    # ---- pre-precompute ("foundational") layer ------------------------
    # These directories pre-date the precompute waves but their outputs
    # are still served by the public API (subset cards, dataset
    # inventory, exploration views, …). Listing them here lets the
    # manifest auditor reach zero orphans.
    ("build_real_samples", "real"),
    ("build_field_samples", "field"),
    ("build_spectral_library_samples", "spectral"),
    ("build_analysis_payload", "analysis"),
    ("build_corpus_previews", "corpus"),
    ("build_segmentation_baselines", "baselines"),
    ("build_local_inventory", "core/local_dataset_inventory.json"),
    ("run_local_core_benchmarks", "core/local_core_benchmarks.json"),
    ("build_method_statistics", "core/method_statistics.json"),
    ("build_exploration_views", "core/exploration_views.json"),
    ("build_hidsag_curated_subset", "core/hidsag_curated_subset.json"),
    ("build_hidsag_band_quality", "core/hidsag_band_quality.json"),
    ("run_hidsag_preprocessing_sensitivity", "core/hidsag_preprocessing_sensitivity.json"),
    ("build_hidsag_region_documents", "core/hidsag_region_documents.json"),
    ("fetch_hidsag", "core/hidsag_subset_inventory.json"),
    ("build_subset_cards", "subsets"),
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
    {
        "id": "representations",
        "description": "Per-method spectral representations: PCA at 3/10/30 components, NMF at 8/20, ICA at 10, dense autoencoder at latent dim 8. Each method: latent features (in local), reconstruction RMSE, K-means(latent) ARI/NMI vs label, PCA-3D scatter sampled to 2k points.",
        "source_pattern": "representations/<method>/<scene>.json",
    },
    {
        "id": "lda_sweep",
        "description": "K x seed grid (K in {4, 6, 8, 10, 12, 16}, 5 seeds) on canonical band-frequency recipe. Per-K: perplexity train/test, NPMI coherence, topic diversity, Hungarian-matched cosine stability across seeds. Recommends K maximising (-perplexity_norm + npmi + matched_cos).",
        "source_pattern": "lda_sweep/<scene>.json",
    },
    {
        "id": "dmr_lda_hidsag",
        "description": "Dirichlet-Multinomial Regression LDA (Mimno-McCallum 2008) per HIDSAG subset using measurement-tag covariates. Per-covariate topic prior, plus the standard phi/theta/top_words/perplexity. Natural geometallurgical extension of plain LDA on Procemin-style HIDSAG samples.",
        "source_pattern": "topic_variants/dmr_lda_hidsag/<subset>.json",
    },
    {
        "id": "bayesian_method_comparison",
        "description": "PyMC hierarchical normal model pooling per-target per-method R^2 (regression) or macro-F1 (classification) across all HIDSAG subsets. Reports per-method posterior mean + HDI94 + pairwise P(mu_a > mu_b). Replaces the frequentist Friedman / Nemenyi reading with a Bayesian dominance probability the eventual web app can render directly.",
        "source_pattern": "method_statistics_hidsag/cross_<task>_bayesian.json",
    },
    {
        "id": "lda_hyperparam_search",
        "description": "Optuna TPE Bayesian hyperparameter search per labelled scene over (K in [4, 16], alpha log-uniform, eta log-uniform). Objective = c_v(top_15) - 0.001 * perplexity_test. 30 trials per scene. Replaces the failed octis benchmarking route.",
        "source_pattern": "lda_hyperparam_search/<scene>.json",
    },
    {
        "id": "linear_probe_panel",
        "description": "B-1 (Addendum B): logistic-regression linear probe macro F1 / accuracy / balanced accuracy with bootstrap CI95 across compressions (theta vs PCA-K, NMF-K, ICA-K, dense-AE-K). 5-fold StratifiedKFold; pairwise Wilcoxon-Holm + Cliff's delta against theta. Fair-baseline reading on Axis C (downstream task) of the multi-axis topic evaluation framework.",
        "source_pattern": "linear_probe_panel/<scene>.json",
    },
    {
        "id": "mutual_information",
        "description": "B-4 (Addendum B): mutual information MI(theta; label) and MI(other K-dim compression; label) per labelled scene; for HIDSAG subsets with DMR-LDA fits, MI(theta; numeric_target) per measurement. Per-feature MI vector, sum, max, label entropy and joint clip. Information-theoretic axis (D) of the framework.",
        "source_pattern": "mutual_information/<scene>.json | mutual_information/hidsag/<subset>.json",
    },
    {
        "id": "rate_distortion_curve",
        "description": "B-2 (Addendum B): K -> RMSE curves on the canonical band-frequency document-term matrix for LDA, NMF, PCA on a held-out 20%% test split. Reconstruction quality axis (G) of the framework — the fair K-dim reconstruction comparison.",
        "source_pattern": "rate_distortion_curve/<scene>.json",
    },
    {
        "id": "topic_routed_classifier",
        "description": "B-3 (Addendum B): per-topic specialists (logistic regression on raw spectrum, sample_weight = theta_d(k)) with soft theta gating at test time. Compared against raw_logistic, theta_logistic (naive), pca_K_logistic, and topic_routed_hard. 5-fold StratifiedKFold macro F1 with bootstrap CI95. The embedded / hierarchical use of theta the user specified — not modelling on theta directly.",
        "source_pattern": "topic_routed_classifier/<scene>.json",
    },
    {
        "id": "embedded_baseline",
        "description": "B-5 (Addendum B Axis C-3): does theta add signal beyond PCA at the same K? Compares logistic regression on theta-only / PCA_K-only / [theta | PCA_K] concatenation / raw spectrum on labelled scenes. 5-fold StratifiedKFold macro F1 with bootstrap CI95; Wilcoxon-Holm + Cliff's delta on the (concat - PCA) pair.",
        "source_pattern": "embedded_baseline/<scene>.json",
    },
    {
        "id": "topic_stability",
        "description": "B-6 (Addendum B Axis A): topic stability via Hungarian-matched cosine across N_SEEDS=7 LDA refits at the canonical K per scene. Per-topic median / min / std vs seed 0; full N x N seed-pair agreement matrix; off-diagonal scene-level summary. Greene-O'Callaghan-Cunningham 2014 / ACM CSUR 2024 stability protocol.",
        "source_pattern": "topic_stability/<scene>.json",
    },
    {
        "id": "topic_to_usgs_v7",
        "description": "B-7 (Addendum B Axis B): topic ↔ full USGS Spectral Library v7 (AVIRIS-Classic 1997 convolution, 2450 spectra across 7 chapters: artificial / coatings / liquids / minerals / organics / soils / vegetation). Per-topic top-20 nearest USGS spectra by cosine and SAM, plus best-match-per-chapter and chapter histogram of the top-50.",
        "source_pattern": "topic_to_usgs_v7/<scene>.json",
    },
    {
        "id": "topic_anomaly",
        "description": "B-9 (Addendum B Axis B): topic-anomaly indicators 1 - max(theta) (softmax confidence) and reconstruction NLL = -sum_w doc_w * log((theta @ phi)_w). Per-class median / p95 + Spearman correlation between each anomaly score and theta_logistic misclassification.",
        "source_pattern": "topic_anomaly/<scene>.json",
    },
    {
        "id": "topic_spatial_continuous",
        "description": "B-10 (Addendum B Axis B): Moran's I and Geary's C on the *continuous* per-topic theta_k abundance map with 4-neighbour rook contiguity, complementing the categorical-map Moran's I in build_spatial_validation. Computed on the canonical 220-per-class subsampled positions (matches other builders' theta basis).",
        "source_pattern": "topic_spatial_continuous/<scene>.json",
    },
    {
        "id": "topic_spatial_full",
        "description": "B-10 follow-up: Moran's I, Geary's C, and Boundary Displacement Error on a *full-pixel* refit of LDA. Each scene's LDA is refit at the canonical K on every labelled pixel (not the 220-per-class subsample) so the abundance maps are dense and BDE has contiguous boundaries. Reveals that KSC's 'topic collapse' (subsampled mean Moran's I = 0.064) is a pipeline artifact of the stratified sampling — the full-pixel refit recovers spatially-coherent topics (mean I = 0.837). The topic basis differs slightly from the canonical fit, so this reading is kept side by side with topic_spatial_continuous rather than replacing it.",
        "source_pattern": "topic_spatial_full/<scene>.json",
    },
    {
        "id": "endmember_baseline",
        "description": "B-11 (Addendum B Axis G + Axis B): NFINDR (Winter 1999, custom implementation since pysptools' NFINDR is broken on current scipy) and ATGP (Ren-Chang 2003) endmember extractors + scipy.optimize.nnls unmixing with sum-to-one penalty. Per-endmember best-matched topic from canonical LDA fit; reconstruction RMSE on the labelled-pixel subset. Fair HSI baseline alongside NMF and LDA.",
        "source_pattern": "endmember_baseline/<scene>.json",
    },
    {
        "id": "cross_scene_transfer",
        "description": "B-8 (Addendum B Axis E): cross-scene topic transfer via fit-on-A-infer-on-B on a common AVIRIS-1997 wavelength grid (400-2500 nm, 224 bands). Five AVIRIS-class scenes (Pavia U excluded as ROSIS) — Indian Pines, Salinas, Salinas-A, KSC, Botswana — resampled to the shared grid; per-source LDA at canonical K; per-target 5-fold StratifiedKFold theta-logistic macro F1. The diagonal is the within-scene baseline; off-diagonals quantify how transferable the source's topic structure is.",
        "source_pattern": "cross_scene_transfer/transfer_matrix.json",
    },
    {
        "id": "wordifications_v4_v5_v10",
        "description": "Master plan §7 wordification recipes V4 (1st-derivative bin), V5 (2nd-derivative bin), V10 (band-group VNIR/SWIR-1/SWIR-2 + bin) sampled across the same scheme × Q grid as V1/V2/V3 (uniform/quantile/lloyd_max × Q in {8,16,32}). 162 new wordification configs across 6 labelled scenes, slotted directly into the existing /api/wordifications/{scene}/{recipe}/{scheme}/{q} endpoint.",
        "source_pattern": "wordifications/<scene>_V4_<scheme>_Q<q>.json | wordifications/<scene>_V5_<scheme>_Q<q>.json | wordifications/<scene>_V10_<scheme>_Q<q>.json",
    },
    {
        "id": "wordifications_v6_v8_v9_v12",
        "description": "Master plan §7 wordification recipes V6 (db4 wavelet-coefficient bin via pywavelets, level=4), V8 (NFINDR endmember-fraction bin via NNLS+sum-to-one, K endmembers from build_endmember_baseline), V9 (region-token via Felzenszwalb partitions + per-region SAM-quantised), V12 (GMM-token via sklearn.mixture.GaussianMixture(Q) on per-band intensities). 216 new wordification configs across 6 labelled scenes (4 recipes × 3 schemes × 3 Q values × 6 scenes), reachable via the existing /api/wordifications/{scene}/{recipe}/{scheme}/{q} endpoint.",
        "source_pattern": "wordifications/<scene>_V6_<scheme>_Q<q>.json | wordifications/<scene>_V8_<scheme>_Q<q>.json | wordifications/<scene>_V9_<scheme>_Q<q>.json | wordifications/<scene>_V12_<scheme>_Q<q>.json",
    },
    {
        "id": "wordifications_v7_v11",
        "description": "Master plan §7 wordification recipes V7 (absorption-feature triplet — own convex-hull continuum-removal extractor, top-N features per spectrum quantised on (centroid_bucket, depth_bin, area_bin)) and V11 (codebook-VQ via nanopq.PQ(M=4, Ks=Q) — product quantisation partitions each B-band spectrum into 4 sub-vectors and k-means-encodes each independently). Closes the master plan §7 wordification roster (V1..V12 minus V11 and V7 originally — both shipped now). 108 new configs across 6 labelled scenes (2 recipes × 3 schemes × 3 Q × 6 scenes).",
        "source_pattern": "wordifications/<scene>_V7_<scheme>_Q<q>.json | wordifications/<scene>_V11_<scheme>_Q<q>.json",
    },
    {
        "id": "bayesian_classification_labelled",
        "description": "Bayesian hierarchical normal model on labelled-scene per-fold macro F1 across raw_logistic / theta_logistic / pca_K_logistic / topic_routed_hard / topic_routed_soft. 30 observations per method (6 scenes × 5 folds); pools across scenes via offset_scene[s], folds via fold_re[f]. Reports per-method posterior mean + HDI94 + pairwise P(mu_a > mu_b). Closes the follow-up from B-3: include the soft-routed embedded readout in a Bayesian dominance reading on labelled scenes (the existing cross_classification_bayesian is HIDSAG-only and predates B-3).",
        "source_pattern": "method_statistics_labelled/cross_classification_bayesian.json",
    },
]


def file_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


FORMAT_BY_EXT = {
    ".json": "json",
    ".bin": "binary",
    ".npy": "numpy_npy",
    ".npz": "numpy_npz",
    ".png": "image_png",
}


def _make_entry(path: Path, builder_id: str) -> dict:
    rel = path.relative_to(DERIVED_DIR)
    ext = path.suffix.lower()
    entry = {
        "id": str(rel).replace("\\", "/"),
        "builder": builder_id,
        "path": "data/derived/" + str(rel).replace("\\", "/"),
        "format": FORMAT_BY_EXT.get(ext, "raw"),
        "bytes": file_size(path),
    }
    parts = rel.parts
    if len(parts) >= 2:
        guess = parts[1]
        if guess.endswith(".json"):
            guess = guess[:-5]
        entry["scene_id"] = guess
    return entry


def collect_artifacts() -> list[dict]:
    artifacts: list[dict] = []
    seen_paths: set[str] = set()
    for builder_id, sub_path in BUILDER_DIRS:
        base = DERIVED_DIR / sub_path
        if base.is_file():
            entry = _make_entry(base, builder_id)
            if entry["path"] not in seen_paths:
                artifacts.append(entry)
                seen_paths.add(entry["path"])
            continue
        if not base.is_dir():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file():
                continue
            entry = _make_entry(path, builder_id)
            if entry["path"] in seen_paths:
                continue
            artifacts.append(entry)
            seen_paths.add(entry["path"])
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
