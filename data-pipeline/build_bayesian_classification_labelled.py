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

Posterior inference via NUTS. Reports per-method posterior mean +
HDI94 + pairwise P(mu_a > mu_b).

Output: data/derived/method_statistics_labelled/cross_classification_bayesian.json
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

warnings.filterwarnings("ignore")


TR_DIR = DERIVED_DIR / "topic_routed_classifier"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_labelled"

import os as _os
NUTS_DRAWS = int(_os.environ.get("CAOS_NUTS_DRAWS", "1000"))
NUTS_TUNE = int(_os.environ.get("CAOS_NUTS_TUNE", "1000"))
NUTS_CHAINS = int(_os.environ.get("CAOS_NUTS_CHAINS", "2"))
RANDOM_STATE = 42


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
    if not observations:
        return {}
    import pymc as pm
    import arviz as az

    methods = sorted({o["method"] for o in observations})
    scenes = sorted({o["scene"] for o in observations})
    folds = sorted({o["fold"] for o in observations})

    method_idx = np.array([methods.index(o["method"]) for o in observations])
    scene_idx = np.array([scenes.index(o["scene"]) for o in observations])
    fold_idx = np.array([folds.index(o["fold"]) for o in observations])
    scores = np.array([o["score"] for o in observations], dtype=np.float64)

    with pm.Model() as model:  # noqa: F841
        mu_method = pm.Normal("mu_method", mu=0.0, sigma=1.0, shape=len(methods))
        offset_scene = pm.Normal("offset_scene", mu=0.0, sigma=0.5, shape=len(scenes))
        fold_re = pm.Normal("fold_re", mu=0.0, sigma=0.2, shape=len(folds))
        sigma = pm.HalfNormal("sigma", sigma=0.5)
        mu = mu_method[method_idx] + offset_scene[scene_idx] + fold_re[fold_idx]
        pm.Normal("y", mu=mu, sigma=sigma, observed=scores)

        idata = pm.sample(
            draws=NUTS_DRAWS,
            tune=NUTS_TUNE,
            chains=NUTS_CHAINS,
            random_seed=RANDOM_STATE,
            target_accept=0.9,
            progressbar=False,
        )

    posterior = idata.posterior
    mu_samples = posterior["mu_method"].stack(sample=("chain", "draw")).values

    summaries = []
    for i, m in enumerate(methods):
        samples = mu_samples[i]
        hdi = az.hdi(samples, hdi_prob=0.94)
        summaries.append({
            "method": m,
            "posterior_mean": round(float(samples.mean()), 6),
            "posterior_std": round(float(samples.std()), 6),
            "hdi94_lo": round(float(hdi[0]), 6),
            "hdi94_hi": round(float(hdi[1]), 6),
        })

    pairwise = {}
    for i in range(len(methods)):
        for j in range(len(methods)):
            if i == j:
                continue
            p = float((mu_samples[i] > mu_samples[j]).mean())
            pairwise.setdefault(methods[i], {})[methods[j]] = round(p, 6)

    return {
        "task_type": "classification",
        "scope": "labelled_scenes",
        "n_observations": int(len(observations)),
        "n_methods": int(len(methods)),
        "n_scenes": int(len(scenes)),
        "n_folds": int(len(folds)),
        "method_names": methods,
        "scene_names": scenes,
        "method_posteriors": summaries,
        "pairwise_p_a_gt_b": pairwise,
        "model_summary": (
            "score = mu_method[m] + offset_scene[s] + fold_re[f] + N(0, sigma); "
            "mu_method ~ N(0, 1); offset_scene ~ N(0, 0.5); fold_re ~ N(0, 0.2); "
            "sigma ~ HalfNormal(0.5); NUTS draws=1000, tune=1000, 2 chains."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_bayesian_classification_labelled v0.1",
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
            f"    {r['method']:25s} mu={r['posterior_mean']:+.3f} HDI94=[{r['hdi94_lo']:+.3f}, {r['hdi94_hi']:+.3f}]",
            flush=True,
        )
    print(f"  wrote {out_path.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
