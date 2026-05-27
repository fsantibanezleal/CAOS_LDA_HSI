# Spectral Tokenization Design

This document defines how continuous spectral measurements can become the
discrete documents required by Latent Dirichlet Allocation and related
topic models.

## Purpose

The tokenizer is the scientific bottleneck of the product. A topic model
cannot recover physical structure that was destroyed before the model saw
the data. Tokenization must therefore preserve enough spectral, spatial,
and acquisition context while still producing a compact vocabulary.

The product reset treats tokenization as a first-class workflow step.
Users must see the selected alphabet, word definition, document
definition, corpus size, vocabulary size, and caveats before PTM/LDA
topics are displayed.

## Data Model

The canonical internal objects should be:

- `Scene`: one HSI/MSI cube or external patch collection.
- `Sample`: a logical subset of a scene, such as a point, patch, ROI,
  class region, mineral sample, or UAV field tile.
- `Spectrum`: one vector of band responses.
- `Document`: one tokenized object passed to LDA.
- `Word`: one discrete token derived from spectral or spatial evidence.
- `Corpus`: a collection of documents built under one encoding policy.

## Required Metadata

Every tokenizer run should record:

- source dataset ID
- source scene/sample ID
- band count
- wavelength centers when known
- wavelength units
- preprocessing flags
- normalization method
- quantization method
- document geometry
- random seed
- vocabulary version

Without this metadata, topic comparisons across scenes are not reliable.

## Normalization Choices

### Per-Spectrum Scaling

Each spectrum is scaled independently. This emphasizes shape but removes
absolute albedo differences.

Use when:

- comparing shape-dominated material behavior
- illumination varies strongly
- absolute calibration is weak

Risk:

- can erase meaningful brightness differences between materials

### Per-Band Scaling

Each band is scaled across all spectra. This makes bands comparable as
features but can amplify noisy bands.

Use when:

- the scene has stable calibration
- documents are built from many pixels
- the goal is scene-level classification

Risk:

- scene-specific scaling can hurt cross-scene transfer

### Reflectance-Preserving Scaling

Reflectance values are kept in physical units or minimally transformed.

Use when:

- calibrated reflectance is available
- spectral-library alignment is planned
- mineral/clay absorption interpretation matters

Risk:

- requires careful handling of outliers, bad bands, and sensor artifacts

## Quantization Choices

### Uniform Bins

Divide the response range into fixed-width bins.

Strength:

- simple and reproducible

Weakness:

- poor use of vocabulary when data is skewed

### Quantile Bins

Divide values so each bin has similar frequency.

Strength:

- balanced word counts for LDA

Weakness:

- bin meaning becomes scene-dependent and less physically interpretable

### Physically Anchored Bins

Use reflectance or absorption thresholds based on domain knowledge.

Strength:

- interpretable and stable across scenes

Weakness:

- requires calibrated data and careful expert design

## Vocabulary Families

### Current Minimum Vocabulary

The current app can display compact token lists and topic mixtures. This
is enough for an interactive explanation but not enough for a scientific
claim about minerals, wetlands, or satellite transfer.

### Recommended V1 Vocabulary

For each spectrum:

- `b{band}_q{bin}` for band-intensity evidence
- `g{group}_q{bin}` for wavelength-group evidence
- `slope_{group}_{bin}` for coarse shape behavior

For each patch:

- aggregate spectrum tokens
- add patch-level strata such as `ndvi_low`, `ndvi_mid`, `ndvi_high` when
  MSI vegetation indices exist
- add `texture_{bin}` only when the texture metric is documented

### Recommended Mineral Vocabulary

Mineral and clay workflows should add:

- continuum-removed absorption depth bins
- absorption center bins
- absorption width/asymmetry bins
- spectral-region tags for VNIR, SWIR-1, SWIR-2
- explicit bad-band masks

Do not add mineral labels to tokens unless labels are known. A token
should describe measured behavior, not assume interpretation.

### Recommended Satellite Vocabulary

Satellite and broad land-cover workflows should add:

- Sentinel-2 or Landsat band names when calibrated
- vegetation index strata
- water index strata
- bare-soil or built-up index strata when implemented
- seasonal or acquisition-window metadata only if it is reliable

## Document Granularity

Document granularity controls topic semantics.

| Document Type | Best For | Main Risk |
|---|---|---|
| One spectrum | Pixel or point-level demos | No local context |
| Fixed patch | Satellite and UAV patches | Patch size controls topic meaning |
| ROI/class region | Labeled benchmark summaries | Labels can hide within-class variability |
| Sample window | Drill core, lab scans, field plots | Needs reproducible geometry |
| Band group | Mineral absorption analysis | Requires calibrated wavelengths |

## Comparison Experiments

Every serious representation should be compared with:

- vocabulary size
- document length distribution
- topic coherence proxy
- topic stability across random seeds
- class or target separability in topic-mixture space
- qualitative alignment with known spectral behavior
- sensitivity to quantization bin count
- sensitivity to bad-band removal

## Implementation Requirements

The next tokenizer implementation should expose:

- a pure function from spectra and metadata to documents
- a stable JSON schema for generated corpora
- a vocabulary manifest
- a reversible mapping from token IDs to token meaning
- tests for deterministic output under a fixed seed
- size checks for generated assets

## Known Gaps (pre-V-sweep)

- Current public app assets do not yet store calibrated band centers for
  every scene.
- Current topic tokens are explanation-oriented, not a final tokenizer.
- Patch-level tokens for wetlands, urban scenes, and satellite data are
  not implemented.
- Absorption-feature tokens for minerals and clays are not implemented.
- Topic stability now has a first automated multi-seed component report
  in the local core, but there is still no full sensitivity layer across
  preprocessing, tokenizers, and scene splits.

## V-sweep (issue #606, 2026-05-26)

The above gaps motivated a full V-sweep where twelve concrete wordification
recipes are implemented and benchmarked against the twelve-axis evaluation
framework. The recipes V1..V12 cover the design space:

| V | Token alphabet | Construction |
|---|---|---|
| V1  | (band, q-bin)            | canonical, every band emits one token |
| V2  | q-bin (band-agnostic)    | drop band identity; histogram of intensities |
| V3  | joint (band, bin)        | Cartesian product vocab `B*Q` |
| V4  | derivative-bin           | local d/dλ slope |
| V5  | 2nd-derivative bin       | curvature |
| V6  | wavelet coefficient      | Db4 level-4 DWT |
| V7  | absorption triplet       | continuum-removed + 6 features (centroid, depth, area) |
| V8  | endmember-fraction       | NFINDR + NNLS unmixing |
| V9  | region + SAM             | Felzenszwalb + spectral-angle to region mean |
| V10 | band group               | VNIR / SWIR-1 / SWIR-2 means |
| V11 | product-quantisation     | nanopq M=4 sub-vectors of Q codewords |
| V12 | GMM-component token      | global GMM over band intensities |

Each recipe has been built deterministically for the six labelled scenes
under three quantization schemes (uniform / quantile / lloyd_max) × three
Q values (8 / 16 / 32) = 108 combinations per recipe × 6 scenes = 648
corpora. Topic models are pre-fit only on the canonical `uniform / Q=8`
combination per recipe.

### V-sweep result tables (uniform / Q=8 only)

See the internal technical report `internal_tech_report/03_v_sweep_results.md`
in the paper repo for the full numbers across F-1 macro-F1, F-2 c_v
coherence and F-7 normalised MI.

Cross-axis winner counts (5 labelled scenes; Botswana row partial):

| Recipe | F-1 wins | F-2 wins | F-7 wins | Total |
|---|---|---|---|---|
| V12 | 2 | 3 | 2 | **7** |
| V3  | 0 | 0 | 3 | 3 |
| V2  | 2 | 0 | 0 | 2 |
| V1  | 1 | 2 | 0 | 3 |
| V8  | 1 | 0 | 0 | 1 |

V1 wins zero F-7 cells across all scenes — the strongest single-axis
finding of the sweep. The canonical V1 of P1 is the right *reproducibility*
default but not a universal best.

### UI / code discrepancies fixed during the sweep

- **V3**: original schematic claimed "concat trigram" (3-band context);
  the implementation is joint `(band, bin)` Cartesian product without
  context. The "trigram" framing was a documentation error.
- **V9**: original schematic claimed "SLIC-500 superpixel"; the
  implementation is Felzenszwalb region + spectral-angle to region mean.
  No SLIC. No superpixel aggregation.
- **V11**: nanopq codebook fit is not explicitly seeded; results may
  drift across nanopq versions. Marked "approximate" in P3 until fixed.

These are tracked in `internal_tech_report/01_design_space.md`.
