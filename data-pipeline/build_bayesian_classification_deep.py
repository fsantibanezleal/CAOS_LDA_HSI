"""Companion to build_bayesian_classification_labelled.py.

This builder runs the same hierarchical PyMC NUTS posterior but on
the topic_routed_deep_gate output (cycle 51), where the gate methods
are theta, cae_1d_8, beta_vae_8, pca_8, plus the raw_logistic
baseline. The model lets us answer with explicit HDI94: does any
deep gate dominate raw, or does theta uniquely benefit from its
natural simplex constraint?

Output: data/derived/method_statistics_labelled/cross_classification_bayesian_deep.json
"""
from __future__ import annotations

import json
import os as _os
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


TR_DIR = DERIVED_DIR / "topic_routed_deep_gate"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_labelled"

NUTS_DRAWS = int(_os.environ.get("CAOS_NUTS_DRAWS", "1000"))
NUTS_TUNE = int(_os.environ.get("CAOS_NUTS_TUNE", "1000"))
NUTS_CHAINS = int(_os.environ.get("CAOS_NUTS_CHAINS", "4"))
RANDOM_STATE = 42


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
            f1 = (block.get("macro_f1") or {}).get("per_fold")
            if not f1:
                continue
            for fold_index, score in enumerate(f1):
                obs.append({
                    "scene": scene_id,
                    "fold": int(fold_index),
                    "method": raw_method,
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
        "scope": "labelled_scenes_deep_gates",
        "n_observations": int(len(observations)),
        "n_methods": int(len(methods)),
        "n_scenes": int(len(scenes)),
        "n_folds": int(len(folds)),
        "method_names": methods,
        "scene_names": scenes,
        "method_posteriors": summaries,
        "pairwise_p_a_gt_b": pairwise,
        "model_summary": (
            f"score = mu_method[m] + offset_scene[s] + fold_re[f] + N(0, sigma); "
            f"mu_method ~ N(0, 1); offset_scene ~ N(0, 0.5); fold_re ~ N(0, 0.2); "
            f"sigma ~ HalfNormal(0.5); NUTS draws={NUTS_DRAWS}, tune={NUTS_TUNE}, {NUTS_CHAINS} chains."
        ),
        "input_dir": "topic_routed_deep_gate",
        "framework_axis": "B-3 follow-up Bayesian: hierarchical posterior over the 5 gate methods (raw, theta, cae_1d_8, beta_vae_8, pca_8) at K=8",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_bayesian_classification_deep v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    obs = collect_observations()
    if not obs:
        print("[bayesian_deep] no observations — run build_topic_routed_deep_gate first", flush=True)
        return 0
    print(f"[bayesian_deep] collected {len(obs)} observations from topic_routed_deep_gate", flush=True)
    result = fit_hierarchical(obs)
    if not result:
        return 0
    out = DERIVED_OUT_DIR / "cross_classification_bayesian_deep.json"
    out.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"[bayesian_deep] done — {len(result.get('method_posteriors', []))} methods", flush=True)
    for m in result["method_posteriors"]:
        print(
            f"  {m['method']:24s} mu={m['posterior_mean']:+.3f} HDI94=[{m['hdi94_lo']:+.3f}, {m['hdi94_hi']:+.3f}]",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
