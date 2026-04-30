# Functional Scope

This document defines what the web app should do as a product surface.
It is separate from the theoretical and dataset documentation.

## Product Shape

CAOS LDA HSI is a professional analytical workbench for exploring how
topic models can organize multispectral and hyperspectral variability.
It should not feel like a blog, article, landing page, or static project
poster.

## Required First-Screen Areas

### Header

Must include:

- product name
- workflow context
- language toggle
- light/dark toggle
- visible source repository link

Must not include:

- large hero copy
- decorative marketing claims
- large blank visual zones

### Left Navigator

Must include:

- demo spectral documents
- real HSI scenes
- field MSI samples
- dataset catalog entries
- search or filtering

Purpose:

- make data availability visible immediately
- show local versus cataloged/external status
- support rapid switching without page scrolling

### Center Workbench

Must include:

- selected spectrum or scene summary
- spectral curve or compact spectral representation
- token or quantization visualization
- topic mixture
- topic profile or topic grid
- selected real/field preview when applicable

Purpose:

- keep the analytical object in the center
- avoid a documentation-first layout
- make the method inspectable through visual evidence

### Right Inspector

Must include:

- representation selector
- topic details
- token list
- inference or model comparison summary
- implementation status warnings where needed

Purpose:

- separate controls and interpretation from the central work surface
- make assumptions visible without cluttering the main panel

## Interaction Requirements

- Changing a sample updates the center workbench and inspector.
- Changing representation updates tokens and explanatory text.
- Changing language updates all visible app labels.
- Changing theme must not hide charts, controls, borders, or status
  colors.
- Mobile layout can stack panels, but the first viewport must still show
  app controls and data, not a hero area.

## Visual Requirements

Use the family direction established by Auralis and UnderMineRisk:

- dense and operational
- neutral technical background
- restrained borders
- small radius, usually 6-8 px
- system fonts
- no decorative gradients
- no green/teal/orange brand palette
- blue and cyan accents
- purple only as a minor topic accent
- green only as semantic success/status

## Current Backend Contract

The redesign must preserve the existing backend payload shape:

- `project`
- `methodology`
- `datasets`
- `demo`
- `real_scenes`
- `field_samples`

This allows the UI to be replaced without destabilizing the FastAPI
service or deployment scripts.

## Implemented Functional Surface

The current backend supports:

- app metadata
- methodology principles
- citations
- dataset catalog
- synthetic demo samples
- topic profiles
- inference comparison summary
- real HSI scene summaries and previews
- field MSI sample summaries and previews

## Missing Functional Surface

The app does not yet support:

- user-uploaded cubes
- runtime LDA training
- server-side model jobs
- spectral-library search
- calibrated wavelength inspection for every source
- geospatial map navigation
- downloadable experiment reports
- topic stability reports
- authenticated project storage

## Product Improvement Focus

Short-term:

- professional workbench layout
- clear dataset status labels
- mineral/clay first workflow
- better use of existing real-scene and field-sample summaries

Medium-term:

- tokenizer engine
- spectral-library subsets
- Cuprite and full Salinas
- satellite and wetland patch subsets
- model comparison reports

Long-term:

- upload and tokenize user datasets
- asynchronous model training jobs
- reproducible research reports
- geospatial scene browser
- spectral-library alignment and retrieval
