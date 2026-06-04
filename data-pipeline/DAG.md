# Data-pipeline Build DAG

**Status**: source-of-truth build order for the `data-pipeline/` builders
(issue #589 Tier 2). Before this file there was no single declaration of
the build order; the dependency edges were implicit in each builder's
`np.load` / `json.load` / `sp.load_npz` calls. This document makes them
explicit.

Every edge below was derived **only from code evidence** — a producer
`A → B` edge exists when builder `B` reads a `data/derived/...` or
`data/local/...` file that builder `A` writes, confirmed by matching the
actual path string in `A`'s output and `B`'s input. Reading a raw scene
through `research_core.raw_scenes.load_scene` is a dependency on the
`fetch_*` that downloaded the scene, **not** on another `build_*`.
Importing `research_core.*` is a library import, not a DAG edge.

## Convention

- Each node is a Python file in `data-pipeline/`.
- An arrow `A → B` means **B reads files written by A**, so A must run
  before B.
- Most builders write under `data/derived/...` (git-tracked, served by
  the web app). Several also write heavy intermediate artefacts under
  `data/local/...` (git-ignored: `phi.npy`, `theta.npy`, `doc_term.npz`,
  segmentation `assignment.bin`, latent `features.npy`). Both kinds of
  output create real edges.
- `data/raw/...` is produced by the `fetch_*` scripts only.

## Stages (topological build order)

Run stages strictly in order. Within a stage, builders are mutually
independent and may run in any order / in parallel, **except** for the
two cross-stage exceptions noted under Stage 2.

### Stage 0 — Fetch (raw acquisition)

Populate `data/raw/`. Run once per machine; re-run only when a new scene
or library is added. No derived-data inputs.

```
fetch_public_hsi.py                fetch_public_msi.py
fetch_public_spectral_libraries.py fetch_public_unmixing.py
fetch_hidsag.py                    fetch_ecostress_metadata.py
```

### Stage 1 — Core / foundational builders

Read raw scenes (and packaged manifests) only; produce the shared
artefacts the rest of the pipeline consumes. Mutually independent.

```
build_local_inventory.py          → core/local_dataset_inventory.json
build_method_statistics.py        → core/method_statistics.json
build_exploration_views.py        → core/exploration_views.json
build_hidsag_curated_subset.py    → core/hidsag_curated_subset.json
build_eda_per_scene.py            → eda/per_scene/<scene>.json
build_real_samples.py             → real/real_samples.json
build_field_samples.py            → field/field_samples.json
build_spectral_library_samples.py → spectral/library_samples.json
build_segmentation_baselines.py   → baselines/segmentation_baselines.json
build_groupings.py                → groupings/ + data/local/groupings/<algo>/<scene>/assignment.bin
build_representations.py          → representations/ + data/local/representations/<method>/<scene>/features.npy
build_topic_views.py              → topic_views/<scene>.json + data/local/lda_fits/<scene>/{phi,theta,corpus_marginal,sample_*}.npy
build_neural_topic_models.py      → topic_variants/<variant>/ + data/local/topic_variants/<variant>/<scene>/
build_topic_model_variants.py     → topic_variants/<variant>/ + data/local/topic_variants/<variant>/<scene>/
build_band_masked_topic_models.py → band_masks/{index,summary}.json   (soft dep — see note below)
build_lda_sweep.py                → lda_sweep/
build_optuna_hyperparam_search.py → lda_hyperparam_search/
build_rate_distortion_curve.py    → rate_distortion_curve/
build_hidsag_band_quality.py *    → core/hidsag_band_quality.json   (* reads core/hidsag_curated_subset.json → see Stage 2 note)
build_classical_seed_stability.py → classical_seed_stability/
build_deep_seed_stability.py      → deep_seed_stability/
build_deep_anomaly.py             → deep_anomaly/
build_neural_topic_seed_stability.py → neural_topic_seed_stability/
run_hidsag_preprocessing_sensitivity.py → core/hidsag_preprocessing_sensitivity.json
                                          (module-loads run_local_core_benchmarks.py)
```

The twelve **wordification** builders also belong logically to Stage 1
(they read raw scenes and write the corpus the V-sweep consumes), with
one exception — `build_wordifications_v6plus.py` additionally reads
`endmember_baseline/` and `data/local/groupings/`, so it must run later
(see Stage 2). All write
`data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/{doc_term.npz, vocab.json}`:

```
build_wordifications.py        → V1, V2, V3
build_wordifications_v4plus.py → V4, V5, V10
build_wordifications_v7v11.py  → V7, V11
build_wordifications_v13.py    → V13 (VQ-VAE codebook)
build_wordifications_v14.py    → V14 (CWT-Morlet)
build_wordifications_v15.py    → V15 (spectral indices)
build_wordifications_v16.py    → V16 (HyperSIGMA, scaffolded)
build_wordifications_v17.py    → V17 (sparse-coding dictionary)
build_wordifications_v18.py    → V18 (graph-Laplacian eigenvectors)
build_wordifications_v19.py    → V19 (UMAP coordinates)
build_wordifications_v20.py    → V20 (MI-weighted bands)
build_wordifications_v6plus.py → V6, V8, V9, V12  (Stage 2 — see note)
build_wordifications_all.py    → orchestrator: imports _v4plus/_v6plus/_v7v11 (no own output)
```

### Stage 2 — First-order consumers

Read Stage-1 artefacts.

```
# topic_views / lda_fits consumers
build_topic_to_data.py          ← topic_views.py        (local/lda_fits/<scene>/theta.npy)
build_topic_to_library.py       ← topic_views.py + spectral_library_samples.py
build_topic_to_usgs_v7.py       ← topic_views.py
build_embedded_baseline.py      ← topic_views.py        (local/lda_fits/<scene>/phi.npy)
build_endmember_baseline.py     ← topic_views.py        (local/lda_fits/<scene>/phi.npy + topic_views/)
build_topic_routed_classifier.py← topic_views.py        (local/lda_fits/<scene>/phi.npy)
build_topic_routed_deep_gate.py ← topic_views.py + representations.py
build_cross_scene_transfer.py   ← topic_views.py
build_spectral_browser.py       ← topic_views.py
build_spectral_density.py       ← topic_views.py
build_topic_anomaly.py          ← topic_views.py
build_topic_spatial_full.py     ← topic_views.py
build_topic_stability.py        ← topic_views.py
build_hierarchical_super_topics.py ← topic_views.py
build_b12_llm_tea_leaves.py     ← topic_views.py
build_linear_probe_panel.py     ← topic_views.py + representations.py
build_neural_topic_comparison.py← topic_views.py + neural_topic_models.py / topic_model_variants.py
build_quantization_sensitivity.py ← topic_views.py + wordifications*    (local/lda_fits + corpus)

# real/spectral consumers
build_analysis_payload.py       ← real_samples.py + spectral_library_samples.py
build_corpus_previews.py        ← real_samples.py + spectral_library_samples.py

# hidsag chain
build_hidsag_region_documents.py← hidsag_curated_subset.py
build_eda_hidsag.py             ← hidsag_curated_subset.py + hidsag_region_documents.py
build_dmr_lda_hidsag.py         ← hidsag_curated_subset.py
build_band_masked_topic_models_hidsag.py ← hidsag_curated_subset.py
run_local_core_benchmarks.py    ← hidsag_curated_subset.py + hidsag_region_documents.py + spectral_library_samples.py
build_v_sweep_hidsag.py         ← hidsag_region_documents.py   (module-loads the 4 corpus builders)

# preprocessing-sensitivity chain
build_hidsag_cross_preprocessing_stability.py ← run_hidsag_preprocessing_sensitivity.py

# wordification recipe that depends on Stage-1 baselines (cross-stage exception)
build_wordifications_v6plus.py  ← endmember_baseline.py + groupings.py
```

**Cross-stage exceptions** (the two cases where Stage 1 is not a clean
parallel layer):

1. `build_wordifications_v6plus.py` (V6/V8/V9/V12) reads
   `endmember_baseline/<scene>.json` and
   `data/local/groupings/felzenszwalb/<scene>/assignment.bin`. It must
   run **after** `build_endmember_baseline.py` and `build_groupings.py`.
2. `build_hidsag_band_quality.py` reads
   `core/hidsag_curated_subset.json`, so it must run **after**
   `build_hidsag_curated_subset.py`.

**Soft (optional, graceful-fallback) edge** —
`build_interpretability.py → build_band_masked_topic_models.py`: the
`top_50_fisher` mask variant reads
`data/derived/interpretability/<scene>/band_cards.json` (written by
`build_interpretability`, Stage 6). The read is guarded by
`if not band_cards_path.exists(): return <all-bands mask>`, so a build
without interpretability still completes (that one mask variant falls
back to keeping all bands). This is the only back-edge in the graph: a
*complete* `top_50_fisher` mask requires `build_interpretability` to have
run in a prior cycle. To get the fully-populated mask, re-run
`build_band_masked_topic_models.py` after `build_interpretability.py`.

### Stage 3 — Second-order consumers

```
build_band_mask_canonical_comparison.py ← band_masked_topic_models.py + topic_to_data.py + topic_views.py
build_cross_method_agreement.py ← topic_to_data.py + groupings.py
build_spatial_validation.py     ← topic_to_data.py
build_topic_spatial_continuous.py ← topic_to_data.py + topic_views.py
build_hidsag_topic_measurements.py ← band_masked_topic_models_hidsag.py
build_method_statistics_hidsag.py ← run_local_core_benchmarks.py
build_bayesian_method_comparison.py ← run_local_core_benchmarks.py + method_statistics_hidsag.py
build_mutual_information.py      ← topic_views.py + representations.py + hidsag_curated_subset.py
                                  + neural_topic_models.py / topic_model_variants.py / dmr_lda_hidsag.py
build_bayesian_classification_labelled.py ← topic_routed_classifier.py
build_bayesian_classification_deep.py     ← topic_routed_deep_gate.py
build_subset_cards.py           ← corpus_previews.py (+ real_samples / spectral / field / manifests)
build_v_sweep_hidsag_f7.py      ← hidsag_region_documents.py + v_sweep_hidsag.py
```

### Stage 4 — V-sweep canonical fit + corpus-only backbones

All read the wordification corpus from Stage 1
(`data/local/wordifications/<recipe>/uniform_Q<q>/<scene>/doc_term.npz`).
`build_v_sweep_canonical_fit.py` additionally writes the LDA fits that
the Stage-5 F-axis builders consume.

```
build_v_sweep_canonical_fit.py  ← wordifications*   → data/local/v_sweep/lda_fits/ + v_sweep/topic_views/
build_v_sweep_f1_classification.py ← wordifications* → v_sweep/f1_per_fold/ + v_sweep/f1_win_matrix.json
build_v_sweep_hdp.py            ← wordifications*   → v_sweep/hdp_backbone/
build_v_sweep_prodlda_backbone.py ← wordifications* → v_sweep/prodlda_backbone/   (module-loads neural_topic_models)
build_v_sweep_backbones_f7.py   ← wordifications*   → v_sweep/backbones_f7/        (module-loads neural_topic_models)
build_v_sweep_etm_backbone.py   ← wordifications*   → v_sweep/etm_backbone/        (module-loads neural_topic_models + prodlda_backbone)
build_v_sweep_f17_cross_scene.py← wordifications*   → v_sweep/f17_cross_scene/
build_v_sweep_f18_reliability.py← wordifications*   → v_sweep/f18_reliability/
```

### Stage 5 — V-sweep F-axes that read the canonical fits

Read `data/local/v_sweep/lda_fits/` from `build_v_sweep_canonical_fit.py`
(the corpus-reading ones also read the Stage-1 wordifications).

```
build_v_sweep_f1_bayesian.py    ← v_sweep_f1_classification.py   (v_sweep/f1_per_fold/)
build_v_sweep_f1_bootstrap.py   ← v_sweep_f1_classification.py   (v_sweep/f1_per_fold/)
build_v_sweep_f2_coherence.py   ← v_sweep_canonical_fit.py + wordifications*
build_v_sweep_f7_topic_to_label.py ← v_sweep_canonical_fit.py
build_v_sweep_f14_repetitiveness.py ← v_sweep_canonical_fit.py
build_v_sweep_counterfactual.py ← v_sweep_canonical_fit.py + wordifications*
build_v_sweep_f13_shap.py       ← v_sweep_canonical_fit.py + wordifications*
build_v_sweep_f15_llm_alignment.py ← v_sweep_canonical_fit.py + wordifications*
build_v_sweep_f15_self_judge.py ← v_sweep_canonical_fit.py + wordifications*
build_b12_self_judge.py         ← topic_views.py + v_sweep_canonical_fit.py
audit_citation_openalex.py      → v_sweep/citation_audit.json   (audit, not a build edge)
```

### Stage 6 — Aggregators (read many derived artefacts)

```
build_external_validation.py ← topic_views.py + spectral_library_samples.py + method_statistics_hidsag.py
build_validation_blocks.py   ← topic_views.py + quantization_sensitivity.py + topic_to_library.py
                               + topic_to_usgs_v7.py + cross_method_agreement.py
build_interpretability.py    ← eda_per_scene.py + topic_views.py + topic_to_data.py
                               + topic_to_library.py + spatial_validation.py + external_validation.py
build_narratives.py          ← eda_per_scene.py + topic_views.py + topic_to_data.py + topic_to_library.py
                               + spatial_validation.py + cross_method_agreement.py + groupings.py
                               + validation_blocks.py + external_validation.py
build_analysis_payload.py    ← real_samples.py + spectral_library_samples.py   (also serviceable from Stage 2)
```

### Stage 7 — Web-app curation (must run last)

`curate_for_web.py` rglobs the whole `data/derived/` tree (its
`BUILDER_DIRS` registry maps every builder to its subdir) and emits the
manifest the FastAPI app serves.

```
curate_for_web.py            → data/derived/manifests/index.json
```

## Dependency edges

Confirmed producer → consumer edges. `local/` paths are git-ignored
intermediates; `derived/` paths are git-tracked. Wordification edges are
collapsed into the `build_wordifications*` group (all twelve recipe
builders write into `data/local/wordifications/` and every V-sweep
corpus consumer reads that tree; `build_v_sweep_f17_cross_scene` reads
only V2/V10/V11/V14, the others read V1..V20 or V1..V15).

| Producer → Consumer | Shared artefact (path) |
|---|---|
| build_topic_views → build_topic_to_data | data/local/lda_fits/&lt;scene&gt;/theta.npy |
| build_topic_views → build_topic_to_library | data/derived/topic_views/&lt;scene&gt;.json |
| build_topic_views → build_topic_to_usgs_v7 | data/derived/topic_views/&lt;scene&gt;.json |
| build_topic_views → build_embedded_baseline | data/local/lda_fits/&lt;scene&gt;/phi.npy |
| build_topic_views → build_endmember_baseline | data/local/lda_fits/&lt;scene&gt;/phi.npy + data/derived/topic_views/ |
| build_topic_views → build_topic_routed_classifier | data/local/lda_fits/&lt;scene&gt;/phi.npy |
| build_topic_views → build_topic_routed_deep_gate | data/local/lda_fits/&lt;scene&gt;/theta.npy |
| build_topic_views → build_cross_scene_transfer | data/local/lda_fits/ |
| build_topic_views → build_spectral_browser | data/local/lda_fits/&lt;scene&gt;/{theta,sample_pixel_indices}.npy |
| build_topic_views → build_spectral_density | data/local/lda_fits/ |
| build_topic_views → build_topic_anomaly | data/local/lda_fits/ |
| build_topic_views → build_topic_spatial_full | data/local/lda_fits/ |
| build_topic_views → build_topic_spatial_continuous | data/local/lda_fits/ |
| build_topic_views → build_topic_stability | data/local/lda_fits/ |
| build_topic_views → build_hierarchical_super_topics | data/derived/topic_views/&lt;scene&gt;.json |
| build_topic_views → build_b12_llm_tea_leaves | data/derived/topic_views/ |
| build_topic_views → build_b12_self_judge | data/derived/topic_views/ |
| build_topic_views → build_linear_probe_panel | data/local/lda_fits/ |
| build_topic_views → build_mutual_information | data/local/lda_fits/&lt;scene&gt;/{theta.npy,vocab.json} |
| build_topic_views → build_neural_topic_comparison | data/local/lda_fits/&lt;scene&gt;/{vocab.json,sample_*.npy,corpus_marginal.npy} |
| build_topic_views → build_quantization_sensitivity | data/local/lda_fits/&lt;scene&gt;/{phi,theta}.npy |
| build_topic_views → build_band_mask_canonical_comparison | data/local/lda_fits/&lt;scene&gt;/phi.npy |
| build_topic_views → build_validation_blocks | data/local/lda_fits/ |
| build_topic_views → build_external_validation | data/derived/topic_views/&lt;scene&gt;.json |
| build_topic_views → build_endmember_baseline | data/derived/topic_views/ |
| build_topic_views → build_interpretability | data/derived/topic_views/ |
| build_topic_views → build_narratives | data/derived/topic_views/ |
| build_representations → build_linear_probe_panel | data/local/representations/&lt;method&gt;/&lt;scene&gt;/features.npy |
| build_representations → build_mutual_information | data/local/representations/&lt;method&gt;/&lt;scene&gt;/features.npy |
| build_representations → build_topic_routed_deep_gate | data/local/representations/&lt;method&gt;/&lt;scene&gt;/features.npy |
| build_neural_topic_models → build_neural_topic_comparison | data/local/topic_variants/{prodlda,etm}/&lt;scene&gt;/ |
| build_topic_model_variants → build_neural_topic_comparison | data/local/topic_variants/{prodlda,etm}/&lt;scene&gt;/ |
| build_neural_topic_models → build_mutual_information | data/local/topic_variants/dmr_lda_hidsag/ |
| build_topic_model_variants → build_mutual_information | data/local/topic_variants/dmr_lda_hidsag/ |
| build_dmr_lda_hidsag → build_mutual_information | data/local/topic_variants/dmr_lda_hidsag/ |
| build_groupings → build_cross_method_agreement | data/local/groupings/&lt;algo&gt;/&lt;scene&gt;/assignment.bin |
| build_groupings → build_wordifications_v6plus | data/local/groupings/felzenszwalb/&lt;scene&gt;/assignment.bin |
| build_groupings → build_narratives | data/derived/groupings/ |
| build_endmember_baseline → build_wordifications_v6plus | data/derived/endmember_baseline/&lt;scene&gt;.json |
| build_topic_to_data → build_cross_method_agreement | data/derived/topic_to_data/ + data/local/topic_to_data/ |
| build_topic_to_data → build_spatial_validation | data/derived/topic_to_data/ + data/local/topic_to_data/ |
| build_topic_to_data → build_band_mask_canonical_comparison | data/derived/topic_to_data/ |
| build_topic_to_data → build_topic_spatial_continuous | data/derived/topic_to_data/ |
| build_topic_to_data → build_interpretability | data/derived/topic_to_data/ |
| build_topic_to_data → build_narratives | data/derived/topic_to_data/ |
| build_band_masked_topic_models → build_band_mask_canonical_comparison | data/derived/band_masks/{index,summary}.json |
| build_interpretability → build_band_masked_topic_models (SOFT, optional) | data/derived/interpretability/&lt;scene&gt;/band_cards.json (guarded by `.exists()`; falls back to all-bands) |
| build_topic_to_library → build_validation_blocks | data/derived/topic_to_library/ |
| build_topic_to_library → build_interpretability | data/derived/topic_to_library/ |
| build_topic_to_library → build_narratives | data/derived/topic_to_library/ |
| build_topic_to_usgs_v7 → build_validation_blocks | data/derived/topic_to_usgs_v7/ |
| build_quantization_sensitivity → build_validation_blocks | data/derived/quantization_sensitivity/ |
| build_cross_method_agreement → build_validation_blocks | data/derived/cross_method_agreement/ |
| build_cross_method_agreement → build_narratives | data/derived/cross_method_agreement/ |
| build_spatial_validation → build_interpretability | data/derived/spatial/ |
| build_spatial_validation → build_narratives | data/derived/spatial/ |
| build_external_validation → build_interpretability | data/derived/external_validation/ |
| build_external_validation → build_narratives | data/derived/external_validation/ |
| build_validation_blocks → build_narratives | data/derived/validation_blocks/ |
| build_eda_per_scene → build_interpretability | data/derived/eda/per_scene/ |
| build_eda_per_scene → build_narratives | data/derived/eda/per_scene/ |
| build_spectral_library_samples → build_topic_to_library | data/derived/spectral/library_samples.json |
| build_spectral_library_samples → build_external_validation | data/derived/spectral/library_samples.json |
| build_spectral_library_samples → build_analysis_payload | data/derived/spectral/library_samples.json |
| build_spectral_library_samples → build_corpus_previews | data/derived/spectral/library_samples.json |
| build_spectral_library_samples → run_local_core_benchmarks | data/derived/spectral/library_samples.json |
| build_real_samples → build_analysis_payload | data/derived/real/real_samples.json |
| build_real_samples → build_corpus_previews | data/derived/real/real_samples.json |
| build_corpus_previews → build_subset_cards | data/derived/corpus/corpus_previews.json |
| build_topic_routed_classifier → build_bayesian_classification_labelled | data/derived/topic_routed_classifier/ |
| build_topic_routed_deep_gate → build_bayesian_classification_deep | data/derived/topic_routed_deep_gate/ |
| build_hidsag_curated_subset → build_hidsag_region_documents | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_curated_subset → build_eda_hidsag | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_curated_subset → build_dmr_lda_hidsag | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_curated_subset → build_band_masked_topic_models_hidsag | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_curated_subset → build_mutual_information | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_curated_subset → build_hidsag_band_quality | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_curated_subset → run_local_core_benchmarks | data/derived/core/hidsag_curated_subset.json |
| build_hidsag_region_documents → build_eda_hidsag | data/derived/core/hidsag_region_documents.{json,npz} |
| build_hidsag_region_documents → build_v_sweep_hidsag | data/derived/core/hidsag_region_documents.npz |
| build_hidsag_region_documents → build_v_sweep_hidsag_f7 | data/derived/core/hidsag_region_documents.npz |
| build_hidsag_region_documents → run_local_core_benchmarks | data/derived/core/hidsag_region_documents.{json,npz} |
| build_v_sweep_hidsag → build_v_sweep_hidsag_f7 | data/local/v_sweep/lda_fits_hidsag/theta.npy |
| run_local_core_benchmarks → build_method_statistics_hidsag | data/derived/core/local_core_benchmarks.json |
| run_local_core_benchmarks → build_bayesian_method_comparison | data/derived/core/local_core_benchmarks.json |
| build_method_statistics_hidsag → build_bayesian_method_comparison | data/derived/method_statistics_hidsag/&lt;subset&gt;.json |
| build_method_statistics_hidsag → build_external_validation | data/derived/method_statistics_hidsag/ |
| run_hidsag_preprocessing_sensitivity → build_hidsag_cross_preprocessing_stability | data/derived/core/hidsag_preprocessing_sensitivity.json |
| build_band_masked_topic_models_hidsag → build_hidsag_topic_measurements | data/derived/band_masks_hidsag/swir/summary.json |
| build_wordifications* → build_v_sweep_canonical_fit | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/{doc_term.npz,vocab.json} |
| build_wordifications* → build_v_sweep_f1_classification | data/local/wordifications/&lt;recipe&gt;/&lt;scheme&gt;_Q&lt;q&gt;/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_f2_coherence | data/local/wordifications/&lt;recipe&gt;/.../doc_term.npz |
| build_wordifications* → build_v_sweep_f13_shap | data/local/wordifications/&lt;recipe&gt;/.../doc_term.npz |
| build_wordifications* → build_v_sweep_f15_llm_alignment | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_f15_self_judge | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_f17_cross_scene (V2/V10/V11/V14) | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_f18_reliability | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_hdp | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_prodlda_backbone | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_backbones_f7 | data/local/wordifications/&lt;recipe&gt;/uniform_Q&lt;q&gt;/&lt;scene&gt;/doc_term.npz |
| build_wordifications* → build_v_sweep_etm_backbone | data/local/wordifications/&lt;recipe&gt;/uniform_Q8/&lt;scene&gt;/doc_term.npz (via prodlda loader) |
| build_wordifications* → build_v_sweep_counterfactual | data/local/wordifications/&lt;recipe&gt;/.../doc_term.npz |
| build_wordifications* → build_quantization_sensitivity | data/local/wordifications/&lt;recipe&gt;/&lt;scheme&gt;_Q&lt;q&gt;/&lt;scene&gt;/doc_term.npz |
| build_v_sweep_canonical_fit → build_v_sweep_f2_coherence | data/local/v_sweep/lda_fits/&lt;cell&gt;/phi.npy |
| build_v_sweep_canonical_fit → build_v_sweep_f7_topic_to_label | data/local/v_sweep/lda_fits/ |
| build_v_sweep_canonical_fit → build_v_sweep_f14_repetitiveness | data/local/v_sweep/lda_fits/ |
| build_v_sweep_canonical_fit → build_v_sweep_counterfactual | data/local/v_sweep/lda_fits/&lt;cell&gt;/phi.npy |
| build_v_sweep_canonical_fit → build_v_sweep_f13_shap | data/local/v_sweep/lda_fits/&lt;cell&gt;/{phi.npy,vocab.json} |
| build_v_sweep_canonical_fit → build_v_sweep_f15_llm_alignment | data/local/v_sweep/lda_fits/&lt;cell&gt;/{phi,theta}.npy + vocab.json |
| build_v_sweep_canonical_fit → build_v_sweep_f15_self_judge | data/local/v_sweep/lda_fits/&lt;cell&gt;/{phi,theta}.npy |
| build_v_sweep_canonical_fit → build_b12_self_judge | data/derived/v_sweep/topic_views/ |
| build_v_sweep_f1_classification → build_v_sweep_f1_bayesian | data/derived/v_sweep/f1_per_fold/ |
| build_v_sweep_f1_classification → build_v_sweep_f1_bootstrap | data/derived/v_sweep/f1_per_fold/ |
| (all builders above) → curate_for_web | data/derived/&lt;builder-subdir&gt;/ (rglob; see `BUILDER_DIRS`) |

## Module-load edges (code dependencies, not data edges)

These builders import another builder's module directly
(`importlib.util.spec_from_file_location` or `importlib.import_module`),
so the imported module must be importable when they run. They are not
data edges, but they pin a code-level ordering.

| Loader | Loaded module(s) | Mechanism |
|---|---|---|
| build_v_sweep_prodlda_backbone | build_neural_topic_models | spec_from_file_location("neural_models", …) |
| build_v_sweep_backbones_f7 | build_neural_topic_models | spec_from_file_location("neural_models", …) |
| build_v_sweep_etm_backbone | build_neural_topic_models, build_v_sweep_prodlda_backbone | spec_from_file_location |
| build_v_sweep_hidsag | build_wordifications, build_wordifications_v4plus, build_wordifications_v6plus, build_wordifications_v7v11 | `_load(name, path)` wrapper over spec_from_file_location |
| build_wordifications_all | build_wordifications_v4plus, build_wordifications_v6plus, build_wordifications_v7v11 | importlib.import_module |
| run_hidsag_preprocessing_sensitivity | run_local_core_benchmarks | spec_from_file_location("local_core_benchmarks_module", …) |

`build_topic_model_variants` uses `importlib.util.find_spec(...)` only to
probe for optional libraries (gensim / tomotopy / torch / pyro); that is
**not** a module-load edge to another builder.

## Standalone builders (no derived-data dependency)

These read raw scenes (`research_core.raw_scenes.load_scene`), packaged
manifests, or `research_core.*` libraries only — no other builder's
output. They can run any time after Stage 0.

```
build_local_inventory.py        build_method_statistics.py
build_exploration_views.py      build_eda_per_scene.py
build_real_samples.py           build_field_samples.py
build_spectral_library_samples.py  build_segmentation_baselines.py
build_groupings.py              build_representations.py
build_topic_views.py            build_neural_topic_models.py
build_topic_model_variants.py   build_band_masked_topic_models.py
build_lda_sweep.py              build_optuna_hyperparam_search.py
build_rate_distortion_curve.py  build_classical_seed_stability.py
build_band_masked_topic_models.py  (* soft dep on build_interpretability — see Stage 1 note)
build_deep_seed_stability.py    build_deep_anomaly.py
build_neural_topic_seed_stability.py
build_hidsag_curated_subset.py
build_wordifications.py         build_wordifications_v4plus.py
build_wordifications_v7v11.py   build_wordifications_v13.py
build_wordifications_v14.py     build_wordifications_v15.py
build_wordifications_v16.py     build_wordifications_v17.py
build_wordifications_v18.py     build_wordifications_v19.py
build_wordifications_v20.py
```

(`build_wordifications_v6plus.py` and `build_hidsag_band_quality.py` look
like standalone wordification/core builders but are **not** — see the
Stage 2 cross-stage exceptions.)

Audit / inspection scripts that scan the tree but are not part of the
build DAG: `audit_manifest.py` (reads `data/derived/manifests/index.json`
and the tree), `audit_citation_openalex.py`, `inspect_hidsag_zip.py`,
`build_demo.py` (writes `data/demo/demo.json`).

## Edges needing manual confirmation

- **build_bayesian_method_comparison → build_external_validation**:
  both write into `data/derived/method_statistics_hidsag/`
  (`build_method_statistics_hidsag` writes the per-subset base stats;
  `build_bayesian_method_comparison` writes `cross_*_bayesian.json` into
  the same directory). `build_external_validation` reads
  `method_statistics_hidsag/` at the directory level, so a static read
  cannot tell whether it consumes the base stats (confirmed edge from
  `build_method_statistics_hidsag`) or the bayesian-cross files. Treat
  the dependency on `build_method_statistics_hidsag` as confirmed; the
  dependency on `build_bayesian_method_comparison` is **not** confirmed.
- **build_wordifications* recipe granularity**: the v_sweep consumers
  select recipes at runtime (`RECIPES = [f"V{i}" for i in range(1, N)]`).
  V1..V12 come from `build_wordifications` / `_v4plus` / `_v6plus` /
  `_v7v11`; V13..V20 from the per-version builders. `f17_cross_scene`
  uses only V2/V10/V11/V14. The edges are real at the corpus-directory
  level; the exact recipe set per consumer is the `RECIPES` constant in
  that consumer.

## Full clean rebuild (ordered)

```bash
# Stage 0 — fetch raw data (once per machine)
python data-pipeline/fetch_public_hsi.py
python data-pipeline/fetch_public_msi.py
python data-pipeline/fetch_public_spectral_libraries.py
python data-pipeline/fetch_public_unmixing.py
python data-pipeline/fetch_hidsag.py
python data-pipeline/fetch_ecostress_metadata.py

# Stage 1 — core / foundational
python data-pipeline/build_local_inventory.py
python data-pipeline/build_method_statistics.py
python data-pipeline/build_exploration_views.py
python data-pipeline/build_hidsag_curated_subset.py
python data-pipeline/build_eda_per_scene.py
python data-pipeline/build_real_samples.py
python data-pipeline/build_field_samples.py
python data-pipeline/build_spectral_library_samples.py
python data-pipeline/build_segmentation_baselines.py
python data-pipeline/build_groupings.py
python data-pipeline/build_representations.py
python data-pipeline/build_topic_views.py
python data-pipeline/build_neural_topic_models.py
python data-pipeline/build_topic_model_variants.py
python data-pipeline/build_band_masked_topic_models.py
python data-pipeline/build_lda_sweep.py
python data-pipeline/build_optuna_hyperparam_search.py
python data-pipeline/build_rate_distortion_curve.py
python data-pipeline/build_hidsag_band_quality.py
python data-pipeline/build_classical_seed_stability.py
python data-pipeline/build_deep_seed_stability.py
python data-pipeline/build_deep_anomaly.py
python data-pipeline/build_neural_topic_seed_stability.py
python data-pipeline/run_hidsag_preprocessing_sensitivity.py
# wordification corpus (V6plus deferred to Stage 2)
python data-pipeline/build_wordifications.py
python data-pipeline/build_wordifications_v4plus.py
python data-pipeline/build_wordifications_v7v11.py
python data-pipeline/build_wordifications_v13.py
python data-pipeline/build_wordifications_v14.py
python data-pipeline/build_wordifications_v15.py
python data-pipeline/build_wordifications_v16.py
python data-pipeline/build_wordifications_v17.py
python data-pipeline/build_wordifications_v18.py
python data-pipeline/build_wordifications_v19.py
python data-pipeline/build_wordifications_v20.py

# Stage 2 — first-order consumers
python data-pipeline/build_topic_to_data.py
python data-pipeline/build_topic_to_library.py
python data-pipeline/build_topic_to_usgs_v7.py
python data-pipeline/build_embedded_baseline.py
python data-pipeline/build_endmember_baseline.py
python data-pipeline/build_topic_routed_classifier.py
python data-pipeline/build_topic_routed_deep_gate.py
python data-pipeline/build_cross_scene_transfer.py
python data-pipeline/build_spectral_browser.py
python data-pipeline/build_spectral_density.py
python data-pipeline/build_topic_anomaly.py
python data-pipeline/build_topic_spatial_full.py
python data-pipeline/build_topic_stability.py
python data-pipeline/build_hierarchical_super_topics.py
python data-pipeline/build_b12_llm_tea_leaves.py
python data-pipeline/build_linear_probe_panel.py
python data-pipeline/build_neural_topic_comparison.py
python data-pipeline/build_quantization_sensitivity.py
python data-pipeline/build_analysis_payload.py
python data-pipeline/build_corpus_previews.py
python data-pipeline/build_hidsag_region_documents.py
python data-pipeline/build_eda_hidsag.py
python data-pipeline/build_dmr_lda_hidsag.py
python data-pipeline/build_band_masked_topic_models_hidsag.py
python data-pipeline/run_local_core_benchmarks.py
python data-pipeline/build_v_sweep_hidsag.py
python data-pipeline/build_hidsag_cross_preprocessing_stability.py
python data-pipeline/build_wordifications_v6plus.py   # after endmember_baseline + groupings

# Stage 3 — second-order consumers
python data-pipeline/build_band_mask_canonical_comparison.py
python data-pipeline/build_cross_method_agreement.py
python data-pipeline/build_spatial_validation.py
python data-pipeline/build_topic_spatial_continuous.py
python data-pipeline/build_hidsag_topic_measurements.py
python data-pipeline/build_method_statistics_hidsag.py
python data-pipeline/build_bayesian_method_comparison.py
python data-pipeline/build_mutual_information.py
python data-pipeline/build_bayesian_classification_labelled.py
python data-pipeline/build_bayesian_classification_deep.py
python data-pipeline/build_subset_cards.py
python data-pipeline/build_v_sweep_hidsag_f7.py

# Stage 4 — V-sweep canonical fit + corpus-only backbones
python data-pipeline/build_v_sweep_canonical_fit.py
python data-pipeline/build_v_sweep_f1_classification.py
python data-pipeline/build_v_sweep_hdp.py
python data-pipeline/build_v_sweep_prodlda_backbone.py
python data-pipeline/build_v_sweep_backbones_f7.py
python data-pipeline/build_v_sweep_etm_backbone.py
python data-pipeline/build_v_sweep_f17_cross_scene.py
python data-pipeline/build_v_sweep_f18_reliability.py

# Stage 5 — V-sweep F-axes on the canonical fits
python data-pipeline/build_v_sweep_f1_bayesian.py
python data-pipeline/build_v_sweep_f1_bootstrap.py
python data-pipeline/build_v_sweep_f2_coherence.py
python data-pipeline/build_v_sweep_f7_topic_to_label.py
python data-pipeline/build_v_sweep_f14_repetitiveness.py
python data-pipeline/build_v_sweep_counterfactual.py
python data-pipeline/build_v_sweep_f13_shap.py
python data-pipeline/build_v_sweep_f15_llm_alignment.py
python data-pipeline/build_v_sweep_f15_self_judge.py
python data-pipeline/build_b12_self_judge.py

# Stage 6 — aggregators
python data-pipeline/build_external_validation.py
python data-pipeline/build_validation_blocks.py
python data-pipeline/build_interpretability.py
python data-pipeline/build_narratives.py

# Stage 7 — web curation (LAST)
python data-pipeline/curate_for_web.py
```

## Runtime budget (dev workstation: CPU only, 32 GB RAM, 8-core i7-11800H, Windows 11)

| Stage | Rough cumulative time | Note |
|---|---|---|
| Stage 0 fetch | one-time | network-bound |
| Stage 1 wordifications (V1..V20, 6 scenes) | ~25-35 min | V20 cheapest (~30 s); V18 eigsh most expensive (~3 min) |
| Stage 4 canonical LDA fit (V × scene) | ~15-20 min | online VB, single-pass |
| Stage 5 F-axes | ~30 min | F-13 SHAP is the bottleneck |
| Stage 4 backbones (HDP + ProdLDA + ETM) | ~60-90 min | ProdLDA on Pyro/CPU is the bottleneck |
| Stages 6-7 | ~2 min | mostly JSON aggregation |
| **End-to-end full rebuild** | **~2-3 hours** | clean checkout, no caches |

## Targeted re-build commands

| Use case | Command |
|---|---|
| Re-build a single V cell | `python data-pipeline/build_wordifications_v20.py --scenes indian-pines-corrected --q 8` |
| Re-run a single axis on the full V-sweep | `python data-pipeline/build_v_sweep_f2_coherence.py` |
| Re-fit all V-sweep canonical LDAs | `python data-pipeline/build_v_sweep_canonical_fit.py` |
| Re-build backbones for new recipes only | `python data-pipeline/build_v_sweep_hdp.py --recipes V14 V18 V20` |
| Refresh web bundles after any derived change | `python data-pipeline/curate_for_web.py` |
| Smoke-test the API after curate | `bash scripts/smoke.sh http://localhost:8105` |

---

*Derived from a static read of all 108 builders on 2026-06-04 (issue #589
Tier 2). Edges confirmed by matching output/input path strings in the
source; no builders were executed. When you add a builder, add its edges
here and to `curate_for_web.py`'s `BUILDER_DIRS`.*
