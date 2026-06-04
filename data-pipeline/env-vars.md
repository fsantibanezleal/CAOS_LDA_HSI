# data-pipeline environment variables (`CAOS_*`)

Reference for the `CAOS_*` environment variables that tune individual
builders (#589 Tier 3). All are **optional** — every builder runs with no
env set, using the defaults below. They exist to scope a partial rebuild
(filters) or to trade runtime for thoroughness (seed counts, sampler
draws) without editing code.

Values are read at builder start via `os.environ.get(...)` /
`os.getenv(...)`. Filters are empty-string-means-all; numeric knobs are
parsed with `int(...)`.

## Build-scope filters

| Var | Builder | Effect | Default |
|---|---|---|---|
| `CAOS_SCENES_FILTER` | `build_representations.py` | comma-separated scene ids to build (others skipped) | `""` → all scenes |
| `CAOS_REPR_FILTER` | `build_representations.py` | comma-separated representation ids to build | `""` → all representations |
| `CAOS_VARIANT_FILTER` | `build_topic_model_variants.py` | comma-separated topic-model variant ids to build | `""` → all variants |

## Seed-stability sweeps

These control the reseed loops behind the F-18 reliability axis.

| Var | Builder | Effect | Default |
|---|---|---|---|
| `CAOS_CLASSICAL_SEED_METHOD` | `build_classical_seed_stability.py` | which classical method to reseed | `pca_8` |
| `CAOS_CLASSICAL_SEED_N` | `build_classical_seed_stability.py` | number of reseeds | `7` |
| `CAOS_DEEP_SEED_METHOD` | `build_deep_seed_stability.py` | which deep method to reseed | `cae_1d_8` |
| `CAOS_DEEP_SEED_N` | `build_deep_seed_stability.py` | number of reseeds | `7` |
| `CAOS_NEURAL_TOPIC_SEEDS` | `build_neural_topic_seed_stability.py` | ProdLDA reseed count | `5` |
| `CAOS_TOPIC_STABILITY_N_SEEDS` | `build_topic_stability.py` | LDA reseed count | `7` |
| `CAOS_TOPIC_STABILITY_K_OFFSET` | `build_topic_stability.py` | offset added to the per-scene K | `0` |

## Bayesian NUTS sampler (PyMC)

Shared across the three Bayesian builders. Lower these for a fast smoke
run; raise them for publication-grade posteriors.

| Var | Builders | Effect | Default |
|---|---|---|---|
| `CAOS_NUTS_CHAINS` | `build_bayesian_classification_deep.py`, `build_bayesian_classification_labelled.py`, `build_bayesian_method_comparison.py` | MCMC chains | `4` (deep) / `2` (labelled, method_comparison) |
| `CAOS_NUTS_DRAWS` | same three | posterior draws per chain | `1000` |
| `CAOS_NUTS_TUNE` | same three | tuning (warmup) steps | `1000` |

## Download / fetch guards

| Var | Builders | Effect | Default |
|---|---|---|---|
| `CAOS_HIDSAG_DOWNLOAD_IDS` | `fetch_hidsag.py` | comma-separated HIDSAG asset ids to download | `""` → nothing extra |
| `CAOS_MAX_LOCAL_DOWNLOAD_BYTES` | `fetch_public_hsi.py`, `fetch_public_spectral_libraries.py`, `fetch_public_unmixing.py` | per-file download cap in bytes (`0` disables the cap) | `0` → no cap |

## Notes

- Only `build_wordifications_all.py` exposes an `argparse` CLI; the
  builders above are env-driven (the project's standing convention for
  partial/parameterised runs). A consistent `--scene` / `--variant` CLI
  across all builders is a separate, deferred refactor (#589 Tier 3).
- `RANDOM_STATE = 42` is the canonical seed and is **not** env-tunable on
  purpose — reproducibility is a fixed property, not a runtime knob.
