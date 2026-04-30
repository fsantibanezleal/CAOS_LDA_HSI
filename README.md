# CAOS LDA HSI

CAOS LDA HSI is a public research-oriented web app for explaining and
demonstrating probabilistic topic modelling over multispectral and
hyperspectral data.

The project is built around one central hypothesis: the informative
structure of a sample is not captured by a single representative
spectrum. The relevant signal also lives in the variability across
spectra. Under this view, spectra can be discretized into text-like
tokens, grouped into documents, and analyzed with topic models such as
Latent Dirichlet Allocation (LDA).

## Current Scope

The repository now includes:

- a FastAPI backend that serves both API content and the built SPA
- a React + Vite frontend with English / Spanish UI and dark / light
  theme support
- a compact synthetic topic-modelling demo in `data/demo/demo.json`
- compact derived summaries of five downloaded public HSI scenes in
  `data/derived/real/real_samples.json`
- compact derived summaries of two downloaded official MicaSense MSI
  field orthomosaics in `data/derived/field/field_samples.json`
- reproducible download and build scripts for raw public data under
  `data-pipeline/`
- `legacy/` material preserved as historical reference for the early
  experiments

## Product Surface

- `Datasets`: curated MSI / HSI sources with GitHub-aware size strategy
- `Real HSI scenes`: downloaded UPV/EHU benchmarks with topic summaries
  and previews
- `Field MSI samples`: downloaded MicaSense orthomosaics converted to
  patch corpora and topic summaries
- `Representations`: alternative spectral-to-document encodings
- `Topics`: topic-word and document-topic visualizations
- `Inference`: topic-aware downstream modelling examples
- `Theory`: the conceptual basis for treating spectral variability as
  structured information

## Repository Layout

- `app/`: FastAPI backend
- `frontend/`: React + Vite frontend
- `data/`: manifests, generated demo assets, derived scene summaries,
  and generated previews
- `data-pipeline/`: scripts for demo generation, public-data download,
  and derived-asset creation
- `docs/`: technical and research documentation
- `deploy/`: VPS deployment templates
- `scripts/`: local development and maintenance scripts
- `legacy/`: notebooks and reference papers retained for context

## Technical Documentation

- `docs/theory.md`: theoretical framing, implemented scope, risks, and
  open research questions
- `docs/spectral-tokenization.md`: document/word design, normalization,
  quantization, vocabulary families, and metadata requirements
- `docs/datasets.md`: current local data, under-100 MB expansion
  candidates, external subset sources, and non-claims
- `docs/functional-scope.md`: required workbench behavior and product
  surface rules
- `docs/technical-roadmap.md`: phased implementation and validation plan
- `docs/sources.md`: research and data source references

## Conventions

- Code, comments, docstrings, and documentation are written in English.
- The UI is bilingual from day one: Spanish and English.
- Legacy notebooks remain exploratory references, but they are kept
  tidy: outputs removed, machine-specific artifacts cleaned, and visible
  text normalized to English where practical.
- Large raw datasets are not committed blindly. The repository prefers
  small demo assets, manifests, and reproducible download workflows.

## Local Data Workflow

The app currently uses three data layers:

- a compact synthetic demo in `data/demo/demo.json`
- compact derived HSI scene assets in `data/derived/real/`
- compact derived MSI field assets in `data/derived/field/`

Raw third-party files are downloaded into `data/raw/` and kept out of
Git on purpose.

Useful commands:

```powershell
.\scripts\local.ps1 fetch
.\scripts\local.ps1 fetch-msi
.\scripts\local.ps1 build-real
.\scripts\local.ps1 build-field
.\scripts\local.ps1 demo
.\scripts\local.ps1 dev
```

```bash
./scripts/local.sh fetch
./scripts/local.sh fetch-msi
./scripts/local.sh build-real
./scripts/local.sh build-field
./scripts/local.sh demo
./scripts/local.sh dev
```

## Immediate Next Steps

- Replace the rejected hero-first UI with the professional three-panel
  workbench described in `docs/functional-scope.md`
- Add curated spectral-library subsets for mineral and clay workflows
- Add under-100 MB public data options for minerals, urban scenes,
  vegetation, wetlands, satellite patches, and field multispectral
  examples
- Replace approximate HSI wavelength axes with calibrated band-center
  vectors where available
- Extend real-scene modelling to compare multiple document encodings on
  the downloaded public scenes, not only on the synthetic demo
- Keep production deploys paused until local build, API smoke tests, and
  visual checks pass
