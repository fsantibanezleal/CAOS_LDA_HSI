"""V-sweep F-1 bootstrap posterior — quick alternative to the NUTS run.

When the full pymc NUTS fit in build_v_sweep_f1_bayesian is too slow
(Windows + pytensor compile can stall for an hour), this script
produces a bootstrap-based posterior summary that:

- pools per-fold macro-F1 across scenes for each recipe
- bootstraps the per-recipe mean with B = 5000 resamples
- reports posterior-mean and HDI94 (bootstrap-percentile interpretation)
- reports pairwise P(mu_a > mu_b)

The bootstrap quantities are not formally posterior summaries, but
they approximate the same quantities under a flat prior and are
robust + fast (seconds, not hours).

Output: data/derived/v_sweep/f1_bootstrap_posterior.json
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR  # noqa: E402

F1_DIR = DERIVED_DIR / "v_sweep" / "f1_per_fold"
OUT_PATH = DERIVED_DIR / "v_sweep" / "f1_bootstrap_posterior.json"

B = 5000  # bootstrap resamples
RANDOM_STATE = 42


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-1 bootstrap posterior.")
    parser.add_argument("--scheme", default="uniform")
    parser.add_argument("--q", type=int, default=8)
    parser.add_argument("--method", default="topic_routed_soft",
                        choices=["topic_routed_soft", "raw_logistic"])
    args = parser.parse_args()

    obs_by_recipe: dict[str, list[float]] = {}
    for path in sorted(F1_DIR.glob(f"*_{args.scheme}_Q{args.q}.json")):
        d = json.load(path.open("r", encoding="utf-8"))
        per_fold = d.get(f"{args.method}_per_fold")
        if not per_fold:
            continue
        obs_by_recipe.setdefault(d["recipe"], []).extend(per_fold)

    if not obs_by_recipe:
        print("[bootstrap] no per-fold data", flush=True)
        return 1

    recipes = sorted(obs_by_recipe, key=lambda x: int(x[1:]))
    rng = np.random.default_rng(RANDOM_STATE)

    boot_means: dict[str, np.ndarray] = {}
    for r in recipes:
        vals = np.array(obs_by_recipe[r], dtype=np.float64)
        n = len(vals)
        # B bootstrap means
        idx = rng.integers(0, n, size=(B, n))
        boot_means[r] = vals[idx].mean(axis=1)

    summaries = []
    for r in recipes:
        bm = boot_means[r]
        lo, hi = np.quantile(bm, [0.03, 0.97])
        summaries.append({
            "recipe": r,
            "n_observations": int(len(obs_by_recipe[r])),
            "posterior_mean": round(float(bm.mean()), 6),
            "posterior_std": round(float(bm.std()), 6),
            "hdi94_lo": round(float(lo), 6),
            "hdi94_hi": round(float(hi), 6),
        })
    summaries.sort(key=lambda x: -x["posterior_mean"])

    pairwise = {}
    for ra in recipes:
        for rb in recipes:
            if ra == rb:
                continue
            p = float((boot_means[ra] > boot_means[rb]).mean())
            pairwise.setdefault(ra, {})[rb] = round(p, 6)

    spread = summaries[0]["posterior_mean"] - summaries[-1]["posterior_mean"]
    verdict = "real-claim" if spread >= 0.05 else "tight-overlap"

    payload = {
        "method_evaluated": args.method,
        "scheme": args.scheme,
        "Q": args.q,
        "recipes": recipes,
        "n_total_observations": sum(len(v) for v in obs_by_recipe.values()),
        "B": B,
        "random_state": RANDOM_STATE,
        "recipe_posteriors": summaries,
        "pairwise_p_a_gt_b": pairwise,
        "spread": round(spread, 6),
        "verdict": verdict,
        "model_description": (
            f"Bootstrap percentile intervals (B={B}). Per-recipe means are "
            "computed by resampling the per-fold macro-F1 scores with "
            "replacement and recomputing the mean. The 3%-97% quantile "
            "of the bootstrap distribution is reported as HDI94 by "
            "analogy. Pairwise probability is the empirical fraction "
            "of bootstrap pairs where the first recipe's mean exceeds "
            "the second's."
        ),
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_v_sweep_f1_bootstrap v0.1",
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as h:
        json.dump(payload, h, indent=2)

    print(f"[bootstrap] {payload['n_total_observations']} obs across "
          f"{len(recipes)} recipes",
          flush=True)
    print(f"[bootstrap] Posterior ranking by mean ({args.method}):",
          flush=True)
    for r in summaries:
        print(f"    {r['recipe']:5s} mu={r['posterior_mean']:+.4f}  "
              f"HDI94=[{r['hdi94_lo']:+.4f}, {r['hdi94_hi']:+.4f}]",
              flush=True)
    print(f"[bootstrap] Spread = {spread:+.4f}  -> {verdict}", flush=True)
    print(f"[bootstrap] wrote {OUT_PATH.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
