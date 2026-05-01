# Functional Scope

This document defines the role of the web application after the product
reset.

The app is not the scientific engine. The app is the interactive surface
used to present, inspect, and validate a compact subset of what the
local backend already computed. If a view cannot be backed by the local
validation core, it should not exist in the public product.

## Product Role

The product has two top-level surfaces:

1. `Context`
2. `Workspace`

`Context` explains the methodological mapping and the dataset families.
`Workspace` lets a user inspect real evidence, representations, topics,
baselines, inference, and validation artifacts.

The app must feel like a scientific instrument panel, not a blog, a
report page, or a static poster.

## Required Top-Level Structure

### Context Surface

Purpose:

- explain the repo thesis
- teach the PTM/LDA mapping
- explain what counts as alphabet, word, document, corpus, topic, and
  topic mixture
- distinguish labeled, unlabeled, library, and measured-region workflows

Allowed content:

- diagrams
- small didactic animations
- interactive toy examples of corpus construction

Disallowed content:

- stock photos
- static screenshots as primary evidence
- narrative text walls that replace inspectable data

### Workspace Surface

Purpose:

- let a user move through the actual methodological flow
- let a user inspect real spectral/image evidence interactively
- compare PTM/LDA against alternative methods
- expose inference and validation only when justified by the data

The workspace may use a three-section structure, but each section must
have a disciplined role.

## Workspace Layout

### Left Section: Scope And Method

Must include:

- dataset family selector
- theme/domain selector
- curated dataset selector within the chosen family
- representation recipe selector
- method/baseline selector
- compact didactic metadata about the selected source:
  supervision state, measurement variables, band count, wavelengths,
  label semantics, acquisition notes, and known caveats

Must not include:

- a flat list of dozens of datasets
- mixed documents, scenes, libraries, and models at the same hierarchy
- controls that do not change the current analytical state

### Center Section: Evidence And Representations

This is the main analytical canvas.

It must support interactive evidence, not screenshots:

- linked spectral plots for hundreds of spectra
- spectral brushing/filtering by class, cluster, topic, superpixel, or
  semantic subset
- interactive image visualization with manual band selection
- precomputed recommended band combinations
- overlay switching for labels, SLIC, topic maps, clustering maps, and
  semantic segmentation when available
- spectral distributions by class/cluster/topic
- corpus previews and tokenization diagnostics
- PTM/LDA outputs and alternative representation views

Rules:

- a scene view without band selection is incomplete
- a spectral view with one or two static lines is incomplete
- if labels exist, the user must be able to compare labels against topic
  or cluster structure
- if labels do not exist, the UI must state that clearly and keep the
  output exploratory

### Right Section: Inference, Comparison, And Validation

Must include:

- current method definition
- feature-space definition
- supervision-use and spatial-use flags
- metric summaries
- comparison outcomes across baselines
- model or regression summaries when applicable
- caveats, failure cases, and interpretation constraints

This section is where the app says what the current result means and what
it does not mean.

## Required Interaction Model

- Changing dataset family resets downstream selectors to compatible
  options only.
- Changing dataset updates available recipes, baselines, overlays, and
  inference options.
- Changing band selection updates the image view, the spectral plot
  context, and any band-dependent overlays.
- Changing cluster/topic/label filter updates both spectral evidence and
  image overlays.
- Changing representation updates corpus diagnostics before topic views.
- Inference panels are hidden when the current dataset lacks labels or
  measurements.
- Validation panels are tied to the selected representation and method,
  not displayed as generic text.

## Visualization Rules

- Interactive spectral curves are mandatory.
- Interactive scene band selection is mandatory for image datasets.
- Precomputed overlays are acceptable; static screenshots are not an
  acceptable primary output.
- Every visualization must answer a named methodological question.
- PCA/UMAP/scatter views are diagnostic only and must declare feature
  space, method, and caveat.
- No topic map may imply a semantic label without external validation.
- No segmentation overlay may imply semantic correctness unless it comes
  from labels or a documented trained model.

## Backend Contract Direction

The current reset depends on the following payload families:

- dataset taxonomy and supervision
- corpus recipes and corpus previews
- segmentation and baseline payloads
- local validation matrix
- local dataset inventory
- local core benchmarks

The older aggregate app payload remains usable for the current technical
checkpoint, but the rebuild should progressively pivot toward the
workflow-oriented reset payloads.

## Implemented Today

Implemented in the repo today:

- local dataset inventory over curated manifests and raw downloads
- first-pass corpus preview payloads
- first-pass SLIC baselines
- first-pass offline PTM/LDA plus supervised and clustering benchmarks
- compact real-scene, field-scene, and spectral-library assets
- current SPA checkpoint with bilingual/theme support

Not yet implemented in the app:

- the rebuilt context/workspace structure
- linked interactive spectral evidence for hundreds of spectra
- scene band selectors wired to the central workflow
- interactive overlay switching across SLIC, topics, clusters, and
  semantic segmentation
- explicit validation-driven right panel

## Immediate Product Focus

1. Extend the local validation core before expanding frontend behavior.
2. Export compact interactive subsets only after they are justified by
   offline results.
3. Rebuild the app around `Context` plus `Workspace`.
4. Remove any remaining poster/report behavior from the current SPA.
