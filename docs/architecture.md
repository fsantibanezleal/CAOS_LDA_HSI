# Architecture

CAOS LDA HSI is structured as a lightweight full-stack research demo:

- `app/`: FastAPI backend serving the API and, in production, the built
  React single-page application
- `frontend/`: React + Vite client with bilingual UI and theme support
- `data/manifests/`: human-curated public dataset and methodology
  content
- `data/demo/`: compact generated demo assets used by the interactive UI
- `data/derived/real/`: compact HSI scene summaries and previews
- `data/derived/field/`: compact MSI field summaries and previews
- `data-pipeline/`: deterministic scripts that regenerate the synthetic
  demo payload and derive summaries from downloaded public data
- `deploy/`: systemd and nginx templates for the Hetzner VPS

## API Surface

- `GET /health`
- `GET /healthz`
- `GET /api/overview`
- `GET /api/datasets`
- `GET /api/methodology`
- `GET /api/real-scenes`
- `GET /api/field-samples`
- `GET /api/demo`
- `GET /api/app-data`

## Static Derived Assets

FastAPI also mounts `data/derived/` under `/generated/`, which lets the
frontend load generated previews without copying them into the frontend
build itself.

Examples:

- `/generated/real/previews/pavia-university-rgb.png`
- `/generated/real/previews/pavia-university-labels.png`
- `/generated/field/previews/micasense-example-1-rgb.png`
- `/generated/field/previews/micasense-example-1-ndvi.png`

## Why Static JSON Plus a Pipeline

The application needs two kinds of content:

1. stable editorial content such as theory, dataset curation, and
   bilingual explanations
2. deterministic generated content such as spectra, topic mixtures,
   inference metrics, scene summaries, and generated previews

The first kind belongs in `data/manifests/`. The second belongs in
`data/demo/` plus `data/derived/`, and should be regenerated through
`data-pipeline/`.
