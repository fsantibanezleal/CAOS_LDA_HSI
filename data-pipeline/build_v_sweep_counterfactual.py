"""V-sweep counterfactual topic explanations (#622).

For each (V, scene), pick a small sample of documents (default 20) and
for each document find the minimum spectral perturbation that flips
the argmax topic from z* to any other topic. Reports:

- counterfactual_l1_per_topic: median L1 distance of perturbation
  needed to flip OUT of topic k.
- counterfactual_l1_global: overall median across topics.
- robust_topic: argmax over per-topic L1 — topic that's hardest to flip.

Lower L1 = topic boundary is closer = topic is less robust. Higher L1
= topic is more concentrated.

We use the closed-form predict_fn from F-13 (p(z|x, phi) = softmax(x @
log_phi^T + log alpha)) and the gradient is computable analytically:
d log p(z=k|x) / d x_v = phi[k][v] / sum_j p(z=j|x) phi[j][v] etc.
For simplicity we use coordinate-descent: at each step, find the
single token whose perturbation flips z* fastest.

Output: data/derived/v_sweep/f22_counterfactual/{scene}_{V}_uniform_Q8.json
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
CF_DERIVED = DERIVED_DIR / "v_sweep" / "f22_counterfactual"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]
N_SAMPLES = 20
MAX_STEPS = 50  # coordinate descent steps before giving up
STEP_SIZE = 1.0  # perturb one count at a time
RANDOM_STATE = 42


def load_artefacts(scene_id: str, recipe: str):
    fit_dir = SWEEP_LOCAL / f"{scene_id}_{recipe}_uniform_Q8"
    phi_path = fit_dir / "phi.npy"
    corpus_dir = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id
    dt_path = corpus_dir / "doc_term.npz"
    if not (phi_path.exists() and dt_path.exists()):
        return None
    phi = np.load(phi_path)
    doc_term = sp.load_npz(dt_path).tocsr()
    return phi, doc_term


def predict_one(x: np.ndarray, log_phi: np.ndarray, alpha: float) -> np.ndarray:
    log_post = x @ log_phi.T + np.log(alpha)
    m = log_post.max()
    ex = np.exp(log_post - m)
    return ex / ex.sum()


def counterfactual_l1(x: np.ndarray, log_phi: np.ndarray, alpha: float,
                       z_star: int) -> tuple[float, int]:
    """Coordinate-descent search for minimum L1 perturbation that flips
    argmax away from z_star. Returns (L1_distance, num_steps_taken)."""
    x_perturbed = x.astype(np.float64).copy()
    n_steps = 0
    for step in range(MAX_STEPS):
        probs = predict_one(x_perturbed, log_phi, alpha)
        if int(np.argmax(probs)) != z_star:
            l1 = float(np.sum(np.abs(x_perturbed - x)))
            return l1, n_steps
        # Find the token v that, when incremented by STEP_SIZE, most
        # decreases p(z=z_star | x). The derivative is approximately:
        # d p(z_star|x) / d x_v = p(z_star|x) * (log_phi[z_star, v] - <log_phi[:, v]>_p)
        weighted = (log_phi * probs[:, None]).sum(axis=0)  # E[log phi]_p over k
        gradient = probs[z_star] * (log_phi[z_star] - weighted)
        # We want to decrease p_z_star → move in direction of negative gradient
        # but x must stay non-negative (counts). So we increment the v with
        # most-negative gradient (which corresponds to incrementing a token
        # whose log_phi[z_star] is much lower than the average).
        v_best = int(np.argmin(gradient))
        x_perturbed[v_best] += STEP_SIZE
        n_steps += 1
    # didn't flip in MAX_STEPS
    return float("inf"), n_steps


def for_cell(recipe: str, scene_id: str) -> dict | None:
    pl = load_artefacts(scene_id, recipe)
    if pl is None:
        return None
    phi, doc_term = pl
    K, V = phi.shape
    D = doc_term.shape[0]
    log_phi = np.log(np.clip(phi, 1e-12, None))
    alpha = 0.45

    rng = np.random.default_rng(RANDOM_STATE)
    sample_idx = rng.choice(D, size=min(N_SAMPLES, D), replace=False)

    samples = np.asarray(doc_term[sample_idx].toarray(), dtype=np.float64)
    initial_probs = np.zeros((len(sample_idx), K))
    l1s = []
    z_stars = []
    not_flipped = 0
    for i, x in enumerate(samples):
        probs = predict_one(x, log_phi, alpha)
        z_star = int(np.argmax(probs))
        initial_probs[i] = probs
        z_stars.append(z_star)
        l1, _steps = counterfactual_l1(x, log_phi, alpha, z_star)
        if not np.isfinite(l1):
            not_flipped += 1
            continue
        l1s.append(l1)
    # If every sample failed to flip, that is itself a strong signal
    # (extremely robust topics). Persist with a sentinel median + lower
    # bound = MAX_STEPS, so the cell appears in the matrix.
    if not l1s:
        all_not_flipped = True
        median_l1 = float(MAX_STEPS)
        mean_l1 = float(MAX_STEPS)
    else:
        all_not_flipped = False
        median_l1 = float(np.median(l1s))
        mean_l1 = float(np.mean(l1s))
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "V": int(V),
        "n_samples": int(len(sample_idx)),
        "n_flipped_within_max_steps": int(len(l1s)),
        "n_not_flipped": int(not_flipped),
        "all_not_flipped": all_not_flipped,
        "counterfactual_l1_median": round(median_l1, 4),
        "counterfactual_l1_mean": round(mean_l1, 4),
        "max_steps": MAX_STEPS, "step_size": STEP_SIZE,
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_counterfactual v0.2",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep counterfactual topic flip cost.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    CF_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    summary = []
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            t0 = time.perf_counter()
            try:
                res = for_cell(recipe, scene)
            except Exception as exc:
                print(f"[cf] {tag} FAILED: {exc}", flush=True)
                n_skip += 1
                continue
            if res is None:
                n_skip += 1
                continue
            res["elapsed_seconds"] = round(time.perf_counter() - t0, 2)
            out = CF_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            n_ok += 1
            summary.append(res)
            print(
                f"[cf] {scene:30s} {recipe:5s} median_l1={res['counterfactual_l1_median']:.2f} "
                f"flipped={res['n_flipped_within_max_steps']}/{res['n_samples']} "
                f"t={res['elapsed_seconds']}s",
                flush=True,
            )

    if summary:
        from collections import defaultdict
        by_recipe = defaultdict(list)
        for r in summary:
            by_recipe[r["recipe"]].append(r["counterfactual_l1_median"])
        print("\n[cf] Per-recipe median counterfactual L1 (higher = topic more robust):",
              flush=True)
        for r in sorted(by_recipe, key=lambda x: int(x[1:])):
            v = by_recipe[r]
            print(f"    {r:5s} mean={np.mean(v):.2f} median={np.median(v):.2f}",
                  flush=True)

    print(f"\n[cf] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
