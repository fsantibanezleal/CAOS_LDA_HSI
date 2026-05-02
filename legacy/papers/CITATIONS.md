# Bibliographic Lineage Of CAOS_LDA_HSI

This document is the **complete public publication trail** behind this
repository. It explains, in chronological order, where the methodology
came from, what each paper contributed, and how the current repository
inherits or supersedes those contributions.

The author reference is Felipe A. Santibáñez-Leal —
[ORCID 0000-0002-0150-3246](https://orcid.org/0000-0002-0150-3246) —
through his postdoctoral work at ALGES / AMTC, Universidad de Chile,
and earlier collaborations on geostatistical reconstruction and
sampling.

## Direct Methodological Line

These three papers form the spine of `CAOS_LDA_HSI`. The repository's
working hypothesis, validation patterns, datasets, and inference
strategy come from these three papers in order.

### 1. Egaña et al. 2020 — Robust Stochastic Hyperspectral Analysis For Geometallurgy

> Egaña, A. F., Santibáñez-Leal, F. A., Vidal, C., Díaz, G., Liberman,
> S., Ehrenfeld, A. (2020). *A Robust Stochastic Approach to Mineral
> Hyperspectral Analysis for Geometallurgy*. **Minerals** 10(12), 1139.

- DOI: [10.3390/min10121139](https://doi.org/10.3390/min10121139)
- Open access: [mdpi.com/2075-163X/10/12/1139](https://www.mdpi.com/2075-163X/10/12/1139)

**What it contributed.** The first published formulation of the
hierarchical pipeline used by this repository: cluster mineral samples
first, then train a *separate* regressor or classifier per cluster, and
predict by combining cluster-conditional models. It used Nearest
Neighbour clustering on per-spectrum features as the clustering stage.
This work established empirically that a global model over raw spectra
is dominated by a local-per-cluster model on the same data.

**What this repo inherits.** The `Inference` step in the planned web
workflow follows this pipeline directly. The "naive per-spectrum
baseline vs hierarchical" comparison reported in `local_core_benchmarks`
mirrors the experimental design of this paper. The
[`docs/theory.md`](../../docs/theory.md) statement that "topic-routed
models" should beat global baselines is testing the same generalisation
hypothesis on public data.

### 2. Santibáñez-Leal et al. 2022 — A39 — LDA Topic Modelling On HSI

> Santibáñez-Leal, F. A., Ehrenfeld, A., Garrido, F., Navarro, F.,
> Egaña, Á. (2022). *Geometallurgical estimation of mineral samples
> from hyperspectral images and statistical topic modelling*. 18th
> International Conference on Mineral Processing and Geometallurgy
> (Procemin Geomet). Gecamin, Santiago, Chile.

- ResearchGate: [publication 369708272](https://www.researchgate.net/publication/369708272_Geometallurgical_estimation_of_mineral_samples_from_hyperspectral_images_and_topic_modelling)
- Local copy: [`Article_FASL_A39_final.docx`](Article_FASL_A39_final.docx)

**What it contributed.** The replacement of the NN clustering stage of
the 2020 paper by a *probabilistic topic model* (LDA). It introduces
three explicit recipes (V1/V2/V3) for building documents from a
hyperspectral image, fits LDA on the resulting corpus, and uses topic
mixtures to drive the same hierarchical inference scheme. The paper
shows that on the DB1 mineral dataset, the LDA-V1 and LDA-V3
hierarchical regressors achieve a roughly 10× reduction in MAE for
copper recovery compared to the naive per-spectrum regressor, and
clear gains over the NN-clustering hierarchical regressor too.

**What this repo inherits.** Everything in this repository's `corpus`
abstraction is descended from this paper. The current
`data/manifests/corpus_recipes.json` registers the same V1/V2/V3 and
the planned absorption / shape extensions. The notebook
[`legacy/notebooks/LDA_Hyper_legacy.ipynb`](../notebooks/LDA_Hyper_legacy.ipynb)
is the implementation that accompanied this paper.

### 3. Santibáñez-Leal et al. 2023 — HIDSAG: Public HSI Database For Geometallurgy

> Santibáñez-Leal, F. A., Ehrenfeld, A., Garrido, F., Navarro, F.,
> Egaña, Á. (2023). *HIDSAG: Hyperspectral Image Database for
> Supervised Analysis in Geometallurgy*. **Scientific Data** 10, 154.

- DOI: [10.1038/s41597-023-02061-x](https://doi.org/10.1038/s41597-023-02061-x)
- Open access: [nature.com/articles/s41597-023-02061-x](https://www.nature.com/articles/s41597-023-02061-x)

**What it contributed.** A public, redistributable hyperspectral
image database built specifically to enable supervised geometallurgical
research over HSI cubes. HIDSAG ships multiple subsets (geomet,
mineralogy, geochemistry, porphyry, controlled-mineral mixtures), each
with its own per-sample laboratory measurements, and three acquisition
modes: SWIR_low, VNIR_low, VNIR_high. This is the dataset that finally
allows third parties — including this repository's public web app — to
reproduce the kind of validation reported in the 2020 and 2022 papers.

**What this repo inherits.** Everything labelled "Family D" in the
documentation refers to HIDSAG. The local-core benchmarks treat HIDSAG
as the principal supervised testbed for the topic-mixture inference
hypothesis. The pipeline scripts
`data-pipeline/inspect_hidsag_zip.py`,
`data-pipeline/build_hidsag_curated_subset.py`,
`data-pipeline/build_hidsag_band_quality.py`,
`data-pipeline/build_hidsag_region_documents.py` and
`data-pipeline/run_hidsag_preprocessing_sensitivity.py` exist because
HIDSAG is, finally, a public dataset where the methodology can be tested
at the level required by the validation gates.

## Earlier Methodological Background

The author's earlier work that shapes how this repository thinks about
sampling, sparse reconstruction, and information-theoretic
selection — even though they are not topic-modelling papers — is
relevant context.

### Geostatistics And Sparse Reconstruction

- Calderón, H., Silva, J. F., Ortiz, J., **Santibáñez-Leal, F.**, Egaña,
  Á. (2016). *Channelized facies recovery based on weighted compressed
  sensing*. IEEE SAM 2016. [doi](https://doi.org/10.1109/SAM.2016.7569627)
- Calderón, H., Silva, J. F., Ortiz, J. M., Egaña, Á.,
  **Santibáñez-Leal, F.** (2019). *Geological Facies Recovery Based on
  Weighted ℓ₁-Regularization*. **Mathematical Geosciences**.
  [doi](https://doi.org/10.1007/s11004-019-09825-5)
- **Santibáñez-Leal, F.**, Silva, J. F., Ortiz, J. M. (2019). *Sampling
  Strategies for Uncertainty Reduction in Categorical Random Fields:
  Formulation, Mathematical Analysis and Application to Multiple-Point
  Simulations*. **Mathematical Geosciences**.
  [doi](https://doi.org/10.1007/s11004-018-09777-2)
- **Santibáñez-Leal, F.** (2019). *An information-theoretic sampling
  strategy for the recovery of geological images: modeling, analysis,
  and implementation*. PhD dissertation, Universidad de Chile.
  [Repository handle](http://repositorio.uchile.cl/handle/2250/175050)
- **Santibáñez-Leal, F.**, Ortiz, J. M., Silva, J. F. (2020).
  *Ore-Waste Discrimination with Adaptive Sampling Strategy*. **Natural
  Resources Research**.
  [doi](https://doi.org/10.1007/s11053-020-09625-3)

These papers explain why the project consistently insists on:

- explicit feature-space declarations
- sensitivity to sampling design
- conservative interpretation of unsupervised structure
- preference for interpretable, reproducible compositional features

### Hyperspectral / Multispectral Mineral Pipelines (Pre-A39)

- **Santibáñez-Leal, F.**, Jara, C. F., Ehrenfeld, A., Egaña, Á., Vidal,
  C. (2020). *Multi Pixel Stochastic Approach to Mineral Samples
  Spectral Analysis for Geometallurgical Modeling*. Procemin Geomet
  2020. [Gecamin proceedings](https://gecamin.com/procemin.geomet/index.php#home)

This is the bridge paper between the 2020 *Minerals* hierarchical work
and the 2022 LDA-based reformulation: it argues for replacing
single-pixel feature extraction by multi-pixel statistical
descriptors, which is the empirical observation that justifies the
"variability is information" hypothesis.

### Earlier Imaging Work

- **Santibáñez-Leal, F.** et al. (2013). *SOFI of GABAB neurotransmitter
  receptors in hippocampal neurons elucidates intracellular receptor
  trafficking and assembly*. **SPIE Proceedings**.
  [doi](https://doi.org/10.1117/12.2006215)
- Castañeda, V., Cerda, M., Jara, J., Pulgar, E., Palma, K., Lemus,
  C. G., Osorio-Reich, M., Concha, M. L., Härtel, S.,
  **Santibáñez-Leal, F.** (2014). *Computational methods for analysis
  of dynamic events in cell migration*. **Current Molecular Medicine**.
  [doi](https://doi.org/10.2174/1566524014666140128113952)

These pre-doctoral papers are not directly relevant to spectral topic
modelling, but they explain why the author insists on validated image
quantification pipelines and on resisting "pretty visualisation without
methodological substance" — a principle baked into the current
[`product-reset`](https://github.com/fsantibanezleal/CAOS_MANAGE) plan.

### Geophysics / Mineral Targeting

- Comte, D., **Santibáñez-Leal, F.** (2021). *Analysis of seismic
  tomography and geological data to identifying spatial relationships
  between large ore deposits in northern Chile using machine learning
  methods: Preliminary results*. AGU Fall Meeting.
  [adsabs](https://ui.adsabs.harvard.edu/abs/2021AGUFM.H35M1172C/abstract)

A geophysical-side application that motivates the cross-domain
generalisation hypothesis the wiki and the planned `cross-scene
transfer` validation block are designed to test.

## Foundational PTM / LDA Literature Used

The methodological scaffolding of this repository sits on the standard
LDA literature plus a few topic-modelling extensions that have direct
bearing on spectral data.

- Blei, D. M., Ng, A. Y., Jordan, M. I. (2003). *Latent Dirichlet
  Allocation*. **JMLR** 3, 993–1022.
  [doi](http://dx.doi.org/10.1162/jmlr.2003.3.4-5.993)
- Heinrich, G. (2005). *Parameter estimation for text analysis*. Tech.
  Report.
- Rehurek, R., Sojka, P. (2010). *Software Framework for Topic
  Modelling with Large Corpora* (gensim). LREC NLP frameworks workshop.
- Sievert, C., Shirley, K. (2014). *LDAvis: A method for visualizing
  and interpreting topics*. ACL Workshop on Interactive Language
  Learning.
- Zhai, K., Boyd-Graber, J. (2013). *Online Latent Dirichlet
  Allocation with Infinite Vocabulary*. **ICML** 28(1), 561–569.

## Foundational HSI Literature Used

For the spectral and clustering side:

- Achanta, R. et al. (2012). *SLIC superpixels compared to
  state-of-the-art superpixel methods*. **IEEE TPAMI** 34(11),
  2274–2282.
- Kruse, F. A. (2012). *Spectral-feature-based analysis of reflectance
  and emission spectral libraries and imaging spectrometer data*. SPIE
  XVIII. [doi](https://doi.org/10.1117/12.918233)
- Tarabalka, Y., Benediktsson, J. A., Chanussot, J. (2009).
  *Spectral–spatial classification of hyperspectral imagery based on
  partitional clustering techniques*. **IEEE TGRS** 47(8), 2973–2987.
- Tarabalka, Y., Chanussot, J., Benediktsson, J. (2010). *Segmentation
  and classification of hyperspectral images using watershed
  transformation*. **Pattern Recognition** 43(7), 2367–2379.
- Theiler, J. P., Gisler, G. (1997). *Contiguity-enhanced k-means
  clustering algorithm for unsupervised multispectral image
  segmentation*. SPIE.
- Villa, A., Chanussot, J., Benediktsson, J. A. (2013). *Unsupervised
  methods for the classification of hyperspectral images with low
  spatial resolution*. **Pattern Recognition** 46(6), 1556–1568.

## Modern Extensions Of Interest

These are not authored by the project; they are the modern literature
the active research memo
([`docs/research-memo-2026-05.md`](../../docs/research-memo-2026-05.md))
will track as candidate extensions:

- Wahabzada, M. et al. — plant hyperspectral LDA work for stress
  detection.
- Zou, S., Zare, A. — *Partial-Membership Latent Dirichlet Allocation*
  (PM-LDA) and semi-supervised PM-LDA for hyperspectral unmixing and
  endmember variability.
- Borsoi, R. A. et al. — endmember variability and bundle approaches
  for HSI unmixing.
- Dieng, A. B., Ruiz, F., Blei, D. M. — *Embedded Topic Models* and
  follow-on neural topic models.
- Recent (2023+) survey and method papers on HSI representation
  learning, transformers, and contrastive embeddings, to be tracked in
  the research memo.

The research memo is updated when new state-of-the-art papers materially
change the recipe, dataset, or validation tables of this repository.

## Maintenance Rule

When a new paper joins the line of work — by Felipe or by close
collaborators — its full citation goes here, with a one-paragraph
"what it contributed / what this repo inherits" entry. Major updates to
this file should also be reflected in
[`../../docs/sources.md`](../../docs/sources.md) and in the public wiki
References page.
