# Theoretical Framework

This document defines the technical position behind CAOS LDA HSI. It is
not a marketing summary. It states what the method can currently support,
what remains a research hypothesis, and which assumptions must be tested
before stronger claims are made.

## Core Hypothesis

Many spectral workflows reduce a sample, region, or scene object to one
representative spectrum. That simplification is often practical, but it
throws away the local distribution of spectra. In minerals, vegetation,
wetlands, urban materials, and field imagery, that distribution can carry
information about mixtures, moisture, illumination, alteration, texture,
phenology, and acquisition geometry.

The working hypothesis is:

> A spectral object is often better represented by a distribution of
> recurring spectral regimes than by one average signature.

CAOS LDA HSI tests this hypothesis by converting spectra into
document-like objects and applying probabilistic topic models to the
resulting corpus.

## LDA Model Used As Reference

Latent Dirichlet Allocation models a collection of discrete documents. In
the original formulation:

1. Each document `d` has a topic mixture:
   `theta_d ~ Dirichlet(alpha)`.
2. Each topic `k` has a word distribution:
   `beta_k ~ Dirichlet(eta)`.
3. For each token position `n` in document `d`:
   - draw a latent topic `z_dn ~ Categorical(theta_d)`
   - draw a word `w_dn ~ Categorical(beta_zdn)`

The model does not understand spectra by itself. It only sees counts of
discrete words. Therefore, the scientific value of this project depends
heavily on the spectral tokenization design.

## Spectral-To-Text Translation

The translation layer has three responsibilities:

- define what counts as a document
- define what counts as a word
- preserve enough physical structure after discretization

The current app already exposes three representation families. They are
not final claims; they are controlled probes for comparing how design
choices change topic structure.

### Spectrum-As-Document

One pixel or one sampled spectrum becomes one document. Words encode band
or band-intensity evidence.

Strengths:

- simple to explain
- useful for pixel-level or point-level comparisons
- works with compact public HSI scenes

Limitations:

- weak spatial context
- sensitive to quantization if documents are short
- topics may reflect global band energy more than local material regimes

### Patch-As-Document

A spatial patch, neighborhood, or sample support becomes one document.
Words are aggregated from all spectra inside that support.

Strengths:

- preserves local heterogeneity
- better aligned with field samples, drill-core windows, UAV patches, and
  satellite tiles
- useful for texture, mixture, and transition regimes

Limitations:

- document boundaries influence the result
- patch size controls the scale of the learned topic
- labels may become ambiguous when a patch mixes several classes

### Band-Process Documents

Documents are defined by reduced spectral intervals, derivatives,
absorption regions, or band groups. Words represent behavior inside the
selected spectral region.

Strengths:

- closer to mineral/clay absorption reasoning
- allows targeted comparisons around known wavelength regions
- can reduce noise from irrelevant bands

Limitations:

- requires calibrated band centers
- risks encoding prior assumptions too strongly
- not every public scene includes enough metadata for rigorous use

## Word Design Options

The current implementation uses compact encodings suitable for the public
app. Future versions should compare the following word families.

### Band Tokens

Example: `b042`.

The word indicates that a band contributed evidence but does not directly
encode intensity. This can be useful for ranked-band or event-style
representations, but it is weak when magnitude matters.

### Quantized Intensity Tokens

Example: `q03`.

The word indicates reflectance or normalized response level. This captures
histogram structure but loses wavelength identity unless combined with a
band index.

### Band-Intensity Tokens

Example: `b042_q03`.

This is the most direct classical LDA encoding. It preserves wavelength
identity and discretized magnitude, but increases vocabulary size.

### Spectral-Shape Tokens

Examples: local slope, curvature, continuum-removed absorption depth, or
ratio bins.

These are not fully implemented yet. They are important because minerals,
clays, water, and vegetation stress are often better characterized by
shape and absorption behavior than by raw reflectance values.

### Spatial Tokens

Examples: patch strata, local texture bins, adjacency classes, or
superpixel region IDs.

These are not fully implemented yet. They are required if the method must
distinguish a material signature from a spatial process such as shadow,
soil exposure, wetland boundary transitions, or urban impervious surfaces.

## Why Spectral Variability Matters

Spectral variability can come from several sources:

- material mixtures
- mineral grain size and surface texture
- clay, hydroxyl, oxide, carbonate, or water absorption behavior
- vegetation species, stress, phenology, canopy geometry, and moisture
- wetland water depth, turbidity, emergent vegetation, and soil-water
  transitions
- urban roofing, asphalt, concrete, shadows, and mixed pixels
- illumination, sensor geometry, atmosphere, calibration, and noise

The method must not assume that all variability is useful signal. The
task is to separate structured variability from acquisition artifacts.
Topic modeling is attractive because it can expose recurring regimes, but
it does not prove physical causality by itself.

## Minerals And Clays

The first serious workflow should prioritize minerals and clays because
that domain benefits directly from spectral variability analysis.

Relevant interpretation patterns include:

- VNIR iron oxide and ferric/ferrous behavior
- SWIR hydroxyl and clay absorption regions
- water-related absorption features
- continuum shape, absorption depth, width, and asymmetry
- mixed mineral assemblages rather than single pure signatures

The app must avoid overclaiming. A topic is not automatically a mineral.
It is a probability distribution over spectral tokens. A mineral
interpretation becomes stronger only when topic behavior is compared with
calibrated wavelengths, spectral libraries, known labels, or independent
geochemical variables.

## Vegetation, Wetlands, Cities, And Satellite Data

The method should demonstrate transfer beyond geology.

Vegetation:

- canopy vigor, chlorophyll, water content, shadow, bare soil, stress
- MSI indices such as NDVI are useful references but not the full method
- topic mixtures can summarize patch-level variability across crop or
  vegetation strata

Wetlands:

- water, emergent vegetation, saturated soil, and seasonal transitions
- domain-shift is expected because wetlands vary strongly by scene and
  acquisition condition
- external wetland HSI archives are too large for Git, so curated patches
  are required

Urban scenes:

- roofing, asphalt, concrete, grass, trees, soil, and shadow mixtures
- multimodal data such as Houston 2013 HSI + LiDAR can test whether
  spectral topics align with physical height or material structure

Satellite patches:

- Sentinel-2, Landsat, EnMAP, and BigEarthNet-style patch datasets allow
  the method to be shown on city, vegetation, water, agricultural, and
  seasonal surfaces
- these sources should be subset-driven because full archives are large

## Inference Modes

The product should eventually compare several inference modes.

### Topic Mixture Features

Use `theta_d` as a feature vector for classification, regression, or
retrieval. This is the simplest downstream use.

Current status: partially demonstrated in the synthetic demo.

### Topic-Routed Models

Train specialized models for documents dominated by different topics.
This is useful when one global model underfits heterogeneous regimes.

Current status: conceptual and simulated only.

### Topic-Stability Diagnostics

Run repeated fits and compare whether topics remain stable under seeds,
quantization choices, band subsets, and train/test scene splits.

Current status: not implemented.

### Cross-Scene Transfer

Fit on one scene or source domain and evaluate topic behavior on another.
This is essential for satellite, wetland, urban, and UAV data.

Current status: cataloged as a roadmap item.

### Spectral-Library Alignment

Compare topic word distributions or reconstructed topic spectra against
USGS, ECOSTRESS, HIDSAG, or curated mineral/clay references.

Current status: not implemented.

## What Is Implemented Today

- FastAPI payload for project metadata, methodology, datasets, demo
  samples, real-scene summaries, and field MSI summaries.
- Synthetic compact LDA-style demo with topic mixtures and tokens.
- Derived app assets from five public UPV/EHU HSI scenes.
- Derived app assets from two MicaSense RedEdge orthomosaic examples.
- Bilingual frontend, theme switching, and public repo link.
- Dataset manifest with implemented, cataloged, external, and access-gated
  sources.

## What Is Not Implemented Yet

- Real LDA training inside the app runtime.
- Calibrated wavelength vectors for every scene.
- Continuum removal and absorption-feature tokenization.
- Spectral-library alignment and mineral/clay interpretation confidence.
- Cross-scene topic stability experiments.
- Download scripts for every cataloged source.
- Curated patches from EuroSAT, BigEarthNet, HySpecNet-11k, WHU-Hi,
  Landsat, or wetland archives.
- Production-grade model comparison reports.

## Technical Risks

- Quantization can destroy subtle absorption behavior.
- LDA ignores order unless the encoding injects order explicitly.
- Topics can reflect sensor artifacts, illumination, or preprocessing
  rather than material regimes.
- The same material can appear in multiple topics because LDA topics are
  statistical regimes, not pure endmembers.
- Domain transfer can fail when band centers, atmospheric correction, or
  spatial resolution differ strongly.
- Strong public claims require real validation against labels, spectral
  libraries, or independent response variables.

## Improvement Focus

The highest-value technical improvements are:

1. Add calibrated wavelength metadata wherever available.
2. Implement band-intensity, derivative, and absorption-feature token
   families behind a stable representation interface.
3. Add topic stability diagnostics.
4. Add curated mineral/clay spectral-library slices.
5. Add Cuprite and full Salinas under the 100 MB rule.
6. Add curated satellite, wetland, and urban patch subsets.
7. Compare topic mixtures against standard baselines and simple spectral
   indices instead of showing topics alone.
