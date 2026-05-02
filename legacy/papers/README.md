# Source Paper

This folder holds the **canonical scientific seed** of `CAOS_LDA_HSI`:
the conference paper that first proposed treating hyperspectral images
of mineral samples as corpora for probabilistic topic modelling, plus
its raw text extraction for offline grep / search.

The full bibliographic context — including earlier and later papers in
the same line of work — lives in [`CITATIONS.md`](CITATIONS.md).

## Files

| File | Type | Purpose |
|---|---|---|
| `Article_FASL_A39_final.docx` | Word document | Working version of the source paper as it was submitted to Procemin Geomet 2022 |
| `Article_FASL_A39_final_extracted.txt` | Plain text | Raw text extraction of the docx, kept for offline search and citation. Contains OCR-style noise (broken superscripts, lost Greek letters); not a clean reading copy. |
| `CITATIONS.md` | Markdown | Bibliographic record of every paper that frames or motivates this repo |
| `README.md` | Markdown | This file |

## Source Paper

**Title.** *Geometallurgical estimation of mineral samples from
hyperspectral images and statistical topic modelling*.

**Authors.** Felipe A. Santibáñez-Leal¹, Alejandro Ehrenfeld², Felipe
Garrido², Felipe Navarro², Álvaro F. Egaña².

**Affiliations.** Advanced Laboratory for Geostatistical Supercomputing
(ALGES), Advanced Mining Technology Center (AMTC), Department of Mining
Engineering, Universidad de Chile, Chile.

**Venue.** 18th International Conference on Mineral Processing and
Geometallurgy — Procemin Geomet 2022 — Gecamin, Santiago, Chile.

**Year.** 2022.

**Public link.** [ResearchGate publication
369708272](https://www.researchgate.net/publication/369708272_Geometallurgical_estimation_of_mineral_samples_from_hyperspectral_images_and_topic_modelling).

**Internal codename.** A39 (the manuscript identifier ALGES used during
preparation; preserved in the filename for traceability).

**ORCID of corresponding author.** [0000-0002-0150-3246](https://orcid.org/0000-0002-0150-3246).

## Abstract (verbatim, lightly cleaned)

> Due to the development and consolidation of classical spectrographic
> techniques, many mining industries have extensive libraries of
> monopixel drill core spectra. In addition, laboratory characterization
> based on multispectral sampling by identifying and comparing reference
> spectral characteristics is used in many industrial processes. This
> work delves into the implementation of statistical generative
> modelling techniques for the characterization of mineral samples
> captured by hyperspectral imaging. The focus is on the generalization
> of previous developments based on hierarchical regression schemes on
> hyperspectral images for the modelling of geometallurgical properties
> that attempt to go beyond the direct identification of reference
> spectral features.
>
> The problem of characterizing the spatial-spectral variability of
> mineral samples is formalized as a topic modelling task, a central
> technique from the field of natural language processing. For this, we
> provide experimental evidence on how to organize hyperspectral pixels
> of a mineral sample for the definition of a corpus and the application
> of the popular topic modelling technique known as Latent Dirichlet
> Allocation (LDA). The use of LDA for the estimation of geometallurgical
> properties is demonstrated by presenting three ways of converting the
> spatial-spectral information to a corpus suitable for the LDA framework.
>
> A set of experiments was developed to validate the proposal. Two
> sample sets are presented for which laboratory characterization of
> geometallurgical properties and mineral occurrence measurements are
> available. These samples have also been captured using hyperspectral
> cameras in SWIR (Short-wave infrared) and VNIR (visible and near-infrared)
> wavelengths.

## Why This Paper Matters For The Repository

This is the paper this repository is rebuilding around. Three
contributions are inherited directly:

1. **The mapping table from HSI to LDA.** The paper formalises three
   distinct corpus recipes (V1, V2, V3) and reports comparative results
   for all three. The current `data/manifests/corpus_recipes.json` and
   `data-pipeline/build_corpus_previews.py` extend that table; they do
   not replace it.

2. **The hierarchical inference idea.** Each topic gets its own local
   regressor; predictions for new samples mix per-topic regressors by
   topic probability. This is the basis of the `Inference` step in the
   current planned web workflow.

3. **The empirical validation pattern.** Compare against a *naive
   per-spectrum baseline*, against a *non-topic clustering baseline*
   (NN), and across all three LDA recipes. This template is what
   `data-pipeline/run_local_core_benchmarks.py` enforces today.

## What This Paper Did *Not* Do (And This Repo Tries To Do)

- It used two laboratory datasets (DB1, DB2) that are **not
  redistributable**. The repo replaces them with publicly redistributable
  alternatives — UPV/EHU labelled scenes, Borsoi unmixing ROIs, USGS
  spectral libraries, MicaSense field samples, and HIDSAG (Family D).
- It did not formally analyse topic stability across seeds, sensitivity
  to quantisation level, or cross-scene transfer. Those are explicit
  validation blocks in the current
  [`offline-validation-plan`](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Offline-Validation-and-Benchmarks)
  layer.
- It did not propose alternative tokenisations beyond V1 / V2 / V3. The
  `docs/spectral-tokenization.md` document plans absorption-feature,
  derivative, slope and patch-strata tokens as planned extensions.
- It did not expose anything publicly as a tool. This repository is the
  attempt to translate the methodology into a reproducible public
  product, with full provenance and conservative claims.

## Cited Foundational Works (From The A39 Paper)

The reference list of the source paper — kept here as the explicit
intellectual lineage of this repository:

- Blei, D. M., Ng, A. Y., Jordan, M. I. (2003). *Latent Dirichlet
  Allocation*. JMLR 3, 993–1022. [doi](http://dx.doi.org/10.1162/jmlr.2003.3.4-5.993)
- Egaña, A. F., Santibáñez-Leal, F. A., Vidal, C., Díaz, G., Liberman,
  S., Ehrenfeld, A. (2020). *A Robust Stochastic Approach to Mineral
  Hyperspectral Analysis for Geometallurgy*. **Minerals** 10(12), 1139.
  [doi](https://doi.org/10.3390/min10121139)
- Achanta, R. et al. (2012). *SLIC superpixels compared to
  state-of-the-art superpixel methods*. **IEEE TPAMI** 34(11),
  2274–2282.
- Heinrich, G. (2005). *Parameter estimation for text analysis*. Tech.
  Report.
- Kruse, F. A. (2012). *Spectral-feature-based analysis of reflectance
  and emission spectral libraries and imaging spectrometer data*. SPIE.
  [doi](https://doi.org/10.1117/12.918233)
- Rehurek, R., Sojka, P. (2010). *Software Framework for Topic
  Modelling with Large Corpora* (gensim). LREC NLP frameworks workshop.
- Sievert, C., Shirley, K. (2014). *LDAvis: A method for visualizing
  and interpreting topics*. ACL Workshop on Interactive Language
  Learning.
- Tarabalka, Y., Benediktsson, J. A., Chanussot, J. (2009).
  *Spectral–spatial classification of hyperspectral imagery based on
  partitional clustering techniques*. **IEEE TGRS** 47(8), 2973–2987.
- Tarabalka, Y., Chanussot, J., Benediktsson, J. (2010). *Segmentation
  and classification of hyperspectral images using watershed
  transformation*. **Pattern Recognition** 43(7), 2367–2379.
  [doi](http://dx.doi.org/10.1016/j.patcog.2010.01.016)
- Theiler, J. P., Gisler, G. (1997). *Contiguity-enhanced k-means
  clustering algorithm for unsupervised multispectral image
  segmentation*. SPIE.
- Villa, A., Chanussot, J., Benediktsson, J. A. (2013). *Unsupervised
  methods for the classification of hyperspectral images with low
  spatial resolution*. **Pattern Recognition** 46(6), 1556–1568.
- Zhai, K., Boyd-Graber, J. (2013). *Online Latent Dirichlet
  Allocation with Infinite Vocabulary*. **ICML** 28(1), 561–569.
- Zhu, M. et al. (2020). *Application of hyperspectral technology in
  detection of agricultural products and food: a review*. **Food Sci.
  Nutr.** 8(10), 5206–5214.

A more complete and updated source list — including the 2023 HIDSAG
*Scientific Data* paper, post-2022 PM-LDA work, and the modern dataset
literature — is maintained in [`CITATIONS.md`](CITATIONS.md) and
[`../../docs/sources.md`](../../docs/sources.md).

## Citing This Repository

If you cite this repository in academic work, the recommended primary
citation is the A39 paper (above). The HIDSAG paper should be cited
when referring to the Family D experiments:

> Santibáñez-Leal, F. A., Ehrenfeld, A., Garrido, F., Navarro, F., Egaña,
> Á. (2023). *HIDSAG: Hyperspectral Image Database for Supervised
> Analysis in Geometallurgy*. **Scientific Data** 10, 154.
> [doi:10.1038/s41597-023-02061-x](https://doi.org/10.1038/s41597-023-02061-x).

## Hygiene Rules

- Do not edit the original `.docx` or `.txt`. They are frozen as
  archived references.
- Do not delete `Article_FASL_A39_final_extracted.txt` because the docx
  parsing pipeline that produced it is not deterministic across machines
  — keeping the extraction stable matters for reproducible search.
- New papers that join the line of work go into [`CITATIONS.md`](CITATIONS.md),
  not as new files here, unless the paper PDF / docx is needed offline.
