"""Companion to build_bayesian_classification_labelled.py.

This builder runs the same hierarchical PyMC NUTS posterior but on
the topic_routed_deep_gate output (cycle 51), where the gate methods
are theta, cae_1d_8, beta_vae_8, pca_8, plus the raw_logistic
baseline. The model lets us answer with explicit HDI94: does any
deep gate dominate raw, or does theta uniquely benefit from its
natural simplex constraint?

Output: data/derived/method_statistics_labelled/cross_classification_bayesian_deep.json

References
----------
- Gelman et al. (2013). "Bayesian Data Analysis", 3rd ed. CRC Press.
- Vehtari et al. (2021). "Rank-Normalization, Folding, and Localization:
  An Improved R-hat for Assessing Convergence of MCMC". Bayesian
  Analysis 16(2):667-718.
- Higgins et al. (2017). "beta-VAE: Learning Basic Visual Concepts
  with a Constrained Variational Framework". ICLR 2017. The beta-VAE
  encoder whose softmaxed output is one of the deep-gate candidates.
- Kingma, Welling (2014). "Auto-Encoding Variational Bayes". ICLR 2014.
  The VAE framing.
- Master-plan thesis: see build_topic_routed_classifier.py docstring.
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
from research_core import bayes_compare as _bc  # noqa: E402

warnings.filterwarnings("ignore")


TR_DIR = DERIVED_DIR / "topic_routed_deep_gate"
DERIVED_OUT_DIR = DERIVED_DIR / "method_statistics_labelled"

NUTS_DRAWS = int(_os.environ.get("CAOS_NUTS_DRAWS", "1000"))
NUTS_TUNE = int(_os.environ.get("CAOS_NUTS_TUNE", "1000"))
NUTS_CHAINS = int(_os.environ.get("CAOS_NUTS_CHAINS", "4"))
RANDOM_STATE = 42
SCOPE = "labelled_scenes_deep_gates"
BUILDER_VERSION = "build_bayesian_classification_deep v0.2"
if NUTS_CHAINS < 4:
    raise SystemExit("R-hat needs at least 4 chains (CAOS_NUTS_CHAINS)")


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
        "input_dir": "topic_routed_deep_gate",
        "framework_axis": "B-3 follow-up Bayesian: hierarchical posterior over the 5 gate methods (raw, theta, cae_1d_8, beta_vae_8, pca_8) at K=8",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": BUILDER_VERSION,
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    obs = collect_observations()
    if not obs:
        print("[bayesian_deep] no observations, run build_topic_routed_deep_gate first", flush=True)
        return 0
    print(f"[bayesian_deep] collected {len(obs)} observations from topic_routed_deep_gate", flush=True)
    result = fit_hierarchical(obs)
    if not result:
        return 0
    out = DERIVED_OUT_DIR / "cross_classification_bayesian_deep.json"
    out.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
    print(f"[bayesian_deep] done, {len(result.get('method_posteriors', []))} methods", flush=True)
    for m in result["method_posteriors"]:
        print(
            f"  {m['method']:24s} mu={m['posterior_mean']:+.3f} HDI94=[{m['hdi94_lo']:+.3f}, {m['hdi94_hi']:+.3f}] "
            f"R-hat={m['r_hat']:.3f} ESS bulk/tail={m['ess_bulk']:.0f}/{m['ess_tail']:.0f}",
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
