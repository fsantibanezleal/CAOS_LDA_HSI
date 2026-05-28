# Data-pipeline Build DAG

**Status**: focal map of the V-sweep dependency chain. Tier 2 ask
from #589.

The full data-pipeline has 108 Python files in `data-pipeline/`. This
document maps the critical-path dependencies for the **V-sweep**
artefacts that are surfaced to the web app (`/workspace/methods`).
For builders outside the V-sweep, see the per-builder module docstring
or run with `--help`.

## Convention

Each node is a python file in `data-pipeline/`. An arrow `A → B` means
**B reads files written by A**, so A must run first. The DAG is read
top-to-bottom in execution order.

A node's outputs are listed in **bold** under its name. Inputs are
implicit from the dependency edges.

## Phase 0 — Raw data acquisition

```
fetch_public_hsi.py     fetch_public_msi.py     fetch_public_spectral_libraries.py
       |                       |                          |
       v                       v                          v
            data/raw/<scene_id>/   (NOT in git)
```

These three fetchers populate `data/raw/`. They are run once per
machine and only re-run when a new scene is added.

## Phase 1 — Wordification builders (V-sweep)

All twenty wordification builders (V1..V15 + V17..V20) read from
`data/raw/<scene>/` and write into
`data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/`.

```
build_wordifications.py             → V1, V2, V3
build_wordifications_v4plus.py      → V4, V5, V10
build_wordifications_v6plus.py      → V6, V8, V9, V12
build_wordifications_v7v11.py       → V7, V11
build_wordifications_v13.py         → V13 (VQ-VAE codebook)
build_wordifications_v14.py         → V14 (CWT-Morlet)
build_wordifications_v15.py         → V15 (spectral indices)
build_wordifications_v16.py         → V16 (HyperSIGMA, scaffolded)
build_wordifications_v17.py         → V17 (sparse-coding dictionary)
build_wordifications_v18.py         → V18 (graph-Laplacian eigenvectors)
build_wordifications_v19.py         → V19 (UMAP coordinates)
build_wordifications_v20.py         → V20 (MI-weighted bands)
```

**Outputs**:
- `doc_term.npz` (CSR sparse [D, V])
- `vocab.json` (list of tokens + metadata)

## Phase 2 — V-sweep canonical LDA fits

```
build_v_sweep_canonical_fit.py
       |
       v
data/derived/v_sweep/topic_views/<scene>_<recipe>_uniform_Q8.json
       (114 cells = 19 recipes × 6 scenes)
```

**Outputs**: per-cell K, mean_doc_length, perplexity, phi (φ), theta (θ).

## Phase 3 — Per-axis evaluators

All consume `topic_views/` from phase 2 and run a single F-axis
metric per cell.

```
                    topic_views (phase 2)
                            |
                            v
+---------------------------+----------------------------+
|             |             |              |             |
v             v             v              v             v
build_v_sweep_f1_*  build_v_sweep_f2_coherence  build_v_sweep_f7_topic_to_label
                            |                  |
build_v_sweep_f14_repetitiveness  build_v_sweep_f18_reliability
                            |
                    build_v_sweep_f17_cross_scene
                            |
                    build_v_sweep_f22_counterfactual
                            |
                    build_v_sweep_f15_self_judge
                            |
                    build_v_sweep_f13_shap
```

**Outputs**: one JSON per (recipe, scene) under
`data/derived/v_sweep/<axis>/`. Indexed via `data/manifests/index.json`.

## Phase 4 — Backbone factorial (LDA / HDP / ProdLDA / ETM)

Each backbone runs over the same V × scene grid:

```
                    wordifications (phase 1)
                            |
                            v
+---------------------------+----------------------------+
|             |             |             |              |
v             v             v             v              v
build_v_sweep_canonical_fit.py     (LDA — phase 2 above)
build_v_sweep_hdp.py               → hdp_backbone/
build_v_sweep_prodlda_backbone.py  → prodlda_backbone/
build_v_sweep_etm_backbone.py      → etm_backbone/
```

## Phase 5 — Web-app curation

```
data/derived/* (phases 2-4) + data/raw/<scene>/         data/local/wordifications/*
                       \                                /
                        \                              /
                         v                            v
                            curate_for_web.py
                                    |
                                    v
              data/web/manifests/index.json   data/web/.../bundle.json
```

The curated bundles are what the FastAPI app serves under `/api/`.

## Phase 6 — Web-app payload aggregation

```
                        curated bundle (phase 5)
                                    |
                                    v
                            build_analysis_payload.py
                                    |
                                    v
                  data/derived/analysis/analysis.json
                                    |
                                    v
                            FastAPI /api/analysis/*
```

## Critical-path runtime budget

Rough wall-clock per builder on the dev workstation (CPU only, 32 GB
RAM, 8-core i7-11800H, Windows 11):

| Phase | Cumulative time | Note |
|---|---|---|
| Phase 1 (V1..V12 + V14..V20, 6 scenes) | ~25-35 min | V20 cheapest (~30 s); V18 most expensive (~3 min) |
| Phase 2 (canonical LDA fit, 114 cells) | ~15-20 min | online VB, single-pass |
| Phase 3 (F-1..F-22, 114 × 8 axes) | ~30 min | F-13 SHAP is the bottleneck |
| Phase 4 (HDP + ProdLDA + ETM, 19 V × 6 scenes × 3 backbones) | ~60-90 min | ProdLDA is the bottleneck on Pyro/CPU |
| Phase 5-6 | ~2 min | mostly JSON aggregation |
| **End-to-end full rebuild** | **~2-3 hours** | clean checkout, no caches |

The V-sweep extension (V13..V20) adds **~5-10 minutes** to phase 1
(the seven new recipes' build cost is modest because the bulk of the
work is in the V13 VQ-VAE training and the V18 eigsh call).

## Re-build commands by use case

| Use case | Command |
|---|---|
| Re-build a single V cell | `python data-pipeline/build_wordifications_v20.py --scenes indian-pines-corrected --q 8` |
| Re-run a single axis on the full V-sweep | `python data-pipeline/build_v_sweep_f2_coherence.py` |
| Re-fit all V-sweep canonical LDAs | `python data-pipeline/build_v_sweep_canonical_fit.py` |
| Re-build backbones for new recipes only | `python data-pipeline/build_v_sweep_hdp.py --recipes V14 V18 V20` |
| Refresh web bundles after any derived change | `python data-pipeline/curate_for_web.py` |
| Smoke-test the API after the curate | `bash scripts/smoke.sh http://localhost:8105` |

## Open work

The DAG above only covers the V-sweep and the canonical LDA web
pipeline. Out-of-scope builders (HIDSAG, deep, Bayesian classification,
external validation, fields/MSI, segmentation baselines, neural topic
models) have their own dependency chains; see the per-builder docstring
and the upstream issue #589 for the full inventory.
