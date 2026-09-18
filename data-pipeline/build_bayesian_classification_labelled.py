"""Bayesian classification posterior on the labelled scenes.

Master plan Addendum B Axis C — extends the existing HIDSAG-only
`build_bayesian_method_comparison` to the **labelled-scene** classifier
panel. Includes `topic_routed_soft` (B-3) and `theta_concat_pca_K`
(B-5) — the embedded readouts the user specified — alongside the
flat baselines so the Bayesian dominance reading covers both ends of
the framework's "how to use theta" question.

Observations come from the per-fold macro F1 already computed by
B-3 (`build_topic_routed_classifier`), one row per (scene × fold ×
method). We pool across the six labelled scenes via a hierarchical
normal model identical in shape to the HIDSAG one:

  score[m, s, f] ~ Normal(mu[m] + offset_scene[s] + fold_re[f], sigma)

with the scene offsets and fold effects constrained to sum to zero (v0.2,
#817), so mu[m] is method m's mean macro-F1 over the scenes and folds; v0.1
had no reference level, so mu[m] was fixed only by its prior. Posterior
inference via NUTS with at least 4 chains (numpyro on JAX by default,
research_core.bayes_compare). Reports per method the posterior mean, HDI94,
rank-normalised R-hat and bulk / tail ESS, every pairwise difference with
the same diagnostics, and the pairwise P(mu_a > mu_b).

Output: data/derived/method_statistics_labelled/cross_classification_bayesian.json

References
----------
- Gelman, Carlin, Stern, Dunson, Vehtari, Rubin (2013). "Bayesian Data
  Analysis", 3rd ed. CRC Press. The hierarchical normal model and
  HDI94 conventions used here.
- Vehtari, Gelman, Simpson, Carpenter, Burkner (2021). "Rank-Normalization,
  Folding, and Localization: An Improved R-hat for Assessing Convergence
  of MCMC". Bayesian Analysis 16(2):667-718. The rank-normalised R-hat
  and bulk / tail ESS reported per parameter (at least 4 chains, enforced).
- Hoffman, Gelman (2014). "The No-U-Turn Sampler: Adaptively Setting
  Path Lengths in Hamiltonian Monte Carlo". JMLR 15(1):1593-1623. NUTS.
- Salvatier, Wiecki, Fonnesbeck (2016). "Probabilistic programming in
  Python using PyMC3". PeerJ Computer Science 2:e55. PyMC.
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR
from research_core import bayes_compare as _bc  # noqa: E402

warnings.filterwarnings("ignore")


TR_DIR = DERIVED_DIR / "topic_routed_classifier"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_labelled"

import os as _os
NUTS_DRAWS = int(_os.environ.get("CAOS_NUTS_DRAWS", "1000"))
NUTS_TUNE = int(_os.environ.get("CAOS_NUTS_TUNE", "1000"))
NUTS_CHAINS = int(_os.environ.get("CAOS_NUTS_CHAINS", "4"))
RANDOM_STATE = 42
SCOPE = "labelled_scenes"
BUILDER_VERSION = "build_bayesian_classification_labelled v0.2"
if NUTS_CHAINS < 4:
    raise SystemExit("R-hat needs at least 4 chains (CAOS_NUTS_CHAINS)")


# Method names appearing in topic_routed_classifier output. The pca_K
# methods carry K in their name (pca_12_logistic, pca_9_logistic, ...);
# canonicalise to "pca_K_logistic" so per-scene K differences pool.
def canonicalise_method(name: str) -> str:
    if name.startswith("pca_") and name.endswith("_logistic"):
        return "pca_K_logistic"
    return name


def collect_observations() -> list[dict]:
    obs: list[dict] = []
    for path in sorted(TR_DIR.glob("*.json")):
        try:
            payload = json.load(path.open("r", encoding="utf-8"))
        except Exception:
            continue
        scene_id = payload.get("scene_id") or path.stem
        method_metrics = payload.get("method_metrics", {})
        for raw_method, block in method_metrics.items():
            method = canonicalise_method(raw_method)
            f1 = (block.get("macro_f1") or {}).get("per_fold")
            if not f1:
                continue
            for fold_index, score in enumerate(f1):
                obs.append({
                    "scene": scene_id,
                    "fold": int(fold_index),
                    "method": method,
                    "raw_method": raw_method,
                    "score": float(score),
                })
    return obs


def fit_hierarchical(observations: list[dict]) -> dict:
    """Identified hierarchical model over scene, fold and method (#817).

    score[m, s, f] = mu[m] + offset[s] + re[f] + eps with the scene offsets and
    fold effects constrained to sum to zero (research_core.bayes_compare), so
    mu[m] is method m's mean macro-F1 over the scenes and folds. The archived
    v0.1 model had no reference level (mu identified only by its prior, about
    0.17 below the observed means, HDI94 above 1.0) and ran 2 chains with no
    convergence diagnostic.
    """
    if not observations:
        return {}
    methods = sorted({o["method"] for o in observations})
    scenes = sorted({o["scene"] for o in observations})
    folds = sorted({o["fold"] for o in observations})

    method_idx = np.array([methods.index(o["method"]) for o in observations])
    scene_idx = np.array([scenes.index(o["scene"]) for o in observations])
    fold_idx = np.array([folds.index(o["fold"]) for o in observations])
    scores = np.array([o["score"] for o in observations], dtype=np.float64)

    backend = _bc.default_backend()
    with _bc.Timer() as timer:
        idata = _bc.fit_crossed(
            scores, method_idx, len(methods), scene_idx, len(scenes), fold_idx, len(folds),
            mu_sigma=1.0, group_sigma=0.5, rep_sigma=0.2, noise_sigma=0.5,
            draws=NUTS_DRAWS, tune=NUTS_TUNE, chains=NUTS_CHAINS, seed=RANDOM_STATE,
            target_accept=0.9, backend=backend,
        )
    summary = _bc.summarise(idata, methods, scores, method_idx,
                            group_names=scenes, rep_names=[f"fold_{f}" for f in folds],
                            group_var="offset_group", rep_var="re_rep")
    return {
        "task_type": "classification",
        "scope": SCOPE,
        "n_observations": int(len(observations)),
        "n_methods": int(len(methods)),
        "n_scenes": int(len(scenes)),
        "n_folds": int(len(folds)),
        "method_names": methods,
        "scene_names": scenes,
        **summary,
        "identification": (
            "scene offsets and fold effects sum to zero (ZeroSumNormal), so mu_method is the "
            "method's mean macro-F1 over the scenes and folds of the study"
        ),
        "model_summary": (
            "score = mu_method[m] + offset_scene[s] + fold_re[f] + N(0, sigma); "
            "mu_method ~ N(0, 1); offset_scene ~ ZeroSumNormal(0.5); fold_re ~ ZeroSumNormal(0.2); "
            f"sigma ~ HalfNormal(0.5); NUTS draws={NUTS_DRAWS}, tune={NUTS_TUNE}, "
            f"{NUTS_CHAINS} chains, target_accept 0.9."
        ),
        "sampler": _bc.sampler_note(backend, NUTS_DRAWS, NUTS_TUNE, NUTS_CHAINS,
                                    RANDOM_STATE, 0.9),
        "sampling_seconds": timer.seconds,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": BUILDER_VERSION,
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    obs = collect_observations()
    print(f"[bayes_lab] collected {len(obs)} observations from {len({o['scene'] for o in obs})} scenes", flush=True)
    if not obs:
        print("  no observations — run build_topic_routed_classifier first", flush=True)
        return 1
    payload = fit_hierarchical(obs)
    if not payload:
        print("  fit failed", flush=True)
        return 1
    out_path = DERIVED_OUT_DIR / "cross_classification_bayesian.json"
    with out_path.open("w", encoding="utf-8") as h:
        json.dump(payload, h, separators=(",", ":"))
    ranked = sorted(payload["method_posteriors"], key=lambda x: -x["posterior_mean"])
    print(
        f"  n_obs={payload['n_observations']} methods={payload['n_methods']} scenes={payload['n_scenes']} folds={payload['n_folds']}",
        flush=True,
    )
    for r in ranked:
        print(
            f"    {r['method']:25s} mu={r['posterior_mean']:+.3f} HDI94=[{r['hdi94_lo']:+.3f}, {r['hdi94_hi']:+.3f}] "
            f"R-hat={r['r_hat']:.3f} ESS bulk/tail={r['ess_bulk']:.0f}/{r['ess_tail']:.0f}",
            flush=True,
        )
    print(f"  wrote {out_path.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
