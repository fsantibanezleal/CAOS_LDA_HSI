# Legacy Notebook — A39 Proof Of Concept

`LDA_Hyper_legacy.ipynb` is the **first concrete implementation** of the
HSI → LDA mapping introduced in the A39 paper
([`../papers/`](../papers/)). It is preserved as the original
postdoctoral exploration that validated the corpus recipes V1, V2 and
V3 on the laboratory mineral dataset DB1 of the paper.

It is **not** the active pipeline. The current pipeline lives in
[`../../data-pipeline/`](../../data-pipeline/) and uses scripted,
deterministic, unit-tested code over public datasets.

## Notebook Status

- Outputs are cleared before every commit (repository hygiene).
- All visible Spanish text was normalised to English to match repo
  conventions, but the cleaning utilities at the top of the notebook
  still expect Spanish text because they were inherited from a more
  general text-LDA template.
- Some heuristic regular expressions inside the cleaning function (for
  example accent removal) are visibly buggy because the source
  characters were lost during text encoding migrations.
- The notebook **assumes a local folder** `./DB/Example/` with a series
  of `X_*.npz` files. Those files are **not redistributable** — they
  came from the laboratory mineral dataset of the 2022 paper. The
  notebook will not run end-to-end on a public clone.

## What The Notebook Does, Cell By Cell

### 1. Bootstrap (cells 0 – 9)

Imports, optional `pip install` hints (kept as comments), and dependency
checks. Key external packages:

- `gensim` for the LDA model (`gensim.models.LdaModel`)
- `nltk` for stopwords / tokenisation utilities (legacy of the
  text-LDA template the code was forked from)
- `pyLDAvis` for topic visualisation
- `wordcloud` for cosmetic word clouds (not needed for the methodology)

The notebook predates any FastAPI / React surface; it was a
self-contained experiment in a Jupyter environment.

### 2. Helper Functions (cells 10 – 14)

`clean_text`, `filter_stopwords_and_digits`, `stem_words` and
`generate_ngrams` are inherited from a Spanish-text-LDA pipeline. They
are **not used in the spectral path** of the notebook in any meaningful
way; they are dead code from the template. They are kept so the diff
against the original is honest.

### 3. Data Loading And Global Normalisation (cells 17 – 20)

The notebook expects a folder of `X_*.npz` files. Each `.npz` contains
a key `X` of shape `[num_spectra, num_bands]`: rows are individual
spectra, columns are spectral bands. The notebook scans every file to
find the global min and max reflectance across the dataset, so that
the same `[0, 1]` normalisation is applied to every sample later. This
matters: if each sample is independently normalised, V1 and V3 lose the
ability to compare absolute albedo behaviour across samples.

### 4. Wavelength Vector (cell 21)

A hard-coded list of `1077` wavelengths from `400.11 nm` to `2499.26 nm`
is defined. This is the **calibration of the camera used to capture
DB1** in the A39 paper (a VNIR + SWIR combination). The vector is split
in two: a denser ~1 nm grid in the VNIR part and a coarser ~5–6 nm
grid in the SWIR part. The current pipeline does not embed wavelength
arrays inline like this; it stores them in dataset manifests instead.

### 5. Recipe V1 Documents With Repeated Tokens (cell 23)

Cell 23 is the first concrete corpus build. For each `.npz` file, it
samples `numspectbydoc = 16` spectra at random and treats them as one
document. It then thins the wavelength axis to one in every
`numberskippedbands = 2` bands, quantises the response to
`numdiscretizedintensities = 64` levels and emits, for each surviving
band, the wavelength label (e.g. `0420nm`) repeated as many times as
the *summed* quantised intensity across the 16 spectra.

This is the textual implementation of **Recipe V1**:

> word = wavelength index, document = sequence where each wavelength is
> repeated by the total quantised intensity across the document's
> spectra.

That output (`docs1`) feeds gensim later through the standard
`Dictionary(...) + corpus = [dictionary.doc2bow(...) for ...]` pattern.
Repeating the wavelength tokens by their counts is the brute-force way
of making `doc2bow` produce the right counts; modern code can pass
counts directly.

### 6. Recipe V1 Numerical Documents (cells 28 – 32)

Cells 28 – 32 build the numerical equivalent of the same V1 recipe in
the `[document, wavelength]` count matrix `N_DV_HS1`. This shape is
what the paper writes formally as `d:[ ΣI(w₁), …, ΣI(w_L) ]`. Quantisation
is bumped to `numdiscretizedintensities = 256` here. `N_DV_HS1` is
ready to feed any LDA implementation that accepts a
`[num_documents, vocabulary_size]` count matrix directly without going
through `doc2bow`.

### 7. Recipe V2 Numerical Documents (cells 34 – 36)

Cells 34 – 36 build **Recipe V2**: each document becomes a histogram of
how many `(spectrum, band)` pairs land in each quantisation bin. The
output `N_DV_HS2` has shape `[num_documents, 256]`. This is the
"reflectance-shape-only" representation of the paper, where wavelength
identity is no longer accessible.

### 8. Recipe V3 With Reduced Bands (cells 39 – 44)

Cells 39 – 44 build **Recipe V3** with `numberskippedbands = 5`. The
document keeps each spectrum as an ordered evidence block: first all
bands of spectrum 1, then all bands of spectrum 2, etc. The result is
`N_DV_HS3` of shape `[num_documents, P · L_thinned]`. Vocabulary size is
the same as V1 (the wavelength axis), but documents are much longer.

### 9. Quick Sanity Plots (cells 46 – 49)

Plot loops to verify that each of `N_DV_HS1`, `N_DV_HS2` and `N_DV_HS3`
looks reasonable in shape. These are diagnostic only.

### 10. LDA Training Path Through gensim (cells 54 – 60)

The notebook then converts `df_1` (the textual V1 corpus) into a gensim
`Dictionary`, filters extreme tokens (`no_below=2, no_above=0.8`),
builds a `corpus` via `dictionary.doc2bow(...)` and trains
`gensim.models.LdaModel(num_topics=10, random_state=42, chunksize=1000,
passes=10, alpha='auto')`. It prints the top 5 words per topic.

This is the heart of the proof of concept: the corpus built from V1
goes into a standard LDA implementation, and the model returns
distributions over wavelength tokens that the paper interprets as
recurring spectral regimes.

### 11. pyLDAvis Visualisation (cell 61)

A pyLDAvis HTML is rendered for the trained model and saved to
`./ldavis_prepared_10.html`. This was the first visualisation backend
used to inspect topics interactively. The current public web app is
designed to replace this with a richer interactive workspace — pyLDAvis
is fine for scientific inspection but it was never intended as a public
product surface.

### 12. Empty / Unused Cells

A handful of empty cells (`""`) are kept because removing them would
shift downstream cell IDs and make the diff against the original
unreadable. They are not load-bearing.

## Mapping Between Notebook Variables And Paper Recipes

| Paper recipe | Document mathematical form | Notebook variable | Vocabulary size in notebook |
|---|---|---|---|
| **V1** | `d : [ ΣI(w₁), …, ΣI(w_L) ]` | `N_DV_HS1`, also `df_1.docs1` | `L = 1077` (or thinned) |
| **V2** | `d : [ ΣW(i₁), …, ΣW(i_Q) ]` | `N_DV_HS2` | `Q = 256` |
| **V3** | `d : [ I₁(w₁), …, I_P(w_L) ]` | `N_DV_HS3` | `L = 1077 / 5 ≈ 215` |

Where `I_p(w_l)` is the quantised intensity of the `p`-th spectrum at
wavelength `w_l`, `ΣI(w_l) = Σ_p I_p(w_l)`, and `ΣW(i_q)` is the count
of `(spectrum, band)` cells whose quantised value is `q`. See
[`../README.md`](../README.md) for the full explanation.

## Why The Notebook Is Frozen, Not Imported

The notebook is intentionally ad hoc. It does not preserve enough
metadata to be reproducible at the level the current pipeline expects:

- random seeds are partially controlled (`random_state=42` for LDA, but
  `np.random.choice` for spectrum sampling has no explicit seed)
- wavelength metadata is hard-coded and not validated against any
  external manifest
- no caveat layer exists if a `.npz` file has a different number of
  bands or a different range
- no automatic regeneration of derived assets
- no separation between "what was tested" and "what was published"

The current pipeline scripts under `../../data-pipeline/` solve those
issues at the cost of being more verbose. Reading the notebook is
useful for understanding how the recipes were originally invented;
running it on new data is not the recommended path.

## How To Reproduce A39-Style Experiments On Public Data Today

The supported reproduction path is:

1. Fetch a public dataset, for example with
   `scripts/local.ps1 fetch` or `scripts/local.sh fetch`.
2. Build the compact derived assets, for example
   `scripts/local.ps1 build-real` and `scripts/local.ps1 build-corpus`.
3. Run the offline benchmarks with `scripts/local.ps1 run-core`. This
   runs LDA over the registered V1 / V2 / V3 (and modern) recipes,
   computes topic-stability diagnostics, fits supervised baselines, and
   stores results in `data/derived/core/local_core_benchmarks.json`.

The wiki page
[`Local-Reproduction-Guide`](https://github.com/fsantibanezleal/caos-lda-hsi/wiki/Local-Reproduction-Guide)
is the maintained recipe for end-to-end reproduction on public data.

## Hygiene Rules

- Do not commit notebook outputs.
- Do not commit local paths such as `./DB/Example/`.
- Do not edit the inherited Spanish-text helpers — they are kept as
  archaeology, not as utilities.
- New experiments belong as scripts under `../../data-pipeline/` or as
  benchmark runs in `data/derived/core/`, not as new notebooks here.
