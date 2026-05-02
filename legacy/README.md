# Legacy Material

This folder is the **historical and bibliographic anchor** of the project.
It preserves the original postdoctoral exploration that motivated the
current `CAOS_LDA_HSI` repository: the source paper, the first proof of
concept notebook, and the line of work it belongs to.

It is reference-only. Active scientific code lives outside `legacy/` in
`data-pipeline/`, `research_core/`, and `app/`. The artifacts here are
kept because they contain the **first concrete formalisation** of the
spectral-corpus idea this project rebuilds, and because they let new
contributors see how the methodology was originally designed and tested
before any web product existed.

## What This Folder Contains

```
legacy/
├── notebooks/
│   ├── README.md                  -- guided cell-by-cell map of the notebook
│   └── LDA_Hyper_legacy.ipynb     -- the original LDA-HSI proof of concept
├── papers/
│   ├── README.md                  -- bibliographic context of the source paper
│   ├── CITATIONS.md               -- full publication trail behind this project
│   ├── Article_FASL_A39_final.docx        -- source paper, working version
│   └── Article_FASL_A39_final_extracted.txt  -- raw text extraction for grep
└── README.md                      -- this file
```

## Where Everything Comes From

The notebook and paper here are part of a coherent line of postdoctoral
research by **Felipe A. Santibáñez-Leal** at ALGES / AMTC, Universidad
de Chile, on hyperspectral characterisation of mineral samples and
geometallurgical inference. The source paper for this folder is:

> Santibáñez-Leal, F. A., Ehrenfeld, A., Garrido, F., Navarro, F.,
> Egaña, Á. (2022). *Geometallurgical estimation of mineral samples
> from hyperspectral images and statistical topic modelling*. 18th
> International Conference on Mineral Processing and Geometallurgy
> (Procemin Geomet). [ResearchGate
> link](https://www.researchgate.net/publication/369708272).

This paper is referred to internally as the **A39 paper**. It is the
direct theoretical and experimental seed of `CAOS_LDA_HSI`. The notebook
in `legacy/notebooks/` implements the three corpus-construction recipes
introduced in that paper (V1, V2, V3 below) on a small `.npz` spectrum
archive that mirrors how a VNIR+SWIR hyperspectral capture is stored
internally (per-spectrum rows of band intensities).

The full publication chain that gave rise to this repository is in
[`papers/CITATIONS.md`](papers/CITATIONS.md). It includes the 2020
*Minerals* paper that introduced the hierarchical inference idea over
HSI and the 2023 *Scientific Data* paper that introduced **HIDSAG**, the
public hyperspectral image database for supervised geometallurgical
analysis that drives the current Family D experiments in this repo.

## The Scientific Idea, In One Page

Classical hyperspectral analysis tries to summarise a sample, region or
scene by **one** representative spectrum or by a small set of pure
endmembers. Pixels that disagree with that one summary are filtered out
as noise.

The line of work behind this repository takes the opposite view: when a
mineral sample is captured as a hyperspectral image, the variability
*between* its pixels is the most informative thing about the sample.
Some pixels report higher copper presence, others report clay content,
others report moisture, others report shadow or texture. The full
statistical distribution of those spectra is closer to what the sample
actually is than any single mean spectrum.

This recasts the problem as a **probabilistic topic-modelling** problem
in the style of Latent Dirichlet Allocation (LDA, Blei et al. 2003): a
collection of spectra becomes a collection of documents over a
spectral vocabulary, and topics emerge as recurrent spectral regimes.
Once topics exist, samples can be:

- summarised by their topic mixture instead of their mean spectrum
- routed to specialised regression / classification models per dominant
  topic (hierarchical inference)
- compared semantically to each other through topic distance instead of
  raw spectral distance
- aligned against external labels, mineralogy, or laboratory
  measurements *per topic*, not as a single global model

The A39 paper validated this on two real geometallurgical datasets and
showed that the hierarchical LDA-routed regressor reduced the mean
absolute error of copper recovery from ~4.57 (naive per-spectrum
regressor) to ~0.42 (LDA-V1 hierarchical) — a ~10× reduction on a
non-trivial industrial variable.

## The Three Corpus Recipes Defined In The A39 Paper

The A39 paper proposes three concrete ways to translate a hyperspectral
image of `P` spectra and `L` bands, each band quantised to `Q` levels,
into LDA-ready documents. The notebook implements all three. The current
`data-pipeline/` reuses and extends this taxonomy.

| Recipe | Word | Document | Vector size | Preserves wavelength | Preserves shape | Vocabulary |
|---|---|---|---|---|---|---|
| **V1** | wavelength index `w ∈ {1,…,L}` | `[ ΣI(w₁), ΣI(w₂), …, ΣI(w_L) ]` summed quantised intensities across the `P` spectra at each band | `L` | yes | partial (collapses spectra) | `L` |
| **V2** | quantised intensity level `i ∈ {0,…,Q-1}` | `[ ΣW(i₁), ΣW(i₂), …, ΣW(i_Q) ]` count of how many band-cells in the `P` spectra fall at each intensity level | `Q` | no | reflectance histogram | `Q` |
| **V3** | wavelength index `w ∈ {1,…,L}` | concatenation `[ I₁(w₁),…,I₁(w_L), …, I_P(w₁),…,I_P(w_L) ]` keeping individual spectra as ordered evidence | `P · L` | yes | yes (per-spectrum) | `L` |

Notation: `I_p(w_l)` is the quantised intensity of the `p`-th spectrum
at wavelength `w_l`; `ΣI(w_l) = Σ_p I_p(w_l)`; `ΣW(i_q)` is the count of
`(p, l)` pairs whose quantised intensity equals `q`.

V1 and V3 keep the wavelength axis interpretable: it is possible to read
a topic-word distribution and see which wavelengths dominate the topic.
V2 does not preserve wavelength identity — it summarises *how* the
sample distributes its reflectance levels regardless of where in the
spectrum each level lives.

## What The A39 Paper Showed Empirically

Two laboratory hyperspectral datasets were used:

- **DB1**: 146 drilling-composite samples (20-m intervals) captured
  with VNIR (400–1000 nm, 942 bands) and SWIR (1000–2500 nm, 268 bands)
  cameras, with five laboratory-measured response variables: copper
  recovery (RECCU), molybdenum recovery (RECMO), pH, calcium-carbonate
  consumption (CONSCAL) and bond work index (WI).
- **DB2**: 27 samples characterised by XRD, XRF and swelling-pressure
  laboratory tests.

The hierarchical inference scheme reads as:

1. for each sample, build documents using one of V1 / V2 / V3
2. fit LDA on the corpus, choose the number of topics by coherence
3. assign each training sample to its dominant topic
4. fit one local regressor per topic on its assigned samples
5. for a new sample, infer the topic mixture and predict by mixing the
   per-topic regressors, weighted by topic probability

On DB1, the headline regression errors (lower is better) were:

| Method | RECCU MAE | RECMO MAE | PH MAE | CONSCAL MAE | WI MAE |
|---|---|---|---|---|---|
| Naive per-spectrum classification | 4.568 | 18.639 | 0.810 | 0.095 | 1.594 |
| Hierarchical, NN clustering | 0.680 | 2.871 | 0.151 | 0.036 | 0.350 |
| **Hierarchical, LDA-V1** | **0.422** | **2.227** | **0.100** | 0.030 | **0.288** |
| Hierarchical, LDA-V2 | 0.714 | 3.105 | 0.146 | 0.039 | 0.400 |
| **Hierarchical, LDA-V3** | 0.432 | 2.218 | 0.114 | **0.023** | 0.274 |

V1 and V3 dominated. V2 was the weakest of the three but still well
above the naive baseline. On DB2 (smaller, more heterogeneous), the
estimation error was reduced by 10–15 % relative to the same baselines.

These numbers are not promises of the current public app: they are the
**published experimental record this project is trying to generalise,
reproduce on public datasets, and extend** to satellite, UAV, and
laboratory MSI sources.

## How The Notebook Maps To The Paper

`notebooks/LDA_Hyper_legacy.ipynb` is the proof-of-concept implementation
that accompanied the paper. It works on `.npz` files with shape
`[num_spectra, num_bands]` for VNIR captures (~1077 bands across
400 nm – 2500 nm) and produces three corpus variants:

- `N_DV_HS1` and `df_1.docs1` correspond to **Recipe V1** (the
  intensity-summed-by-wavelength representation, with each `(wavelength,
  intensity)` pair emitted as a token like `0420nm` repeated by its
  count)
- `N_DV_HS2` corresponds to **Recipe V2** (count of bands per quantised
  intensity level, so each document is a `Q`-bin histogram)
- `N_DV_HS3` corresponds to **Recipe V3** with band thinning
  (`numberskippedbands = 5`) for an interactive trade-off between
  vocabulary size and document length

A guided cell-by-cell map is in [`notebooks/README.md`](notebooks/README.md).

## What Of The Notebook Survives In The Live Repo

The current production code does **not** import from this notebook —
that would be unreasonable, the notebook predates the FastAPI / React
architecture, the public dataset taxonomy and the validation framework.
But the underlying recipe definitions are preserved and extended in:

- `data/manifests/corpus_recipes.json` — registered recipes with their
  alphabet, word, document, normalisation and quantisation policies
- `data/derived/corpus/corpus_previews.json` — concrete previews of
  recipes V1, V2, V3 (and modern extensions) on real datasets
- `data-pipeline/build_corpus_previews.py` — the script that turns a
  recipe manifest plus a public scene or sample slice into a preview
- `data-pipeline/run_local_core_benchmarks.py` — the script that fits
  LDA on the chosen recipes and runs supervised, clustering and
  stability comparisons

The notebook stays here as the **first formalisation**, with messy ad
hoc code, hard-coded wavelength arrays, and Spanish stopword utilities
inherited from a more general text-LDA template. None of those should
be reproduced in the live pipeline.

## Reading Order If You Just Cloned The Repo

1. This file
2. [`papers/README.md`](papers/README.md) — what the paper actually says
3. [`papers/CITATIONS.md`](papers/CITATIONS.md) — the full publication
   line, including HIDSAG and the 2020 *Minerals* paper
4. [`notebooks/README.md`](notebooks/README.md) — what the notebook does
5. The active scientific docs in [`../docs/theory.md`](../docs/theory.md)
   and [`../docs/spectral-tokenization.md`](../docs/spectral-tokenization.md)
6. The public wiki at
   [github.com/fsantibanezleal/CAOS_LDA_HSI/wiki](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki)
   for the deep technical / methodological documentation

## Hygiene Rules

- Notebook outputs must remain cleared before commit. The repo policy is
  to commit `.ipynb` cells with no execution output, so file diffs stay
  meaningful and no machine-specific artifacts leak.
- Machine-specific paths and transient local artifacts must not be
  reintroduced.
- Do not rewrite the paper text inside the `.docx` or `.txt` here. The
  extracted `.txt` is intentionally raw, including OCR-style noise, and
  is preserved as a reproducible search target.
- New explanatory documentation belongs under `docs/` or in the wiki,
  not inside `legacy/`. This folder is frozen reference material.

## What This Folder Is Not

- It is not a tutorial. The current tutorials are the wiki and `docs/`.
- It is not a complete reproduction of the A39 experiments. The
  laboratory datasets DB1 and DB2 of the paper are not redistributable;
  the public alternative is HIDSAG (`papers/CITATIONS.md`).
- It is not a benchmark. Benchmarks live in
  `data/derived/core/local_core_benchmarks.json` and are regenerated by
  `data-pipeline/run_local_core_benchmarks.py`.
- It is not a place to add new code, datasets or figures.
