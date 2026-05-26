"""V-sweep F-1 Bayesian posterior — pool per-fold macro-F1 across V1..V12.

Reads the per-(V, scene) per-fold JSON written by
build_v_sweep_f1_classification and fits the same hierarchical normal
model the paper uses for the labelled-scene F-1 posterior. Pools the
12 V × 6 scene × 5 fold × 2 method = up to 720 observations through:

  score[r, s, f, m] ~ Normal(
    mu_recipe[r] + offset_scene[s] + fold_re[f] + method_offset[m],
    sigma,
  )

Posterior summaries per recipe with HDI94 + pairwise P(mu_r1 > mu_r2).

This is the headline output that decides P3's framing: if the posterior
spread on mu_recipe is ≥ 0.05 the paper has a real claim; if all V's
overlap within HDI, the framing is 'V1 is the right canonical because
anything else is interchangeable'.

Tracks issue #608 (Cycle 3) under master #606.
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR  # noqa: E402

warnings.filterwarnings("ignore")

F1_DIR = DERIVED_DIR / "v_sweep" / "f1_per_fold"
OUT_PATH = DERIVED_DIR / "v_sweep" / "f1_bayesian_posterior.json"

NUTS_DRAWS = 1000
NUTS_TUNE = 1000
NUTS_CHAINS = 2
RANDOM_STATE = 42


def collect_observations(scheme: str, q: int, methods: list[str]) -> list[dict]:
    obs: list[dict] = []
    for path in sorted(F1_DIR.glob(f"*_{scheme}_Q{q}.json")):
        try:
            payload = json.load(path.open("r", encoding="utf-8"))
        except Exception:
            continue
        scene = payload.get("scene_id")
        recipe = payload.get("recipe")
        if not (scene and recipe):
            continue
        for method in methods:
            per_fold = payload.get(f"{method}_per_fold")
            if not per_fold:
                continue
            for fold_index, score in enumerate(per_fold):
                obs.append({
                    "recipe": recipe,
                    "scene": scene,
                    "fold": int(fold_index),
                    "method": method,
                    "score": float(score),
                })
    return obs


def fit_hierarchical(obs: list[dict]) -> dict:
    import pymc as pm
    import arviz as az

    recipes = sorted({o["recipe"] for o in obs}, key=lambda x: int(x[1:]))
    scenes = sorted({o["scene"] for o in obs})
    folds = sorted({o["fold"] for o in obs})
    methods = sorted({o["method"] for o in obs})

    r_idx = np.array([recipes.index(o["recipe"]) for o in obs])
    s_idx = np.array([scenes.index(o["scene"]) for o in obs])
    f_idx = np.array([folds.index(o["fold"]) for o in obs])
    m_idx = np.array([methods.index(o["method"]) for o in obs])
    scores = np.array([o["score"] for o in obs], dtype=np.float64)

    with pm.Model() as model:  # noqa: F841
        mu_recipe = pm.Normal("mu_recipe", mu=0.0, sigma=1.0, shape=len(recipes))
        offset_scene = pm.Normal("offset_scene", mu=0.0, sigma=0.5, shape=len(scenes))
        fold_re = pm.Normal("fold_re", mu=0.0, sigma=0.2, shape=len(folds))
        method_offset = pm.Normal(
            "method_offset", mu=0.0, sigma=0.3, shape=len(methods)
        )
        sigma = pm.HalfNormal("sigma", sigma=0.5)
        mu_obs = (
            mu_recipe[r_idx]
            + offset_scene[s_idx]
            + fold_re[f_idx]
            + method_offset[m_idx]
        )
        pm.Normal("y", mu=mu_obs, sigma=sigma, observed=scores)
        idata = pm.sample(
            draws=NUTS_DRAWS,
            tune=NUTS_TUNE,
            chains=NUTS_CHAINS,
            random_seed=RANDOM_STATE,
            target_accept=0.9,
            progressbar=False,
        )

    mu_samples = idata.posterior["mu_recipe"].stack(sample=("chain", "draw")).values
    method_samples = (
        idata.posterior["method_offset"].stack(sample=("chain", "draw")).values
    )

    summaries = []
    for i, r in enumerate(recipes):
        samples = mu_samples[i]
        hdi = az.hdi(samples, hdi_prob=0.94)
        summaries.append({
            "recipe": r,
            "posterior_mean": round(float(samples.mean()), 6),
            "posterior_std": round(float(samples.std()), 6),
            "hdi94_lo": round(float(hdi[0]), 6),
            "hdi94_hi": round(float(hdi[1]), 6),
        })

    method_summary = [
        {
            "method": m,
            "offset_mean": round(float(method_samples[i].mean()), 6),
        }
        for i, m in enumerate(methods)
    ]

    pairwise = {}
    for i in range(len(recipes)):
        for j in range(len(recipes)):
            if i == j:
                continue
            p = float((mu_samples[i] > mu_samples[j]).mean())
            pairwise.setdefault(recipes[i], {})[recipes[j]] = round(p, 6)

    return {
        "scope": "v_sweep_classification",
        "n_observations": int(len(obs)),
        "n_recipes": int(len(recipes)),
        "n_scenes": int(len(scenes)),
        "n_folds": int(len(folds)),
        "n_methods": int(len(methods)),
        "recipes": recipes,
        "scenes": scenes,
        "methods": methods,
        "recipe_posteriors": summaries,
        "method_offsets": method_summary,
        "pairwise_p_a_gt_b": pairwise,
        "model_summary": (
            "score = mu_recipe[r] + offset_scene[s] + fold_re[f] + method_offset[m] + N(0, sigma); "
            "mu_recipe ~ N(0, 1); offset_scene ~ N(0, 0.5); fold_re ~ N(0, 0.2); "
            "method_offset ~ N(0, 0.3); sigma ~ HalfNormal(0.5); "
            f"NUTS draws={NUTS_DRAWS}, tune={NUTS_TUNE}, {NUTS_CHAINS} chains."
        ),
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_v_sweep_f1_bayesian v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-1 Bayesian posterior.")
    parser.add_argument("--scheme", default="uniform")
    parser.add_argument("--q", type=int, default=8)
    parser.add_argument(
        "--methods",
        nargs="+",
        default=["topic_routed_soft", "raw_logistic"],
        choices=["topic_routed_soft", "raw_logistic"],
    )
    args = parser.parse_args()

    obs = collect_observations(args.scheme, args.q, args.methods)
    print(
        f"[bayes_f1] {len(obs)} observations across "
        f"{len({o['recipe'] for o in obs})} recipes and "
        f"{len({o['scene'] for o in obs})} scenes",
        flush=True,
    )
    if not obs:
        print("  no observations — run build_v_sweep_f1_classification first", flush=True)
        return 1

    payload = fit_hierarchical(obs)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as h:
        json.dump(payload, h, separators=(",", ":"))

    ranked = sorted(payload["recipe_posteriors"], key=lambda x: -x["posterior_mean"])
    print("\n[bayes_f1] Posterior ranking by mu_recipe:", flush=True)
    for r in ranked:
        print(
            f"    {r['recipe']:5s} mu={r['posterior_mean']:+.4f}  "
            f"HDI94=[{r['hdi94_lo']:+.4f}, {r['hdi94_hi']:+.4f}]",
            flush=True,
        )
    spread = ranked[0]["posterior_mean"] - ranked[-1]["posterior_mean"]
    print(f"\n[bayes_f1] Spread (best - worst) = {spread:+.4f}", flush=True)
    if spread >= 0.05:
        print("  -> Real claim: recipes differ. P3 framing = 'which recipe wins'.",
              flush=True)
    else:
        print("  -> Recipes overlap; P3 framing = 'V1 is the right canonical'.",
              flush=True)

    print(f"  wrote {OUT_PATH.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
