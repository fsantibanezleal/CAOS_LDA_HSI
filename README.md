# CAOS LDA HSI

CAOS LDA HSI is a local-first research and validation repository for
**probabilistic topic modelling, deep representation learning, and
hierarchical Bayesian comparison** over multispectral and hyperspectral
imagery (HSI) and HIDSAG geochemistry-aligned mining-spectra subsets.

The central thesis is methodological:

> Spectral variability is not disposable noise. It can be represented as
> a corpus, inspected through PTM/LDA-style models alongside neural
> variants (ProdLDA, ETM) and deep encoders (CAE-1D / 2D / 3D, β-VAE),
> and compared against fair K-dim baselines and unmixing baselines on a
> twelve-axis evaluation battery (Addendum B). Where labels exist, every
> headline claim is checked with explicit Bayesian dominance against
> per-fold and per-seed observations.

The data pipeline, local experiments, and documentation are the primary
product. The public web app is a compact interactive projection of a
validated subset of those outputs and ships behind smoke checks on
every deploy.

## Live deployment

- **Public URL**: <https://lda-hsi.fasl-work.com>
- **Smoke**: 87/87 GET endpoints return 200 in <10 s, run as part of
  every `deploy/update.sh` (see [`scripts/smoke.sh`](scripts/smoke.sh)
  and [`scripts/smoke.ps1`](scripts/smoke.ps1))
- **Manifest**: 1592 derived artifacts (1359 JSON + 147 binary +
  27 PNG), audited zero-issues by [`data-pipeline/audit_manifest.py`](data-pipeline/audit_manifest.py)
- **API surface**: ~104 endpoints across 6 labelled scenes × 17
  per-scene endpoints + 5 HIDSAG subsets × 6 endpoints + 12 cross-scene
  endpoints — full catalog at the [Backend Architecture and Payloads](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Backend-Architecture-and-Payloads)
  wiki page

## Architecture at a glance

```
                 ┌──────────────────────┐
                 │  data/raw/  (gitignored, public datasets)         │
                 │  AVIRIS, ROSIS, Borsoi unmixing, MicaSense MSI,   │
                 │  USGS splib07, ECOSTRESS, HIDSAG ZIPs             │
                 └──────────┬───────────┘
                            │ acquire (data-pipeline/fetch_*)
                            ▼
                 ┌──────────────────────┐
                 │  research_core/  (paths, raw_scenes, class_catalog,│
                 │                   spectral, unmixing, inventory)   │
                 └──────────┬───────────┘
                            │ build (data-pipeline/build_*)  ← GPU when available
                            ▼
                 ┌──────────────────────┐
                 │  data/derived/   1592 deterministic JSON / .bin / .png│
                 │  ──────────────  curated by data-pipeline/curate_for_web.py│
                 │   • topic_views (LDA canonical)                    │
                 │   • topic_variants/{lda,prodlda,etm,nmf,...}       │
                 │   • representations/{cae_1d,2d,3d,3d_full,β-VAE}   │
                 │   • method_statistics_hidsag, *_labelled, *_deep   │
                 │   • neural_topic_comparison, neural_topic_seed_*   │
                 │   • lda_sweep, optuna_search, classical_seed_*     │
                 │   • topic_routed_classifier / _deep_gate           │
                 │   • cross_method_agreement, cross_scene_transfer   │
                 │   • topic_anomaly, deep_anomaly                    │
                 │   • topic_spatial_continuous / _full / endmember   │
                 │   • bayesian_classification_{labelled,deep}        │
                 │   • llm_tea_leaves (gated by ANTHROPIC_API_KEY)    │
                 │   • super_topics, hierarchical_super_topics        │
                 └──────────┬───────────┘
                            │ committed; loaded by FastAPI on boot
                            ▼
                 ┌──────────────────────┐
                 │  app/  (FastAPI: main, config, routers, services)  │
                 │  →  /api/*  ORJSON + GZip                          │
                 │  →  /generated/* static + /assets/* SPA bundle     │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  frontend/  (Vite 6 + React 19 + TS strict +       │
                 │              Tailwind v4 + react-i18next +         │
                 │              TanStack Query v5 + Zustand + XState) │
                 │  Pages: Overview · Methodology · Databases ·       │
                 │         Workspace (11 tabs) · Benchmarks (16 cards)│
                 └──────────────────────┘
```

The runtime is **stateless and read-only**: every numerical claim in
the SPA traces back to a JSON file under `data/derived/` produced by
an offline `build_*.py` builder. Heavy compute runs once on the
contributor's workstation and is committed to Git.

## Method coverage

### Topic-model family (`data/derived/topic_variants/<variant>/`)

| Variant | Implementation | Status |
|---|---|---|
| `lda` (canonical) | `gensim.models.LdaMulticore` (cycles 0+) | shipped |
| `gensim_vb` | `gensim.models.LdaModel` variational Bayes | shipped |
| `gensim_multicore` | multi-core sampler | shipped |
| `sklearn_online` | `sklearn.decomposition.LatentDirichletAllocation` | shipped |
| `sklearn_sparse` | sklearn with sparse word-doc input | shipped |
| `tomotopy_lda` | C++ collapsed Gibbs LDA | shipped |
| `tomotopy_hdp` | hierarchical Dirichlet process | shipped |
| `tomotopy_ctm` | correlated-topic model | shipped |
| `dmr_lda_hidsag` | DMR-LDA with metadata covariates (HIDSAG only) | shipped |
| `prodlda` | Pyro variational ProdLDA (Srivastava-Sutton 2017) | **GPU since cycle 59** |
| `etm` | Embedded Topic Model (Dieng-Ruiz-Blei 2020) low-rank `ρ α^T` decoder | **shipped cycle 59** |

Multi-seed stability for the neural family ships at `N=5` via
[`build_neural_topic_seed_stability`](data-pipeline/build_neural_topic_seed_stability.py)
(cycle 63).

### Deep representation family (`data/derived/representations/<method>/`)

| Method | Architecture | K values shipped |
|---|---|---|
| `cae_1d` | Conv1d encoder along spectral axis + Linear decoder | 4, 6, 8, 10, 12, 16, 32 |
| `cae_2d` | Conv2d on (P × P) patches × B channels + full-patch decoder | 4, 8, 16, 32 |
| `cae_3d` (centre-anchor) | Conv3d on (B, P, P) volumes; decoder reconstructs centre-pixel only | 4, 8, 16, 32 |
| `cae_3d_full` | Same encoder; **full-patch** decoder `K → B·P·P` (cycles 52, 55) | 4, 8 |
| `beta_vae` | 2-layer MLP encoder/decoder + KL with β ∈ {1, 2, 4, 8, 16} | K ∈ {4, 8, 16, 32} × β |
| `pca_K`, `nmf_K`, `ica_K` | sklearn decomposition (fair-baseline K-dim compressions) | various |
| `dense_ae` | sklearn `MLPRegressor` autoencoder | K ∈ {4, 8, 16, 32} |

The five PyTorch-based methods (`cae_1d`, `cae_2d`, `cae_3d`,
`cae_3d_full`, `beta_vae`) auto-detect CUDA and fall back to CPU
when no GPU is present. See [`scripts/GPU_SETUP.md`](scripts/GPU_SETUP.md).

### Multi-axis Addendum B battery (12 axes)

| Axis | Builder | Endpoint |
|---|---|---|
| **B-1** linear probe | `build_linear_probe_panel` | `/api/linear-probe-panel/{scene}` |
| **B-2** rate-distortion | `build_rate_distortion_curve` | `/api/rate-distortion-curve/{scene}` |
| **B-3** topic-routed classifier | `build_topic_routed_classifier` | `/api/topic-routed-classifier/{scene}` |
| **B-3 follow-up** deep gate | `build_topic_routed_deep_gate` (cycle 51) | `/api/topic-routed-deep-gate/{scene}` |
| **B-3 neural-topic head-to-head** | `build_neural_topic_comparison` (cycles 61+62) | `/api/neural-topic-comparison/{scene}` |
| **B-3 neural-topic seed stability** | `build_neural_topic_seed_stability` (cycle 63) | `/api/neural-topic-seed-stability/{scene}` |
| **B-4** mutual information | `build_mutual_information` | `/api/mutual-information/{scene}` and `/hidsag/{subset}` |
| **B-5** embedded baseline | `build_embedded_baseline` | `/api/embedded-baseline/{scene}` |
| **B-6** seed stability | `build_topic_stability`, `build_deep_seed_stability` (N=7/15/30), `build_classical_seed_stability` | `/api/topic-stability`, `/api/deep-seed-stability`, `/api/classical-seed-stability` |
| **B-7** USGS library alignment | `build_topic_to_usgs_v7` | `/api/topic-to-usgs-v7/{scene}` |
| **B-8** cross-scene transfer | `build_cross_scene_transfer` | `/api/cross-scene-transfer` |
| **B-9** anomaly | `build_topic_anomaly`, `build_deep_anomaly` | `/api/topic-anomaly`, `/api/deep-anomaly` |
| **B-10** spatial coherence | `build_topic_spatial_continuous`, `_spatial_full` | `/api/topic-spatial-continuous`, `/api/topic-spatial-full` |
| **B-11** endmember baseline | `build_endmember_baseline` | `/api/endmember-baseline/{scene}` |
| **B-12** LLM tea-leaves | `build_b12_llm_tea_leaves` (gated by `ANTHROPIC_API_KEY`) | `/api/llm-tea-leaves/{scene}` |
| **Bayesian** comparison | `build_bayesian_*` (4 task types) | `/api/bayesian-comparison/{regression|classification|classification-labelled|classification-labelled-deep}` |

See the [Multi-Axis Addendum B](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Multi-Axis-Addendum-B)
wiki page for the methodological framework and per-axis findings.

## Headline findings (cycles 1–63)

These are the project-level claims that the Benchmarks page surfaces
visually and the Bayesian endpoints make decisive:

1. **θ as a gate beats raw on labelled scenes.** `topic_routed_soft`
   matches or beats `raw_logistic` on all 6 labelled scenes;
   `theta_logistic` (θ as flat feature) loses by 30–50 pp everywhere.
   The framing "θ is a gate, not a feature" is empirically validated.
2. **No deep encoder can replace θ as the gate.** Cycle 54's
   hierarchical Bayesian posterior shows
   `raw > θ > {pca_8, cae_1d_8, beta_vae_8}` at `P(μ_a > μ_b) ≥ 0.999`
   for every relevant pair. Softmaxed deep latents do not recover the
   gating mechanism — the structural Dirichlet simplex constraint
   matters, not just K-dim compression.
3. **LDA wins clustering quality, ProdLDA wins coherence, ETM is the
   safe middle.** Cycle 61–63 head-to-head: LDA wins KMeans-vs-label
   ARI 4/6 scenes; ProdLDA wins c_v topic coherence 6/6; ETM beats
   ProdLDA on ARI 6/6 (multi-seed N=5, cycle 63). On Kennedy SC where
   LDA collapses to ARI ≈ 0, neural variants rescue clustering to
   ~+0.22 ARI.
4. **Decoder reconstruction target is itself a hyperparameter.**
   CAE-3D anchor-only decoder vs full-patch (cycles 52, 55) gives net
   mean ΔARI ≈ +0.003 (K=8) and +0.011 (K=4) — neutral on average,
   scene-dependent direction. Pavia U inverts with capacity.
5. **β-VAE posterior collapse on Salinas at β ≥ 8** (ARI = 0.000) is
   the textbook failure mode visible in the Benchmarks β-sweep
   heatmap.
6. **9-method × 6-scene seed-stability ladder**: PCA = ICA (1.000
   deterministic) > LDA > NMF > CAE-2D > CAE-1D > CAE-3D > dense-AE
   > β-VAE.
7. **GPU acceleration ~50–120× for the deep / neural family**
   (cycle 59). Full `cae_3d_full` K-curve {4, 8, 16, 32} × 6 scenes
   went from ~9–12 h CPU to ~10 min GPU on RTX 4070 Laptop.

## Quick start

### Setup (CPU-only, portable)

```powershell
# Windows PowerShell
.\scripts\local.ps1 setup-all
```

```bash
# Linux / macOS / WSL
./scripts/local.sh setup-all
```

This creates `.venv` (web backend), `.venv-pipeline` (data pipeline),
and installs frontend node modules. The default torch is the CPU
build, which works end-to-end but takes hours for the deep / neural
heavy builders.

### Setup (GPU, recommended for heavy compute)

If you have an NVIDIA GPU with CUDA 12.x (verify via `nvidia-smi`),
add:

```powershell
.\scripts\local.ps1 setup-pipeline-gpu
```

```bash
./scripts/local.sh setup-pipeline-gpu
```

This reinstalls torch with the `cu126` wheel into `.venv-pipeline`
and verifies CUDA detection. Speedup: 50–120× on the five PyTorch
heavy builders. See [`scripts/GPU_SETUP.md`](scripts/GPU_SETUP.md)
for prerequisites, sanity checks, GPU-vs-CPU determinism notes
(±0.010 ARI drift, well below per-seed σ ≈ 0.05), and the
device-agnostic fallback.

### Run the dev stack

```powershell
.\scripts\local.ps1 dev
```

Starts the FastAPI backend on `127.0.0.1:8105` and the Vite dev
server on `127.0.0.1:5173`. Visit either; both serve the same
production API.

### Smoke against production

```powershell
.\scripts\local.ps1 smoke
```

Runs `scripts/smoke.{sh,ps1}` against `https://lda-hsi.fasl-work.com`,
asserting HTTP 200 on 87 endpoints in <10 s. The same harness runs
on the VPS as the last step of every `deploy/update.sh`.

## Repository layout

```
CAOS_LDA_HSI/
├── app/                  FastAPI: main, config, models, routers, services
├── frontend/             Vite + React 19 + TS strict SPA
├── research_core/        paths, raw_scenes, class_catalog, spectral, unmixing, inventory
├── data/
│   ├── raw/              gitignored: AVIRIS / ROSIS / Borsoi / MicaSense / HIDSAG ZIPs
│   ├── manifests/        committed: dataset, family, recipe, subset registries
│   ├── demo/             synthetic deterministic LDA demo for the landing page
│   ├── derived/          ★ committed: 1592 deterministic outputs from offline builders
│   └── local/            gitignored: full-fidelity npz / npy artifacts (per-pixel θ, etc.)
├── data-pipeline/        ~57 builders + audit + curate
├── scripts/              local.{sh,ps1}, smoke.{sh,ps1}, GPU_SETUP.md, README.md
├── deploy/               VPS systemd unit + update.sh + nginx config
├── docs/                 theory, datasets, architecture, sources, roadmap
└── legacy/               pre-rebuild experiments (historical reference)
```

## Documentation

- **Public wiki** (the canonical methodological reference):
  <https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki>
  - [Home](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Home) — orientation
  - [Scientific Thesis and Method](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Scientific-Thesis-and-Method)
  - [Mathematical Background](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Mathematical-Background) — LDA, Procrustes, ARI, hierarchical Bayes, ProdLDA, ETM, c_v
  - [Deep Representations](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Deep-Representations) — CAE-1D/2D/3D + β-VAE + ETM head-to-head
  - [Bayesian Method Comparison](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Bayesian-Method-Comparison) — 3 hierarchical NUTS posteriors
  - [Multi-Axis Addendum B](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Multi-Axis-Addendum-B) — 12-axis evaluation framework
  - [Backend Architecture and Payloads](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Backend-Architecture-and-Payloads) — full endpoint catalogue + GPU performance §14.1
  - [Web App Workflow and GUI](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Web-App-Workflow-and-GUI) — page structure + cycles 53-63 surfacings
  - [Local Reproduction Guide](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Local-Reproduction-Guide)

- Repo-local technical docs under [`docs/`](docs/):
  - [`docs/theory.md`](docs/theory.md) — long-form methodological essay
  - [`docs/architecture.md`](docs/architecture.md) — system architecture
  - [`docs/datasets.md`](docs/datasets.md) — public + private dataset inventory
  - [`docs/spectral-tokenization.md`](docs/spectral-tokenization.md) — recipe taxonomy V1–V12
  - [`docs/sources.md`](docs/sources.md) — citations and dataset URLs
  - [`docs/technical-roadmap.md`](docs/technical-roadmap.md) — pre-Addendum-B roadmap (kept for context)

- Operational state (private, sibling repo `_CAOS_MANAGE`):
  - `wip/caos-lda-hsi/current-state.md` — branch + deploy ledger
  - `wip/caos-lda-hsi/master-plan.md` — methodological master plan
  - `wip/caos-lda-hsi/pending.md` — P0/P1/P2/P3 backlog with closure status
  - `deployments/caos-lda-hsi.md` — deploy history per cycle

## Datasets covered

**Family A — public spectral libraries**: USGS splib07 (AVIRIS-1997
2450 spectra × 7 chapters), ECOSTRESS public categories.

**Family B — labelled HSI scenes** (`data/derived/real/real_samples.json`,
`data/derived/representations/`, `data/derived/topic_views/`):
Indian Pines (AVIRIS, 16 classes), Salinas (AVIRIS, 16 classes),
Salinas-A (AVIRIS, 6 classes), Pavia U (ROSIS, 9 classes), Kennedy
Space Center (AVIRIS, 13 classes), Botswana (Hyperion, 14 classes).
All accessed through UPV/EHU's hyperspectral-remote-sensing-scenes
mirror.

**Family C — Borsoi unmixing benchmarks**: Samson, Jasper Ridge,
Urban (with manually-defined endmember sets).

**Family D — HIDSAG (Hyperspectral Image Database for Sample
Analysis in Geology)**: GEOMET, MINERAL1, MINERAL2, GEOCHEM,
PORPHYRY subsets with sample-level geochemistry targets, multi-
measurement summaries, and bad-band heuristics.

**Family E — MicaSense MSI field samples**: official MicaSense
sample dataset (RedEdge-3 + Altum), used as the only field-grade
multispectral reference in the repo.

See [Dataset Families and Sources](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Dataset-Families-and-Sources)
for licensing, access URLs, and citation expectations.

## Branch flow & deploy cadence

Branch flow is a hard rule (see `_CAOS_MANAGE` private repo):

```
task/<5-digit-id>/<short-desc>  →  PR to develop  →  PR develop→main when deploy-ready
```

Every cycle that lands in production includes:

1. GitHub issue describing the question + method
2. Task branch with the implementation
3. PR `task/* → develop` with squash-merge + branch deletion
4. PR `develop → main` titled `Deploy: <summary>` and merged via merge-commit
5. SSH `bash deploy/update.sh` against the VPS
6. Smoke harness verifies 87/87
7. Cadence comments: PR comment + issue comment + close
8. Management repo updates: `deployments/caos-lda-hsi.md` + `wip/caos-lda-hsi/current-state.md`

## License & acknowledgements

This is a private research repository. Public datasets accessed through
the data pipeline retain their original licenses (UPV/EHU mirror,
USGS, ECOSTRESS, MicaSense, HIDSAG terms). The Anthropic LLM call in
`build_b12_llm_tea_leaves.py` is gated by an explicit
`ANTHROPIC_API_KEY` and never runs in CI without it.

## References

Core methodological references (full list on the wiki
[References](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/References) page):

- Blei, Ng & Jordan (2003), *Latent Dirichlet Allocation*, JMLR.
- Hoffman, Blei & Bach (2010), *Online Learning for Latent Dirichlet
  Allocation*, NeurIPS.
- Srivastava & Sutton (2017), *Autoencoding Variational Inference for
  Topic Models*, ICLR. [`arXiv:1703.01488`](https://arxiv.org/abs/1703.01488)
- Dieng, Ruiz & Blei (2020), *Topic Modeling in Embedding Spaces*,
  TACL. [`arXiv:1907.04907`](https://arxiv.org/abs/1907.04907)
- Röder, Both & Hinneburg (2015), *Exploring the Space of Topic
  Coherence Measures*, WSDM.
  [`doi:10.1145/2684822.2685324`](https://doi.org/10.1145/2684822.2685324)
- Kingma & Welling (2014), *Auto-Encoding Variational Bayes*, ICLR.
  [`arXiv:1312.6114`](https://arxiv.org/abs/1312.6114)
- Higgins et al. (2017), *β-VAE: Learning Basic Visual Concepts with a
  Constrained Variational Framework*, ICLR.
- Egaña et al. (2020) and Santibáñez-Leal et al. (2022) — the A39
  hierarchical inference paper that grounds the project's
  methodological position.
