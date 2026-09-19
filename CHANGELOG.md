# Changelog

All notable changes to this product. Format: `X.XX.XXX` (display, see the workspace `versioning.md`); stays `0.x` while pre-1.0. Tag every release.

## [0.02.000] · 2026-09-18

Four pipeline defects behind published numbers, fixed at the source and rerun (issue #817).

### Fixed
- **V15 at Q = 8 read the Q = 32 corpus.** The pre-2d51158 V15 builder wrote every `--q` run to `V15/uniform_Q8`, so the Q-sweep overwrote the Q = 8 corpus on 2026-05-30; F-15 and the HDP backbone then read the Q = 32 vocabulary. The corpus is regenerated (its corpus marginal, document lengths and a refit of the stored LDA reproduce the Q = 8 fit exactly on all six scenes), and V15's F-15 and HDP F-2 / F-14 are recomputed (HDP F-2 six-scene mean 0.521 becomes 0.389).
- **F-15 depended on `numpy.argsort` tie order.** The judge is now the exact expectation of the rule under uniformly random tie-breaking (`research_core/f15_alignment.py`); it equals the old rule where no tie crosses a cut and no longer depends on token numbering. Recomputed for all 19 recipes and 6 scenes; the old value is kept in each record (`f15_alignment_legacy_argsort`).
- **F-7 across backbones mixed topic counts.** ProdLDA and ETM F-7 runs used K = K_P1 on every recipe while LDA used the per-recipe K. One K policy (`research_core/k_policy.py`) now serves LDA, ProdLDA and ETM; the eight short-document recipes are refitted at their per-recipe K, and every F-7 record carries the number of topics in use and the ceiling min(1, log2 K / H(Y)); HDP records its kept-topic counts.
- **Hierarchical F-1 models were not identified.** Scene / subset and fold / target effects now sum to zero, so each method location is its mean score; 4 chains (enforced), numpyro NUTS, and R-hat plus bulk / tail ESS on every reported quantity (`research_core/bayes_compare.py`).

### Added
- `research_core/wordification_store.py` (validated corpus writes and reads) and `data-pipeline/check_wordification_store.py` (audits every stored corpus against its folder and its LDA fit).
- `scripts/issue_817_old_vs_new.py`: old versus new value of every changed artefact.
- Tests: `test_wordification_store.py`, `test_f15_tie_invariance.py`, `test_k_policy.py`, `test_bayes_identification.py`.

### Changed
- Methodology page: the F-1 Bayesian model, its numbers and diagnostics (EN / ES lead).
- Version constants aligned: `VERSION`, `app.__version__` (0.2.0), `frontend/package.json` (0.2.0) and the footer (`0.02.000`).

## [0.01.000] · 2026-07-03

### Added
- Adopt the `X.XX.XXX` versioning scheme: a `VERSION` file as the single source of truth, this `CHANGELOG`, and the first git tag. Baseline documenting the current shipped state; later changes are versioned by nature (major/minor/patch).
