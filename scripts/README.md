# `scripts/`

This folder is the **single entry point** for setting up, building,
running, and validating the project locally. There are no separate
per-task scripts — everything is exposed as subcommands of the
`local.{ps1,sh}` runner so the surface stays consistent across
Windows, macOS, and Linux.

The deeper documentation lives in:

- `_CAOS_MANAGE/wip/caos-lda-hsi/local-environments-plan.md` — the
  durable two-venv design.
- `_CAOS_MANAGE/runbooks/local-environment-setup.md` — the
  clean-machine recipe.
- The public wiki page
  [Local Reproduction Guide](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Local-Reproduction-Guide).

## Files

| File | Role |
|---|---|
| `local.ps1` | Windows / PowerShell runner — every subcommand lives here |
| `local.sh` | Linux / macOS bash mirror — same subcommands, same flags |
| `smoke.ps1` | Smoke-check runner for the local FastAPI app (Windows) |
| `smoke.sh` | Smoke-check runner for the local FastAPI app (Linux / macOS) |

When a new subcommand is added, **both** `local.ps1` and `local.sh`
must be updated in the same commit. The smoke check workflow in PR
review verifies parity.

## How the project organises Python environments

Two distinct Python venvs ship by design:

| Venv | Path | Purpose | Heavy deps? |
|---|---|---|---|
| Web | `.venv` | runtime backend (FastAPI, uvicorn, ORJSON, pydantic-settings) | no |
| Pipeline | `.venv-pipeline` | data acquisition + derivation + benchmarks (numpy, scipy, scikit-learn, scikit-image, h5py, tifffile, …) | yes |

Plus the frontend Node modules under `frontend/node_modules/`.

Splitting the venvs keeps the production deploy small (the web image
only needs `.venv`) while letting contributors run heavy benchmarks
locally with the full scientific stack.

## Subcommand reference

Run `scripts/local.ps1 help` (or `./scripts/local.sh help`) at any time
for the same list with one-line descriptions.

### Setup

| Subcommand | Effect |
|---|---|
| `setup-web` | Create `.venv` and install `requirements.txt` |
| `setup-pipeline` | Create `.venv-pipeline` and install `data-pipeline/requirements.txt` |
| `setup-frontend` | `pnpm install` (or `npm install`) under `frontend/` |
| `setup-all` | All three above |

Idempotent. Re-running after a dependency upgrade refreshes the venv
without deleting it.

### Web app

| Subcommand | Effect |
|---|---|
| `dev` | Start FastAPI on `127.0.0.1:8105` and Vite on `localhost:5173` (hot reload). Auto-runs setup if needed. |
| `build` | Produce `frontend/dist/` |
| `preview` | Build the frontend and serve the production bundle through FastAPI on `127.0.0.1:8105` (mirrors VPS topology) |
| `demo` | Rebuild the synthetic deterministic LDA demo payload |
| `smoke` | Hit the canonical API + static endpoints and assert `200` |

### Pipeline — fetch (raw data → `data/raw/`)

| Subcommand | Effect |
|---|---|
| `fetch` | UPV/EHU public HSI scenes (Indian Pines, Salinas, Pavia, KSC, Botswana) |
| `fetch-msi` | MicaSense RedEdge field samples |
| `fetch-spectral` | USGS Spectral Library v7 compact archives |
| `fetch-unmixing` | Borsoi Samson / Jasper Ridge / Urban ROIs |
| `fetch-hidsag` | HIDSAG metadata + opt-in ZIPs (`CAOS_HIDSAG_DOWNLOAD_IDS=...`) |
| `fetch-ecostress` | ECOSTRESS public catalogue metadata (bulk gated) |
| `fetch-all` | Run every fetch script in sequence |

`data/raw/` is git-ignored.

### Pipeline — build derived (compact JSON + previews → `data/derived/`)

| Subcommand | Effect |
|---|---|
| `build-real` | UPV/EHU scenes → `data/derived/real/real_samples.json` |
| `build-field` | MicaSense MSI → `data/derived/field/field_samples.json` |
| `build-spectral` | USGS slices → `data/derived/spectral/library_samples.json` |
| `build-analysis` | PCA / KMeans diagnostics |
| `build-corpus` | Corpus previews per recipe |
| `build-baselines` | SLIC segmentation per scene |
| `build-inventory` | Unified local dataset / raw inventory |
| `inspect-hidsag` | HIDSAG ZIP-level metadata |
| `build-hidsag` | HIDSAG curated subset |
| `build-hidsag-band-quality` | Heuristic HIDSAG bad-band summary |
| `build-hidsag-region-documents` | HIDSAG patch-level region documents |
| `build-subset-cards` | Compact public cards under `data/derived/subsets/{id}.json` plus `index.json` (the decoupling layer for the web Workspace and Benchmarks tabs) |

Each script is idempotent.

### Pipeline — benchmarks

| Subcommand | Effect |
|---|---|
| `run-core` | Local PTM/LDA, clustering, stability, SAM, NMF, supervised benchmarks |
| `run-hidsag-sensitivity` | HIDSAG preprocessing-sensitivity benchmark |
| `build-local-core` | Shortcut: inventory + run-core + band-quality + sensitivity |

`run-core` is the heaviest script; allow several minutes on a modern
laptop.

### Maintenance

| Subcommand | Effect |
|---|---|
| `clean` | Remove `frontend/dist`, `frontend/.vite`, `__pycache__` |
| `stop` | Kill local Python and Node processes started from this repo |
| `help` | Print the same reference |

The venvs (`.venv`, `.venv-pipeline`) and `data/raw/` are **not**
removed by `clean`. Delete them manually for a fully clean slate.

## End-to-end clean install in one paragraph

```powershell
git clone https://github.com/fsantibanezleal/CAOS_LDA_HSI.git
cd CAOS_LDA_HSI
.\scripts\local.ps1 setup-all
.\scripts\local.ps1 fetch-all
.\scripts\local.ps1 build-real
.\scripts\local.ps1 build-field
.\scripts\local.ps1 build-spectral
.\scripts\local.ps1 build-analysis
.\scripts\local.ps1 build-corpus
.\scripts\local.ps1 build-baselines
.\scripts\local.ps1 build-inventory
.\scripts\local.ps1 build-hidsag
.\scripts\local.ps1 build-hidsag-band-quality
.\scripts\local.ps1 build-hidsag-region-documents
.\scripts\local.ps1 build-local-core
.\scripts\local.ps1 build-subset-cards
.\scripts\local.ps1 preview
# In a second terminal:
.\scripts\local.ps1 smoke
```

Same shape on Linux / macOS with `./scripts/local.sh ...`.

## Why a single runner instead of per-task scripts

Felipe maintains products on Windows (PowerShell) and on Linux (bash).
A flat `scripts/` directory with one file per task would mean every
new task lands in two files (`*.ps1` + `*.sh`) and the discipline of
keeping them in sync is hard to enforce. The runner pattern pins the
contract in one place per shell, makes `local.ps1 help` the canonical
discovery surface, and lets new subcommands land as a single
`switch` / `case` arm pair.

The trade-off is that the surface lives behind subcommand names rather
than file names. This README is the index that closes that gap.
