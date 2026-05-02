# Research memo — Probabilistic Topic Modelling on hyperspectral and multispectral data (2026-05)

**Author:** Felipe Santibáñez-Leal (ORCID 0000-0002-0150-3246)
**Project:** CAOS_LDA_HSI public web product
**Scope:** state of the art, datasets, baselines, validation, decision tables and open questions for a postdoctoral-grade public repository on PTM/LDA for HSI/MSI.

This memo extends the methodological line started in Egaña, Santibáñez-Leal *et al.* "A Robust Stochastic Approach to Mineral Hyperspectral Analysis for Geometallurgy" (Minerals, 2020) and the HIDSAG database (Santibáñez-Leal, Ehrenfeld & Egaña, *Scientific Data* 2023, DOI 10.1038/s41597-023-02061-x), and continues the research direction of the 2022 Procemin contribution (multi-pixel stochastic spectral analysis for geometallurgy). The central hypothesis is operational: in HSI/MSI, **spectral variability is not noise but a corpus**; *groups of spectra* (patches, ROIs, samples, hierarchical regions) act as documents and topics emerge from spectral words. The memo audits how strongly the literature supports this stance, where the public app should commit, and where it should foreground honest open questions.

---

## 1. PTM/LDA on spectral data: state of the art 2018-2026

### 1.1 The Wahabzada / Kersting line — "the hyperspectral language of plants"

Wahabzada *et al.* "Plant Phenotyping using Probabilistic Topic Models: Uncovering the Hyperspectral Language of Plants" (*Scientific Reports* 6, 22482, 2016 — note: often cited as 2015 but the Nature record is 2016; PMID 26957018) is the canonical reference for treating HSI cubes as a corpus. The pipeline "wordifies" hyperspectral leaf images of barley (*Hordeum vulgare*) inoculated with *Pyrenophora teres*, *Puccinia hordei*, and *Blumeria graminis hordei*, then applies a regularised LDA. **Corpus representation:** each spectrum is discretised, each pixel becomes a small bag of "words" derived from quantised reflectance/derivative information, each leaf is the document. **Validation:** topics align with biological structure (border vs. centre of powdery mildew pustules; symptom progression curves) and with disease-progression scores. **Gain over baselines:** the qualitative output (interpretable topic-time trajectories) is the headline; quantitative gain over SVM/Random Forest is not the central claim. **Limitations reported:** quantisation choice is heuristic, the bag-of-words assumption discards spectral order, and topics are leaf-corpus specific (no cross-cultivar transfer demonstrated).

The same group's earlier "Metro Maps of Plant Disease Dynamics" (Wahabzada, Mahlein, Bauckhage, Steiner, Oerke & Kersting, *PLOS ONE* 10(1):e0116902, 2015) introduced metro-map visualisations of disease dynamics from hyperspectral data — methodologically a precursor to the topic-model paper, proving that schematic, document-style abstractions are useful for plant-pathology communication. Follow-up applied work (Kuska, Brugger, Thomas, Wahabzada, Kersting *et al.*, *Phytopathology* 2017, on barley resistance reactions to *B. graminis*) consolidated the line but mostly reused the topic-model pipeline as a feature extractor rather than refining the model itself.

### 1.2 The Zou & Zare PM-LDA family — endmember variability as partial membership

Zou & Zare introduced **Partial Membership LDA (PM-LDA)** in two interlocking papers: "Hyperspectral Unmixing with Endmember Variability using Partial Membership Latent Dirichlet Allocation" (arXiv 1609.03500, 2016; IEEE WHISPERS / IEEE Xplore 7953348) and "Partial Membership Latent Dirichlet Allocation" (arXiv 1612.08936; later in *IEEE TIP*, PMID 28792897). The semi-supervised variant (arXiv 1703.06151, 2017) and a co-listed soft-segmentation paper extend the same idea. **Corpus representation:** superpixels are documents; each document is a set of pixels (continuous-valued spectral words modelled by the Normal Compositional Model rather than a discrete vocabulary); topics are endmembers represented as multivariate normal distributions; abundances follow a Dirichlet. **Validation:** Cuprite, Pavia, MUUFL Gulfport — endmember recovery RMSE and abundance accuracy. **Gain over baselines:** PM-LDA matches or modestly outperforms VCA + FCLS on data with strong endmember variability and benefits from spatial coherence introduced by the superpixel "document" definition. **Limitations:** computational cost of MCMC inference, sensitivity to superpixel granularity, and the Normal-compositional assumption on endmembers is strong for materials with multimodal spectral classes.

This line is the closest existing analogue to the present project's "groups of spectra are documents" hypothesis. It is the natural quantitative baseline against which V1/V2/V3 representations should be benchmarked.

### 1.3 Borsoi *et al.* — spectral variability as a first-class object

Borsoi, Imbiriba, Bermudez, Richard, Chanussot, Drumetz, Tourneret, Zare & Jutten, "Spectral Variability in Hyperspectral Data Unmixing: A Comprehensive Review" (*IEEE Geoscience and Remote Sensing Magazine* 9(4):223-270, 2021; arXiv 2001.07307; DOI 10.1109/MGRS.2021.3071158) is the field's reference review. The companion toolbox is at github.com/ricardoborsoi/unmixing_spectral_variability. The review classifies methods by how variability is modelled (parametric/extended LMM, Gaussian/Beta endmember distributions, **endmember bundles**, tensor and dictionary models, Bayesian and deep approaches). **Endmember bundles** are particularly relevant here: instead of one endmember per material, a *bundle* of representative spectra is allowed — operationally close to "topic = distribution over spectral words". Borsoi's PhD thesis (HAL tel-03253631, 2021) and Ayres, Borsoi, Bermudez & de Almeida "A Generalized Multiscale Bundle-Based Hyperspectral Sparse Unmixing Algorithm" (arXiv 2401.13161, 2024) push this into multiscale formulations. The newer "A General Framework for Group Sparsity in Hyperspectral Unmixing Using Endmember Bundles" (arXiv 2505.14634, 2025) further generalises. **Limitation reported across the line:** none of these methods explicitly use a probabilistic topic-model objective on a discrete vocabulary; they remain in the linear-mixing / dictionary world. The CAOS_LDA_HSI line is the dual: same intuition, different modelling commitment (discrete tokens, document-level Dirichlet).

### 1.4 Supervised topic models on spectral data

Supervised LDA (Blei & McAuliffe 2007/2010, *Statistical Science*; arXiv 1003.0783; class-sLDA implementation github.com/blei-lab/class-slda) and multi-class sLDA (Wang, Blei & Fei-Fei, CVPR 2009) attach a response variable (regression target or categorical label) to each document. MedLDA (Zhu, Ahmed & Xing, *JMLR* 13:2237-2278, 2012) extends this with maximum-margin objectives. **Spectral applications are sparse.** The closest direct uses are: (i) "Latent Dirichlet Allocation Models for Image Classification" (Bosch *et al.*, *IEEE TPAMI* 2013, DOI 10.1109/TPAMI.2013.69) which is image- not HSI-specific but is widely cited as the template; (ii) the integrated visual-vocabulary LDA for IKONOS scene classification (*J. Applied Remote Sensing* 8(1):083690, 2014); (iii) various RS scene-classification papers that adopt bag-of-visual-words + LDA as a feature pipeline before SVM. There is **no widely-cited sLDA paper that uses a sample-level geometallurgical or mineralogical response variable**, which is precisely the gap HIDSAG opens.

### 1.5 Hierarchical Dirichlet Processes / nonparametric topic models

The HDP (Teh, Jordan, Beal & Blei, *JASA* 101:1566-1581, 2006) is the standard nonparametric sibling of LDA. Zhai & Boyd-Graber, "Online Latent Dirichlet Allocation with Infinite Vocabulary" (ICML 2013, *PMLR* 28:561-569; cited in the A39 paper) extends LDA so that the vocabulary is itself drawn from a Dirichlet process over strings — vocabulary grows online. **Spectral applications:** rare. The closest are (i) Dirichlet-process Gaussian-mixture segmentation of hyperspectral scenes (arXiv 2203.02820, 2022), (ii) the Kyung Hee group's "Hyperspectral image classification based on Dirichlet Process mixture models", and (iii) Bayesian nonparametric unmixing (arXiv 1702.08007, 2017). **No paper to date uses an explicitly HDP-flavoured topic model with an infinite spectral vocabulary** — this is a real opening for the project, especially given that quantisation choice is the single most fragile knob in V1/V2/V3.

### 1.6 Neural Topic Models / Embedded Topic Models on spectra

Dieng, Ruiz & Blei, "Topic Modeling in Embedding Spaces" (*TACL* 8, 2020; arXiv 1907.04907; DOI 10.1162/tacl_a_00325; code github.com/adjidieng/ETM) introduces **ETM**, where words and topics live in a shared embedding space — robust to large heavy-tailed vocabularies. The Dynamic ETM (arXiv 1907.05545, 2019) adds time. **Spectral applications:** to date none direct; the closest in spirit is Variational Gaussian Topic Model (Neural Computing & Applications, 2023, DOI 10.1007/s00521-023-09070-2). However, the most consequential 2024 paper for this project is **Mantripragada, Qureshi *et al.* "Hyperspectral Pixel Unmixing With Latent Dirichlet Variational Autoencoder" (LDVAE)** (*IEEE TGRS* 62:5757589, 2024; arXiv 2203.01327; IEEE Xplore 10414262) — a Dirichlet-bottleneck VAE where abundances are a Dirichlet over endmembers and endmembers are multivariate normals; tested on Cuprite, Urban-HYDICE, Samson; introduces synthetic dataset *OnTech-HSI-Syn-21*. The same authors' **SpACNN-LDVAE** (arXiv 2311.10701, 2024; IEEE 10640940) adds spatial attention. The follow-up "Latent Dirichlet Transformer VAE for Hyperspectral Unmixing with Bundled Endmembers" (arXiv 2511.17757, 2025) explicitly fuses the bundle idea (Borsoi line) with the LDA-VAE idea (PM-LDA line). **This is the most active 2024-2025 frontier and the natural neural baseline for the public app.**

### 1.7 Bayesian unmixing and its overlap with topic modelling

Bayesian unmixing (Dobigeon, Tourneret, Altmann, Eches and collaborators) shares many priors with PM-LDA: Dirichlet on abundances, Gaussian or t-distributed noise, spatial Markov priors. Altmann *et al.* "Bayesian Nonlinear Hyperspectral Unmixing With Spatial Residual Component Analysis" (*IEEE TGRS* 53(11):6205-6218, 2015) and Eches, Dobigeon, Tourneret variants incorporate spatial group sparsity and Gaussian-mixture endmember models. The conceptual overlap with topic modelling is strong (latent allocations, Dirichlet priors, MCMC inference). The main difference is that unmixing keeps spectra continuous; topic modelling commits to a discrete tokenisation. Both should be ablated against each other.

### 1.8 Recent (2023-2026) explicit LDA-on-HSI papers

Beyond LDVAE and SpACNN-LDVAE (1.6), genuine 2023-2026 papers using **classical** LDA on RS/HSI are scattered: soil-study coastal HSI with K-means + LDA (RG 348028249, 2020); EnGeoMAP 2.0 (Boesche *et al.*, *Remote Sensing* 8(2):127, 2016) is a non-LDA mineral-mapping pipeline often confused with one. The HSI classification surveys (Ahmad *et al.*, "A Comprehensive Survey for Hyperspectral Image Classification: The Evolution from Conventional to Transformers and Mamba Models", arXiv 2404.14955; Neurocomputing 2025 DOI 10.1016/S0925-2312(25)11002-X) treat LDA as a niche conventional method that has been displaced from leaderboards by transformers / Mamba — but **none of these surveys engage with the document-construction question**, which is exactly the conceptual opening this project occupies.

**Net assessment.** The PTM/LDA line on HSI is alive but fragmented along three independent branches (plant-phenotyping topic models; PM-LDA/LDVAE unmixing; nonparametric Bayesian unmixing). No public, reproducible web product currently sits at their intersection.

---

## 2. Spectral tokenisation strategies

The choice of "what is a spectral word" is the single largest design decision. The table below consolidates known strategies plus the three from the A39 paper (HIDSAG-derived):

| Strategy | Word definition | Wavelength id preserved? | Shape preserved? | Vocab. size | Sparsity | Bad-band robustness | Reference / use |
|---|---|---|---|---|---|---|---|
| **V1 (A39)** | wavelength = word, count = sum of quantised intensity | Yes (B words) | No (orderless within band) | B | Dense per pixel | Low — bad band = noisy word | A39 paper internal |
| **V2 (A39)** | quantised intensity bin = word, count = #bands hitting that bin | No | No (orderless across bands) | Q (≤ ~32) | Low (small alphabet) | Medium — bad band perturbs counts uniformly | A39 paper internal |
| **V3 (A39)** | concatenated tokens (band, bin) preserving each spectrum as ordered sequence | Yes (per token) | Partially (sequence position is implicit) | B·Q | Sparse | Medium-high — can mask bad bands | A39 paper internal |
| **Continuum-removed absorption tokens** | depth, position, area, asymmetry of each absorption feature | Yes (per feature) | Yes (feature shape) | Open / parametric | Very sparse | High — designed to ignore baseline drift | Clark & Roush; Kokaly USGS Tetracorder; Carbonate inversion (ScienceDirect S016913682400060X, 2024) |
| **Spectral-derivative tokens** | sign/magnitude of 1st/2nd derivative across band groups | Yes (per group) | Yes (local slope) | Moderate | Dense | Low — derivatives amplify noise | Tsai & Philpot 1998; *IEEE TGRS* 39(7), 2001 |
| **Wavelet-coefficient tokens** | wavelet coefficient at scale-position quantised to bin | Partially (scale-position) | Yes (multi-scale shape) | Large | Sparse | High at large scales | Bruce *et al.* (2002); *Int. J. Remote Sensing* 2022 (DOI 10.1080/01431161.2022.2147036) |
| **Slope/curvature tokens** | quantised slope between adjacent band groups | Yes (per group) | Yes (local trend) | Small-moderate | Dense | Medium | Egaña, Santibáñez-Leal *et al.* 2020 (Minerals 10(12):1139) |
| **Co-occurrence "biwords"** | ordered pair (word_i, word_{i+k}) within a spectrum | Yes (positional) | Yes (local context) | B·Q×B·Q | Very sparse | Medium | Bag-of-biwords analogue from NLP; HSI bipartite graph co-clustering (*Multimedia Systems* 2015) |
| **HDP-LDA / infinite-vocabulary tokens** | tokens drawn from open string-DP base distribution | Yes (per token) | Depends on base | Unbounded | Very sparse, growing | Self-pruning | Zhai & Boyd-Graber 2013 — **not yet applied to HSI** |
| **BoVW codebook tokens** | k-means codebook over per-pixel/per-superpixel descriptors | Codebook-internal | Codebook-internal | k (chosen) | Sparse | Medium | *Remote Sensing* 12(16):2633, 2020 (BoW-on-superpixels for vegetation) |
| **Transformer patch tokens** | learned spatial-spectral patch embedding | Implicit | Yes | Continuous (embedding) | Dense | Medium-high | SpectralFormer (Hong *et al.*, *IEEE TGRS* 2022, DOI 10.1109/TGRS.2021.3130716) |

**Reading.** V1/V2/V3 occupy a coherent corner of this design space (discrete, interpretable, no learned embedding). Continuum-removed absorption tokens are the natural mineralogy-aware extension; wavelet/derivative tokens are the natural shape-aware extensions; HDP-LDA is the natural answer to the quantisation-fragility problem. Biwords are a cheap extension worth a one-night experiment. BoVW codebook tokens are the natural compression layer if vocabulary explodes.

**Important caveat.** No published HSI work, to the author's knowledge as of 2026-05, has systematically benchmarked V1/V2/V3-style representations against each other on a public corpus. The A39 paper's three-way comparison is itself a contribution.

---

## 3. Document-construction strategies

The "document is a group of spectra" hypothesis is supported in pieces across the literature, but rarely articulated as the primary design choice.

| Strategy | Document = | Where used | Pros | Cons |
|---|---|---|---|---|
| Pixel-as-document | one spectrum | Bosch *et al.* TPAMI 2013; classical BoVW pipelines | trivial, full resolution | tiny "documents", topic-pixel collapse |
| Patch / superpixel-as-document | SLIC or similar segment | PM-LDA (Zou & Zare 2016/2017); SpACNN-LDVAE (2024); Hierarchical-homogeneity superpixels (arXiv 2407.15321, 2024) | spatial coherence; tractable doc count | sensitive to superpixel size; mixed pixels at boundaries |
| ROI / class-region documents | ground-truth or expert ROI | Wahabzada 2016 (leaf-region documents); Houston 2018 DFC | strong supervision signal | depends on labels; overfits ROI shape |
| Sample-as-document (lab MSI/HSI) | a whole rock or leaf scan | HIDSAG (Santibáñez-Leal *et al.* 2023); Egaña *et al.* 2020 | matches measurement protocol; aligned with chemistry | few documents per dataset |
| Hierarchical sample → region → spectrum | nested levels with shared topics | implicit in Egaña *et al.* 2020 hierarchical regression; HDP-style construction not yet realised on HSI | flexible; supports cross-sample transfer | inference cost; identifiability |
| Block / quadrant documents | regular spatial tile | Foundation-model pretraining tiles (SpectralEarth, 2024) | massive corpus | semantic incoherence within tile |

**Papers that explicitly claim within-document spectral variability is informative rather than noise:**
- Egaña, Santibáñez-Leal *et al.*, *Minerals* 10(12):1139 (2020) — frames acquisition as inherently stochastic and exploits the full distribution.
- Zou & Zare (2016/2017) PM-LDA — the partial-membership formulation is precisely "variability inside the document carries the signal".
- Borsoi *et al.* 2021 review — endmember bundles operationalise the same intuition.
- Mantripragada *et al.* (LDVAE 2024) — the Dirichlet bottleneck encodes multi-endmember mixtures per pixel.

The HIDSAG line, with its sample-as-document structure plus geometallurgical response variables, is the most natural test bed for this principle at scale.

---

## 4. Public datasets — comprehensive 2026 inventory

Family codes: **A** = individual labelled spectra; **B** = labelled hyperspectral images; **C** = unlabelled hyperspectral images; **D** = regions + measurements (geomet/chem responses).

### 4.1 Family A — labelled spectral libraries

| Dataset | Source / DOI | License | Size | Bands | Range | Labels | Access | Redistributable subset? |
|---|---|---|---|---|---|---|---|---|
| **USGS Spectral Library v7** (splib07a, Kokaly *et al.* 2017) | DOI 10.5066/F7RR1WDJ; pubs.usgs.gov/publication/ds1035 | Public domain (USG) | ~2.6 GB | varies (1075-4280 channels lab) | 0.2-200 µm | Mineral / chemical / biological | Direct | Yes — ship distilled subset |
| **USGS Spectral Library v8** | not publicly announced as of 2026-05 — flag as "uncertain" | — | — | — | — | — | — | — |
| **ECOSTRESS Spectral Library v1.0** | speclib.jpl.nasa.gov; Meerdink *et al.* RSE 230, 2019 (DOI 10.1016/j.rse.2019.05.015) | Educational/research | >3000 spectra | varies | 0.35-15.4 µm | Material categories | Web UI; **bulk download is gated** (must batch via category) | Yes — distilled subset; verify ECOSTRESS terms |
| **JHU spectral library** (subset of ECOSTRESS) | speclib.jpl.nasa.gov/documents/jhu_desc | Same as ECOSTRESS | — | — | 0.4-14 µm | Rocks/minerals/soils | Same | Same |
| **ASTER Spectral Library v2.0** | NWP-SAF mirror; integrated into ECOSTRESS | Same | ~2400 | — | 0.4-15.4 µm | Materials/vegetation | Same | Same |

### 4.2 Family B — labelled HSI scenes

| Dataset | Source | License | Size | Bands | Range | Spatial | Labels | Access | Redistributable? |
|---|---|---|---|---|---|---|---|---|---|
| **Indian Pines** (AVIRIS) | UPV/EHU GIC; ehu.eus/ccwintco | CC-BY-style academic | ~6 MB | 200 (220 raw) | 0.4-2.5 µm | 145×145 | 16 classes | Direct | Yes — already redistributed widely |
| **Salinas / Salinas-A** | UPV/EHU GIC | Same | ~10 MB | 204 | 0.4-2.5 µm | 512×217 / 86×83 | 16 classes | Direct | Yes |
| **Pavia U / Pavia C** (ROSIS) | UPV/EHU GIC | Same | ~30 MB | 103 / 102 | 0.43-0.86 µm | 610×340 / 1096×1096 | 9 classes | Direct | Yes |
| **KSC** (Kennedy Space Center, AVIRIS) | UPV/EHU GIC | Same | ~10 MB | 176 | 0.4-2.5 µm | 512×614 | 13 classes | Direct | Yes |
| **Botswana** (EO-1 Hyperion) | UPV/EHU GIC | Same | ~30 MB | 145 (242 raw) | 0.4-2.5 µm | 1476×256 | 14 classes | Direct | Yes |
| **WHU-Hi-LongKou / HanChuan / HongHu** | RSIDEA Wuhan Univ.; Zhong *et al.* RSE 250, 2020 (arXiv 2012.13920); HF danaroth/whu_hi | Academic, redistribution permitted with attribution | hundreds of MB to GB each | 270 (Nano-Hyperspec) | 0.4-1.0 µm | UAV cm-scale | Crops, fine | Direct | Yes — verify per-scene attribution |
| **HyRANK Dioni / Loukia** (ISPRS) | Karantzalos *et al.* 2018; Zenodo 10.5281/zenodo.1222201 | CC-BY 4.0 | ~100 MB | 176 | 0.4-2.5 µm | 250×1376 / 249×945 | 14 classes | Direct (Zenodo) | Yes |
| **HyRANK Erato / Nefeli / Kiriki** | Same | Same | similar | 176 | 0.4-2.5 µm | varies | unlabelled (validation) | Same | Yes |
| **Houston 2013 / 2018 / 2020 GRSS DFC** | hyperspectral.ee.uh.edu; IEEE DataPort | Academic, registration required | hundreds of MB | 144/48 | 0.38-1.05 µm (2018 HSI) | various | 15-20 urban classes | Login-gated | Partial — links + scripts; do not redistribute raw |
| **EuroSAT (Sentinel-2 MSI)** | Helber *et al.* 2019 (DOI 10.1109/JSTARS.2019.2918242); github.com/phelber/EuroSAT; Zenodo 7711810 | MIT-style | 2 GB MS / 90 MB RGB | 13 (10 used) | 0.4-2.4 µm | 64×64 patches × 27000 | 10 LULC | Direct | Yes |

### 4.3 Family C — large unlabelled HSI archives (foundation-model scale)

| Dataset | Source | License | Bands | Range | Coverage | Notes |
|---|---|---|---|---|---|---|
| **EMIT** (ISS, 2022-) | earth.jpl.nasa.gov/emit; LP DAAC | Free | 285 | 0.38-2.5 µm | Global arid lands; extended through ≥2026 | L1B/L2A/L2B mineralogy products available |
| **EnMAP** (DLR, 2022-) | enmap.org; geoservice.dlr.de | Free with registration | 224 | 0.42-2.45 µm | Global on-demand | Guanter *et al.* 2024 RSE follow-up |
| **PRISMA** (ASI, 2019-) | prisma.asi.it | Free with registration | 240 | 0.4-2.5 µm | Global on-demand | HDF5; needs ASI account |
| **HISUI** (JAXA on ALOS-3 / ISS) | JAXA portal | Restricted | 185 | 0.4-2.5 µm | Japan + targeted | Status: limited public access as of 2026-05 |
| **AVIRIS / AVIRIS-NG** (NASA JPL) | aviris.jpl.nasa.gov; avirisng.jpl.nasa.gov/dataportal | Free | 224 / 425 | 0.36-2.51 µm | US + campaigns | KML-indexed; large per-scene |
| **HyTES** (NASA JPL airborne, TIR) | hytes.jpl.nasa.gov | Free | 256 | 7.5-12 µm | US campaigns | Thermal complement |
| **NEON AOP** | neonscience.org | CC0 (US-NSF) | 426 | 0.38-2.51 µm | 81 NEON sites US/PR | Repeat annual; co-LiDAR |
| **SpectralEarth** (DLR, 2024) | geoservice.dlr.de/web/datasets/enmap_spectralearth; arXiv 2408.08447 | Same as EnMAP | 202 (after BB removal) | 0.42-2.45 µm | 538,974 patches, 11,636 scenes, 2 yr | Built specifically for foundation models |

### 4.4 Family D — regions + measurements (the HIDSAG niche)

| Dataset | Source | License | Modalities | Variables | Access | Redistributable? |
|---|---|---|---|---|---|---|
| **HIDSAG MINERAL1** | Santibáñez-Leal *et al.* *Sci Data* 2023 DOI 10.1038/s41597-023-02061-x; figshare 19726804; github.com/alges/hidsag | CC-BY 4.0 | SPECIM VNIR_low, VNIR_high, SWIR_low (HDF5) | mineralogy, geochem | Direct | Yes — author repo |
| **HIDSAG PORPHYRY** | figshare 19726822 | CC-BY 4.0 | Same | mineralogy, geochem, geomet | Direct | Yes |
| **HIDSAG GEOMET / TRAINING / VALIDATION** | as referenced in deployments docs | CC-BY 4.0 | Same plus geomet response | grindability, recovery proxies | Direct | Yes |
| **Samson** | Zhu et al. dataset; lesun.weebly.com | Academic | AVIRIS subset | 3 endmembers (soil/tree/water) | Direct | Yes |
| **Jasper Ridge** | Same | Academic | AVIRIS subset | 4 endmembers | Direct | Yes |
| **Urban (HYDICE)** | Same | Academic | HYDICE | 4-6 endmembers | Direct | Yes |
| **Cuprite** (mineral mapping benchmark) | aviris.jpl.nasa.gov; Tetracorder maps via USGS | Public | AVIRIS | 12 minerals | Direct | Yes |
| **MUUFL Gulfport** | github.com/GatorSense/MUUFLGulfport | CC-BY 4.0 | Hyperspectral + LiDAR | 11 classes | Direct | Yes |
| **OnTech-HSI-Syn-21** | Mantripragada *et al.* LDVAE 2024 | Academic | Synthetic | known endmembers | Same | Yes |

**Note on EnMAP/PRISMA/HISUI redistribution:** raw scenes cannot be redistributed in-repo; ship pointers, download scripts, and pre-computed compact derived products (per-pixel topic distributions, abundance maps, learned codebooks) instead. Same for IEEE GRSS DFC datasets.

---

## 5. Baselines and comparison methods

For each baseline below: feature space, spatial use, supervision use, typical metrics in published HSI work.

| Baseline | Feature space | Spatial? | Supervision? | Typical metrics | Reference |
|---|---|---|---|---|---|
| **K-Means** | raw spectrum / PCA | No | No | OA, NMI, ARI on Indian Pines/Salinas | classical |
| **GMM / Dirichlet-process GMM** | raw spectrum | No / per-superpixel | No | NMI, log-likelihood | arXiv 2203.02820 (2022) |
| **Hierarchical clustering** | raw spectrum | No | No | OA, NMI | classical |
| **Spectral clustering** | spectral graph | Indirect | No | NMI, ARI | Ng-Jordan-Weiss 2002 family |
| **SLIC / hierarchical-homogeneity superpixels** | spatial-spectral | Yes | No | OA after vote | Achanta *et al.* 2012; arXiv 2407.15321 (2024) |
| **Spectral Angle Mapper (SAM)** | full spectrum (angle metric) | No | Reference signature | OA on labelled classes; usually outperformed by SVM/RF | Kruse *et al.* 1993; ISPRS 2019 |
| **VCA** | endmember subspace | No | No | endmember SAD, abundance RMSE | Nascimento & Bioucas-Dias *IEEE TGRS* 43(4), 2005 |
| **NMF / spatial-NMF** | low-rank factorisation | Optional | No | RMSE, abundance accuracy | Lee & Seung; many HSI variants |
| **PCA / ICA** | linear decorrelation | No | No | reconstruction error; OA after SVM | classical |
| **UMAP / t-SNE** | nonlinear embedding | No | No | qualitative; OA-after-KNN | McInnes *et al.* 2018; *Remote Sensing* 14(18):4579, 2022 |
| **Random Forest** | per-pixel spectrum | Optional via patches | Yes | OA, kappa | many; ISPRS 2019 |
| **SVM (RBF / linear)** | per-pixel spectrum | Optional via patches | Yes | OA, kappa | Camps-Valls & Bruzzone 2005 |
| **Logistic regression** | per-pixel spectrum | No | Yes | OA, kappa | baseline |
| **Self-supervised contrastive (DCLN, OSC-SCL, S3L)** | learned embedding | Yes (patches) | Pretext only | OA in low-label regimes | DCLN *J. Remote Sens.* 2022 (DOI 10.34133/remotesensing.0025); S3L *Remote Sens.* 16(6):970, 2024 |
| **SpectralFormer** | learned token sequence | Yes | Yes | OA on Indian Pines/Pavia U/Houston | Hong *et al.* *IEEE TGRS* 2022 |
| **Mamba / state-space HSI models** | learned token sequence | Yes | Yes | OA, parameter efficiency | Survey arXiv 2404.14955 |
| **SpectralEarth pretrained backbones** | foundation-model embedding | Yes | Pretext + finetune | OA on EnMAP/DESIS downstream | Braham *et al.* 2024 |

**For unmixing-flavoured family-D evaluation:** VCA + FCLS is the universal baseline; PM-LDA and LDVAE/SpACNN-LDVAE are the topic-model contemporary baselines; bundle-based unmixing (Borsoi 2021, Ayres *et al.* 2024) is the variability-aware baseline.

---

## 6. Validation methodology

Solid HSI / topic-model validation in 2026 looks like the following composite. The public app should commit to all of these for any headline claim.

1. **Topic stability across seeds.** Pairwise top-words overlap rate (TWOR) and KL-divergence between matched topics across runs; recurrent matching for cases of topic splitting/merging. *Reference:* Belford *et al.* "A Review of Stability in Topic Modeling" (*ACM Computing Surveys* 56:7, 2024, DOI 10.1145/3623269); Rahimi *et al.* "Contextualized Topic Coherence Metrics" (arXiv 2305.14587, 2023). Pure stability (same data, different seeds) and perturbation stability (data subsampling) are different and both should be reported.
2. **Topic coherence.** PMI / NPMI / C_v / C_uci across top-k tokens — adapted from text by treating spectral words exactly as tokens. *Reference:* Röder *et al.* WSDM 2015 (DOI 10.1145/2684822.2685324).
3. **Quantisation sensitivity.** Sweep Q (quantisation bins) and B' (band-grouping granularity); report stability and downstream OA as a function of Q. **No published HSI paper does this systematically — this is a contribution opportunity.**
4. **Document-definition sensitivity.** Sweep document granularity (pixel → superpixel → ROI → sample); report topic-class alignment and stability.
5. **Spectral-library alignment.** Match learned topic prototypes against USGS / ECOSTRESS spectra by SAM; report best-match scores per topic.
6. **Spatial coherence.** Moran's I or simple intra-superpixel topic-purity for the inferred topic map; helpful diagnostic that topics are not pixel-level noise.
7. **Cross-scene transfer.** Train on one scene (e.g. Pavia U), evaluate on another (Pavia C); train on HanChuan, evaluate on HongHu; report OA degradation and topic re-identifiability. *Reference:* Yuxiang Zhang Cross-Scene HSI Classification benchmark (github.com/YuxiangZhang-BIT/Data-CSHSI).
8. **Preprocessing / bad-band sensitivity.** Ablate water-vapour band removal, atmospheric correction, smoothing, normalisation; report deltas.
9. **Class-purity / NMI / ARI.** Standard cluster-vs-label scores; on labelled scenes, also OA after Hungarian topic-class matching.
10. **Topic-versus-mineralogy alignment for HIDSAG.** Sample-level topic distributions correlated with measured geomet/chem response; this is the supervised-claim check.

---

## 7. Web product / interactive exploration tools

Existing public-facing tools and what is reusable:

- **LDAvis** (Sievert & Shirley 2014; cpsievert R package) and its Python port **pyLDAvis** (bmabey) — the canonical "intertopic distance map + relevance-ranked top words" visualisation. Reusable: the layout idea (PCA of topic-word distributions; relevance λ slider). Not reusable: text-specific term presentation. Adapting LDAvis for HSI requires replacing "top words" with "top spectral signatures" (e.g. mean spectrum + high-relevance bands or absorption features).
- **HyperGUI** (Open Research Software 10.5334/jors.509) — Shiny web app for HSI loading, ROI extraction, spectrum display. Reusable: the ROI-as-document workflow.
- **Yale Hyperspectral Data Viewer** (hsi.yale.edu/hsi-viewer) — React app with band scrubbing and per-pixel spectrum panel. Reusable: the band scrubber + spectrum-on-hover primitive.
- **Spectronon** (Resonon, 2005-) — proprietary desktop. Not reusable for a public web product but defines user expectations.
- **NV5/Harris ENVI**, MATLAB Hyperspectral Viewer, Spectral Python (SPy) — desktop / library; not directly reusable as web UI.
- **NEON AOP GEE app** — Google-Earth-Engine-based exploration; reusable: tile-based hyperspectral display via on-the-fly band synthesis.
- **MRF-devteam Spectral Viewer** (mrf-devteam.gitlab.io/spectral-viewer) — open-source web spectral viewer; multi-format support; reusable as inspiration for the in-browser cube viewer.
- **Borsoi unmixing toolbox** (github.com/ricardoborsoi/unmixing_spectral_variability) — MATLAB; not a web app but the canonical reference implementation set the project should benchmark against.
- **Alina Zare's lab tools** (faculty.eng.ufl.edu/machine-learning) — PM-LDA reference code; same comment.

**Visual primitives reusable in the CAOS_LDA_HSI app:**
- intertopic distance map (LDAvis)
- relevance-ranked top items per topic (LDAvis), with "spectral signature" replacing "term"
- band-scrubber + spectrum-on-hover (Yale viewer)
- ROI-as-document workflow (HyperGUI)
- side-by-side scene + topic map + sample-level topic distributions (project-original primitive)
- hierarchical sample → region → spectrum drill-down (project-original primitive)

---

## 8. Decision tables

### 8.1 Representations to ship in the public app

| Representation | Decision | One-sentence reason |
|---|---|---|
| **V1 (wavelength-as-word, summed quantised intensity)** | **Keep — primary** | Simplest interpretable encoder; preserves wavelength identity; baseline that all extensions must beat. |
| **V2 (quantised-intensity-as-word, band counts)** | **Keep — secondary** | Smallest vocabulary; cheapest baseline; useful as a "shape-only" sanity check. |
| **V3 (concatenated spectra)** | **Keep — primary** | Preserves per-spectrum individuality, the hypothesis the project is testing. |
| **Continuum-removed absorption tokens** | **Keep — extension** | Mineralogy-aware, justifies the geometallurgy framing; library-aligned. |
| **Slope/curvature tokens** | **Keep — extension** | Cheap; already used in Egaña *et al.* 2020; integrates the prior CAOS line. |
| **Spectral-derivative tokens** | **Defer** | Noise-amplifying; would need denoising first; revisit after V1/V3 results stabilise. |
| **Wavelet-coefficient tokens** | **Defer** | Multi-scale benefit is real but adds two hyperparameters and large vocabulary. |
| **Co-occurrence biwords** | **Defer** | Worth a one-night ablation, not a shipping primitive. |
| **HDP-LDA / infinite-vocabulary** | **Defer (flag as open question)** | Most principled answer to quantisation-fragility; significant inference cost; ship as a "research direction" rather than v1 feature. |
| **BoVW codebook tokens** | **Drop (for now)** | Adds a learned codebook step that competes with the topic model itself; premature. |
| **Transformer/SpectralFormer tokens** | **Drop** | Out of scope for a topic-model-centric public app; reserve for the comparison table only. |

### 8.2 Datasets to ship as compact subsets

| Dataset | Decision | Reason |
|---|---|---|
| **HIDSAG (all families)** | **Keep — primary** | Project's own dataset; fully redistributable; uniquely supports family-D claims. |
| **USGS Spectral Library v7 (mineral subset)** | **Keep** | Public-domain; canonical reference for SAM matching of topic prototypes. |
| **ECOSTRESS curated subset** | **Keep (with attribution)** | Verify ECOSTRESS terms; ship per-category small extracts. |
| **Indian Pines, Salinas, Salinas-A, Pavia U, Pavia C, KSC, Botswana** | **Keep — Family B core** | Already widely redistributed; small footprint; required for cross-baseline comparability. |
| **WHU-Hi (LongKou + small HanChuan/HongHu crop)** | **Keep** | UAV resolution complements satellite; verify per-scene attribution; ship LongKou first. |
| **HyRANK Dioni + Loukia** | **Keep** | CC-BY via Zenodo; ISPRS-blessed benchmark. |
| **EuroSAT (RGB + MS)** | **Keep — multispectral baseline** | Permits MSI-side claims with negligible footprint. |
| **Samson, Jasper Ridge, Urban, Cuprite** | **Keep — unmixing baselines** | Required to compare against PM-LDA / LDVAE / VCA baselines. |
| **MUUFL Gulfport** | **Keep — secondary** | Public, multimodal, complementary class set. |
| **Houston 2013/2018/2020 GRSS DFC** | **Defer** | Login-gated; ship pointer + script only. |
| **EnMAP / PRISMA scenes** | **Defer** | Account-gated; ship pre-computed derived products only. |
| **SpectralEarth full corpus** | **Drop (raw)** / **Keep (sampled tiles)** | 3.3 TB — out of repo scope; ship a sampled tile subset for foundation-baseline comparison. |
| **HISUI** | **Drop** | Access is too restrictive in 2026-05 to commit to. |
| **AVIRIS-NG full scenes** | **Defer** | Provide download scripts; ship Cuprite ROI subset already covered above. |
| **HyTES** | **Drop (v1)** | TIR-only; out of scope until VNIR/SWIR pipeline is mature. |
| **NEON AOP** | **Defer** | Massive; provide pointers + one site cropped tile. |
| **OnTech-HSI-Syn-21 (LDVAE)** | **Keep — synthetic benchmark** | Designed for LDA-VAE evaluation; small; redistributable per LDVAE paper terms. |

### 8.3 Baselines to ship per family

| Family | Baselines to ship |
|---|---|
| **A — labelled spectra** | SAM library matching, KMeans, GMM, RF, Logistic regression |
| **B — labelled HSI scenes** | KMeans, SLIC + KMeans-per-superpixel, SVM-RBF, Random Forest, PCA→SVM, UMAP→KNN, **classical LDA on V1/V2/V3 corpus**, optionally SpectralFormer (non-blocking) |
| **C — unlabelled HSI archives** | KMeans, GMM/DPGMM, NMF, VCA, **classical LDA on V1/V2/V3**, **PM-LDA** when superpixel docs are defined |
| **D — regions + measurements (HIDSAG, Samson, Jasper, Urban, Cuprite)** | VCA + FCLS, NMF, PM-LDA, **LDVAE / SpACNN-LDVAE**, bundle-based unmixing (Borsoi 2021), **classical LDA on V1/V2/V3 with sample-as-document**, sLDA where geomet response is available |

---

## 9. Open research questions

The public app should foreground these as honest open questions rather than hide them:

1. **Quantisation fragility.** No published HSI work systematically benchmarks Q (intensity bins) and band-grouping granularity. Is there a regime where V1/V2/V3 results are stable? Does HDP-LDA with infinite vocabulary remove the issue, and at what compute cost?
2. **Document-definition sensitivity.** As document granularity moves from pixel to superpixel to sample, where does the "topics-as-materials" interpretation break down? Is there an optimal scale per dataset, and does it correlate with grain size or sensor IFOV?
3. **Within-document variability as signal.** PM-LDA, bundle unmixing, LDVAE all operationalise this differently. Is there a unified evaluation that ranks these three formulations on the *same* corpus, with the *same* documents?
4. **Cross-scene topic transferability.** Given that classical LDA topics are corpus-specific, can a vocabulary derived on one scene be re-used on another (same sensor, different terrain)? On a different sensor (AVIRIS → EnMAP)? Is the answer different for V1 vs V3?
5. **Topic-mineralogy alignment.** On HIDSAG, do unsupervised topics (V1/V2/V3) correlate with measured mineralogy / geochem response strongly enough to be diagnostic, or does sLDA-style supervision become mandatory?
6. **LDA vs. LDVAE vs. transformers as interpretability ladders.** The 2024-2025 LDVAE line shows neural models can approximate the LDA generative story. Do they retain the diagnostic, browsable interpretability that makes a public app worthwhile, or does the embedding space erase the very property that justifies LDA?
7. **Bad-band robustness comparative study.** Each tokenisation strategy responds differently to atmospheric/water-vapour bands. A public side-by-side comparison on identical preprocessed corpora would be a small but real contribution.
8. **The "spectrum-as-sentence" hypothesis.** V3 implicitly treats a spectrum as an ordered sentence. The biwords / wavelet / derivative variants make local order explicit. Whether order matters for HSI in the way it matters for text is an empirical question this project can answer.
9. **Sample-level documents and sparse labels.** HIDSAG has hundreds, not millions, of documents. Topic models tuned on that scale need careful prior calibration. Few public results exist at this scale.
10. **Public reproducibility floor.** Most cited HSI-LDA papers ship code (Wahabzada line largely does not; Zou & Zare lab code is partial; Borsoi toolbox is good; LDVAE has a public repo). A web product that exposes V1/V2/V3 + canonical baselines on shipped subsets is itself a methodological contribution because the absence is field-wide.

---

## Sources

- Wahabzada *et al.* "Plant Phenotyping using Probabilistic Topic Models: Uncovering the Hyperspectral Language of Plants", *Scientific Reports* 6, 22482, 2016. https://www.nature.com/articles/srep22482 ; PMC https://pmc.ncbi.nlm.nih.gov/articles/PMC4783663/
- Wahabzada *et al.* "Metro Maps of Plant Disease Dynamics — Automated Mining of Differences Using Hyperspectral Images", *PLOS ONE* 10(1):e0116902, 2015. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0116902
- Zou & Zare, "Hyperspectral Unmixing with Endmember Variability using Partial Membership Latent Dirichlet Allocation", arXiv 1609.03500, 2016. https://arxiv.org/abs/1609.03500 ; IEEE WHISPERS https://ieeexplore.ieee.org/abstract/document/7953348
- Zou & Zare, "Partial Membership Latent Dirichlet Allocation", arXiv 1612.08936, 2016. https://arxiv.org/abs/1612.08936 ; PMID 28792897 https://pubmed.ncbi.nlm.nih.gov/28792897/
- Zou & Zare, "Hyperspectral Unmixing with Endmember Variability using Semi-supervised Partial Membership Latent Dirichlet Allocation", arXiv 1703.06151, 2017. https://arxiv.org/abs/1703.06151
- Alina Zare lab — endmember variability tag. https://faculty.eng.ufl.edu/machine-learning/tag/endmember-variability/
- Borsoi *et al.* "Spectral Variability in Hyperspectral Data Unmixing: A Comprehensive Review", *IEEE GRSM* 9(4):223-270, 2021; arXiv 2001.07307. https://arxiv.org/abs/2001.07307 ; https://ieeexplore.ieee.org/document/9439249/
- Borsoi PhD thesis, "Spectral variability in hyperspectral unmixing", 2021. https://theses.hal.science/tel-03253631
- Borsoi unmixing toolbox. https://github.com/ricardoborsoi/unmixing_spectral_variability
- Ayres, Borsoi, Bermudez & de Almeida, "A Generalized Multiscale Bundle-Based Hyperspectral Sparse Unmixing Algorithm", arXiv 2401.13161, 2024. https://arxiv.org/abs/2401.13161
- "A General Framework for Group Sparsity in Hyperspectral Unmixing Using Endmember Bundles", arXiv 2505.14634, 2025. https://arxiv.org/html/2505.14634
- Blei & McAuliffe, "Supervised Topic Models", arXiv 1003.0783; *Statistical Science* 2010. https://arxiv.org/pdf/1003.0783
- Blei lab class-sLDA implementation. https://github.com/blei-lab/class-slda
- Zhu, Ahmed & Xing, "MedLDA: Maximum Margin Supervised Topic Models", *JMLR* 13:2237-2278, 2012. https://www.jmlr.org/papers/volume13/zhu12a/zhu12a.pdf
- Bosch *et al.* "Latent Dirichlet Allocation Models for Image Classification", *IEEE TPAMI* 2013, DOI 10.1109/TPAMI.2013.69. https://pubmed.ncbi.nlm.nih.gov/24051727/
- Zhai & Boyd-Graber, "Online Latent Dirichlet Allocation with Infinite Vocabulary", ICML 2013. http://proceedings.mlr.press/v28/zhai13.pdf ; https://proceedings.mlr.press/v28/zhai13.html
- Teh, Jordan, Beal & Blei, "Hierarchical Dirichlet Processes", *JASA* 2006. https://people.eecs.berkeley.edu/~jordan/papers/hierarchical-dp.pdf
- Dieng, Ruiz & Blei, "Topic Modeling in Embedding Spaces", *TACL* 8, 2020; arXiv 1907.04907. https://aclanthology.org/2020.tacl-1.29/ ; https://github.com/adjidieng/ETM
- Dieng, Ruiz & Blei, "The Dynamic Embedded Topic Model", arXiv 1907.05545, 2019. https://arxiv.org/abs/1907.05545
- Mantripragada *et al.* "Hyperspectral Pixel Unmixing With Latent Dirichlet Variational Autoencoder", *IEEE TGRS* 2024; arXiv 2203.01327. https://arxiv.org/abs/2203.01327 ; https://ieeexplore.ieee.org/document/10414262/
- Mantripragada *et al.* "SpACNN-LDVAE: Spatial Attention Convolutional Latent Dirichlet Variational Autoencoder", arXiv 2311.10701, 2024. https://arxiv.org/abs/2311.10701
- "Latent Dirichlet Transformer VAE for Hyperspectral Unmixing with Bundled Endmembers", arXiv 2511.17757, 2025. https://arxiv.org/abs/2511.17757
- Variational Gaussian Topic Model with invertible neural projections, *Neural Computing & Applications* 2023, DOI 10.1007/s00521-023-09070-2. https://link.springer.com/article/10.1007/s00521-023-09070-2
- Egaña, Santibáñez-Leal *et al.* "A Robust Stochastic Approach to Mineral Hyperspectral Analysis for Geometallurgy", *Minerals* 10(12):1139, 2020. https://www.mdpi.com/2075-163X/10/12/1139
- Santibáñez-Leal, Ehrenfeld & Egaña, "HIDSAG: Hyperspectral Image Database for Supervised Analysis in Geometallurgy", *Scientific Data* 2023, DOI 10.1038/s41597-023-02061-x. https://www.nature.com/articles/s41597-023-02061-x ; https://pmc.ncbi.nlm.nih.gov/articles/PMC10036318/ ; figshare MINERAL1 https://springernature.figshare.com/articles/dataset/19726804 ; figshare PORPHYRY https://springernature.figshare.com/articles/dataset/19726822 ; code https://github.com/alges/hidsag
- Felipe Santibáñez-Leal publications page. https://fsantibanezleal.github.io/publications/
- USGS Spectral Library v7 (Kokaly *et al.* 2017), DOI 10.5066/F7RR1WDJ. https://pubs.usgs.gov/publication/ds1035 ; https://www.usgs.gov/data/usgs-spectral-library-version-7-data
- ECOSTRESS Spectral Library v1.0. https://speclib.jpl.nasa.gov/ ; download https://speclib.jpl.nasa.gov/download
- Meerdink *et al.* "The ECOSTRESS spectral library version 1.0", *RSE* 230, 2019. https://www.sciencedirect.com/science/article/abs/pii/S0034425719302081
- AVIRIS / AVIRIS-NG portals. https://aviris.jpl.nasa.gov/dataportal/ ; https://avirisng.jpl.nasa.gov/dataportal/
- EMIT mission page. https://earth.jpl.nasa.gov/emit/ ; https://www.earthdata.nasa.gov/news/feature-articles/meet-emit-newest-imaging-spectrometer
- HyTES mission page. https://hytes.jpl.nasa.gov/ ; https://www.earthdata.nasa.gov/data/instruments/hytes
- EnMAP. https://www.enmap.org/ ; https://geoservice.dlr.de/web/datasets/enmap_spectralearth ; *RSE* 2024 follow-up https://www.sciencedirect.com/science/article/pii/S003442572400405X
- PRISMA mission references. https://www.eoportal.org/satellite-missions/enmap (cross-comparison) ; PRISMA forest types https://pmc.ncbi.nlm.nih.gov/articles/PMC7915604/
- Geologic mapping with PRISMA, EnMAP, HISUI, EMIT and Hyperion (AGU 2023). https://ui.adsabs.harvard.edu/abs/2023AGUFMGC51G0674A/abstract
- Indian Pines / Salinas / Pavia / Botswana — IEEE DataPort listing. https://ieee-dataport.org/documents/hyperspectral-remote-sensing-datasets-indian-pines-pavia-university-botswana-and-salinas
- WHU-Hi datasets, Zhong *et al.* RSE 2020; arXiv 2012.13920. https://arxiv.org/abs/2012.13920 ; HF mirror https://huggingface.co/datasets/danaroth/whu_hi
- HyRANK ISPRS benchmark. https://www.isprs.org/society/si/SI-2017/ISPRS-SI2017-TC3_WG4_Karantzalos_Report.pdf ; Zenodo 10.5281/zenodo.1222201 https://explore.openaire.eu/search/dataset?pid=10.5281/zenodo.1222201 ; HF mirror https://huggingface.co/datasets/danaroth/hyrank
- 2018 IEEE GRSS Data Fusion Contest — University of Houston. https://hyperspectral.ee.uh.edu/?page_id=1075 ; https://machinelearning.ee.uh.edu/2018-ieee-grss-data-fusion-challenge-fusion-of-multispectral-lidar-and-hyperspectral-data/ ; IEEE DataPort https://ieee-dataport.org/open-access/2018-ieee-grss-data-fusion-challenge-fusion-multispectral-lidar-and-hyperspectral-data
- Outcome of the 2018 GRSS DFC. https://hal.science/hal-02875492/file/DTIS20066.1592579104_postprint.pdf
- EuroSAT (Helber *et al.* 2019), DOI 10.1109/JSTARS.2019.2918242; arXiv 1709.00029; github.com/phelber/EuroSAT; Zenodo 7711810. https://arxiv.org/abs/1709.00029 ; https://github.com/phelber/EuroSAT ; https://zenodo.org/records/7711810
- Hyperspectral data set list (Le Sun, includes Samson/Jasper/Urban/Cuprite). https://lesun.weebly.com/hyperspectral-data-set.html
- "Hyperspectral Unmixing: Ground Truth Labeling, Datasets, Benchmark Performances and Survey", arXiv 1708.05125. https://arxiv.org/pdf/1708.05125
- NEON Airborne Observation Platform. https://www.neonscience.org/data-collection/airborne-remote-sensing
- Nascimento & Bioucas-Dias, "Vertex Component Analysis", *IEEE TGRS* 43(4):898-910, 2005. https://ieeexplore.ieee.org/document/1411995/
- Hong *et al.* "SpectralFormer: Rethinking Hyperspectral Image Classification With Transformers", *IEEE TGRS* 2022; arXiv 2107.02988. https://arxiv.org/abs/2107.02988 ; https://ieeexplore.ieee.org/document/9627165/
- Ahmad *et al.* "A Comprehensive Survey for Hyperspectral Image Classification: The Evolution from Conventional to Transformers and Mamba Models", arXiv 2404.14955. https://arxiv.org/html/2404.14955v4
- DCLN — "Deep Contrastive Learning Network for Small-Sample Hyperspectral Image Classification", *J. Remote Sensing* 2022, DOI 10.34133/remotesensing.0025. https://spj.science.org/doi/10.34133/remotesensing.0025
- S3L spectrum transformer SSL, *Remote Sensing* 16(6):970, 2024. https://www.mdpi.com/2072-4292/16/6/970
- Braham *et al.* "SpectralEarth: Training Hyperspectral Foundation Models at Scale", arXiv 2408.08447, 2024. https://arxiv.org/abs/2408.08447 ; https://arxiv.org/html/2408.08447v1
- "Hierarchical Homogeneity-Based Superpixel Segmentation: Application to Hyperspectral Image Analysis", arXiv 2407.15321, 2024. https://arxiv.org/html/2407.15321v1
- "Evaluation of Dirichlet Process Gaussian Mixtures for Segmentation on Noisy Hyperspectral Images", arXiv 2203.02820, 2022. https://arxiv.org/abs/2203.02820
- Bayesian Nonparametric Unmixing of Hyperspectral Images, arXiv 1702.08007, 2017. https://arxiv.org/abs/1702.08007
- Hyperspectral Unmixing with Gaussian Mixture Model and Spatial Group Sparsity, *Remote Sensing* 11(20):2434, 2019. https://www.mdpi.com/2072-4292/11/20/2434
- Sievert & Shirley, "LDAvis: A method for visualizing and interpreting topics", ACL 2014. https://nlp.stanford.edu/events/illvi2014/papers/sievert-illvi2014.pdf ; https://github.com/cpsievert/LDAvis ; https://github.com/bmabey/pyLDAvis
- HyperGUI, *J. Open Research Software*, DOI 10.5334/jors.509. https://openresearchsoftware.metajnl.com/articles/10.5334/jors.509
- Yale Hyperspectral Data Viewer. https://hsi.yale.edu/hsi-viewer
- MRF-devteam Spectral Viewer. https://mrf-devteam.gitlab.io/spectral-viewer/
- Spectral Python (SPy). https://www.spectralpython.net/
- Röder *et al.* "Exploring the Space of Topic Coherence Measures", WSDM 2015, DOI 10.1145/2684822.2685324. https://svn.aksw.org/papers/2015/WSDM_Topic_Evaluation/public.pdf
- Belford *et al.* "A Review of Stability in Topic Modeling", *ACM Computing Surveys* 56:7, 2024, DOI 10.1145/3623269. https://dl.acm.org/doi/full/10.1145/3623269
- Rahimi *et al.* "Contextualized Topic Coherence Metrics", arXiv 2305.14587, 2023. https://arxiv.org/pdf/2305.14587
- Cross-scene HSI classification benchmark (Yuxiang Zhang). https://github.com/YuxiangZhang-BIT/Data-CSHSI
- Texture extraction for vegetation in HSI via BoW on superpixels, *Remote Sensing* 12(16):2633, 2020. https://www.mdpi.com/2072-4292/12/16/2633
- "Coupling normalized abundance with an improved continuum removal algorithm for quantitative inversion of carbonate minerals using hyperspectral data", 2024. https://www.sciencedirect.com/science/article/pii/S016913682400060X
- EnGeoMAP 2.0 — Automated Hyperspectral Mineral Identification for EnMAP, *Remote Sensing* 8(2):127, 2016. https://www.mdpi.com/2072-4292/8/2/127/htm
- Wavelets for hyperspectral derivative analysis, *IEEE TGRS* 39(7), 2001. https://www.cavs.msstate.edu/publications/docs/2001/07/4952ieee_tgars_39_7_july2001.pdf
- Kruse mineral mapping with AVIRIS and Hyperion, NTRS. https://ntrs.nasa.gov/api/citations/20050192448/downloads/20050192448.pdf
- Spectral-spatial co-clustering of HSI based on bipartite graph, *Multimedia Systems* 2015. https://link.springer.com/article/10.1007/s00530-015-0450-0
- Integrated visual vocabulary in latent Dirichlet allocation for IKONOS scene classification, *J. Applied Remote Sensing* 8(1):083690, 2014. https://www.spiedigitallibrary.org/journals/journal-of-applied-remote-sensing/volume-8/issue-1/083690
- Spectral Angle Mapper baselines, ISPRS Archives 2019. https://isprs-archives.copernicus.org/articles/XLII-2-W13/1841/2019/
- "OHID-1: A New Large Hyperspectral Image Dataset for Multi-Classification", *Scientific Data* 2025. https://www.nature.com/articles/s41597-025-04542-7
- Bogatron blog — early demonstration of unsupervised LDA on HSI (2014). https://blog.bogatron.net/blog/2014/07/16/unsupervised-hsi-classification-using-lda/

*End of memo. Marked-uncertain items:* USGS Spectral Library v8 release status as of 2026-05; HISUI public-access status; exact 2022 Procemin Santibáñez-Leal contribution title (the search returned a 2020 Procemin Geomet entry but not a 2022 entry — verify against personal records before citing in the public app).
