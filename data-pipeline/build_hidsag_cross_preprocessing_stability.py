"""HIDSAG cross-preprocessing topic stability — Addendum B B-6 follow-up.

Reads `data/derived/core/hidsag_preprocessing_sensitivity.json`, extracts
the per-policy LDA top-tokens for each HIDSAG subset, and reports
Hungarian-matched top-N Jaccard between each pair of preprocessing
policies. The intended axis is: when LDA is fit on the same HIDSAG
subset under different preprocessing recipes (raw / heuristic-band-mask
/ SNV / SavGol+SNV), how stable are the topics?

Output: data/derived/hidsag_cross_preprocessing_stability/<subset>.json

Schema:
- subset_code: HIDSAG subset
- policies: list of policy_id strings used
- per_topic_jaccard_vs_policy0: per-topic Hungarian-matched top-N
  Jaccard against policy index 0 (baseline_raw), per remaining policy
- pairwise_off_diagonal_summary: mean / min / std of off-diagonal
  matched-Jaccard across all policy pairs, aggregated over topics
- per_pair_matched_jaccard: full N_policies × N_policies symmetric
  matrix (mean over topics) for heatmap rendering
- methodology_note: reminder that this is a top-N proxy, not full
  cosine over phi
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DERIVED_DIR


SOURCE_PATH = DERIVED_DIR / "core" / "hidsag_preprocessing_sensitivity.json"
OUT_DIR = DERIVED_DIR / "hidsag_cross_preprocessing_stability"

TOP_N = 15


def matched_jaccard(top_a: list[set[str]], top_b: list[set[str]]) -> tuple[float, float, list[float]]:
    """Hungarian-matched per-topic Jaccard between two lists of token sets.

    Returns (mean, min, per_topic_matched_jaccards).
    Both inputs must be the same length K.
    """
    K = len(top_a)
    if K == 0 or len(top_b) != K:
        return 0.0, 0.0, []
    jac = np.zeros((K, K), dtype=np.float64)
    for i in range(K):
        for j in range(K):
            inter = len(top_a[i] & top_b[j])
            union = len(top_a[i] | top_b[j])
            jac[i, j] = inter / max(union, 1)
    row_ind, col_ind = linear_sum_assignment(-jac)
    matches = jac[row_ind, col_ind]
    return float(np.mean(matches)), float(np.min(matches)), matches.tolist()


def extract_topic_tokens(policy_run: dict) -> list[set[str]]:
    """Pull the top-N token strings for each topic in a policy run."""
    stm = policy_run.get("sample_topic_model") or {}
    top_tokens = stm.get("top_tokens") or []
    out: list[set[str]] = []
    for t in top_tokens:
        toks = [tok.get("token") for tok in (t.get("tokens") or []) if tok.get("token")]
        out.append(set(toks[:TOP_N]))
    return out


def build_for_subset(subset_payload: dict) -> dict | None:
    code = subset_payload.get("subset_code")
    if not code:
        return None
    policy_runs = subset_payload.get("policy_runs") or []
    if len(policy_runs) < 2:
        return None
    policy_ids = [pr.get("policy_id") for pr in policy_runs if pr.get("policy_id")]
    per_policy_top = [extract_topic_tokens(pr) for pr in policy_runs]
    # Pad / drop topics to the shortest K so matching is well-defined.
    if not all(per_policy_top):
        return None
    K_min = min(len(t) for t in per_policy_top)
    if K_min == 0:
        return None
    per_policy_top = [t[:K_min] for t in per_policy_top]

    n = len(per_policy_top)

    # Per-topic Jaccard vs policy 0
    per_topic_vs_p0: list[dict] = []
    for j in range(1, n):
        mean, mn, perTopic = matched_jaccard(per_policy_top[0], per_policy_top[j])
        per_topic_vs_p0.append({
            "policy_id": policy_ids[j],
            "matched_jaccard_top15_mean": round(mean, 6),
            "matched_jaccard_top15_min": round(mn, 6),
            "per_topic_matched_jaccard_top15": [round(float(v), 6) for v in perTopic],
        })

    # Pairwise full N x N matrix (mean over topics, off-diagonal)
    pair_matrix = np.eye(n, dtype=np.float64)
    pair_matrix_min = np.eye(n, dtype=np.float64)
    for i in range(n):
        for j in range(i + 1, n):
            mean, mn, _ = matched_jaccard(per_policy_top[i], per_policy_top[j])
            pair_matrix[i, j] = pair_matrix[j, i] = mean
            pair_matrix_min[i, j] = pair_matrix_min[j, i] = mn

    iu = np.triu_indices(n, k=1)
    off_vals = pair_matrix[iu]
    off_min_vals = pair_matrix_min[iu]
    summary = {
        "off_diagonal_mean": round(float(np.mean(off_vals)), 6),
        "off_diagonal_min": round(float(np.min(off_min_vals)), 6),
        "off_diagonal_std": round(float(np.std(off_vals)), 6),
        "n_pairs": int(off_vals.size),
    }

    return {
        "subset_code": code,
        "topic_count": K_min,
        "policies": policy_ids,
        "per_topic_jaccard_vs_policy0": per_topic_vs_p0,
        "pairwise_matched_jaccard_top15_mean_matrix": [
            [round(float(v), 6) for v in row] for row in pair_matrix
        ],
        "pairwise_matched_jaccard_top15_min_matrix": [
            [round(float(v), 6) for v in row] for row in pair_matrix_min
        ],
        "off_diagonal_summary": summary,
        "methodology_note": (
            f"Hungarian-matched top-{TOP_N} Jaccard between LDA fits on the "
            "same HIDSAG subset under different preprocessing policies. This "
            "is a token-overlap proxy, not full cosine over phi — phi is not "
            "shipped in hidsag_preprocessing_sensitivity. A full-fidelity "
            "B-6 reading on HIDSAG would re-run LDA per policy and capture "
            "phi explicitly."
        ),
        "framework_axis": "B-6 cross-preprocessing topic stability",
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_hidsag_cross_preprocessing_stability v0.1",
    }


def main() -> int:
    if not SOURCE_PATH.is_file():
        print(f"  no preprocessing sensitivity at {SOURCE_PATH}", flush=True)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    payload = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    subsets = payload.get("subsets") or []
    written = 0
    for sub in subsets:
        code = sub.get("subset_code")
        print(f"[hidsag_cross_preproc_stab] {code} ...", flush=True)
        try:
            out = build_for_subset(sub)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            continue
        if out is None:
            print("  skipped", flush=True)
            continue
        out_path = OUT_DIR / f"{code}.json"
        out_path.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
        s = out["off_diagonal_summary"]
        print(
            f"  K={out['topic_count']} n_policies={len(out['policies'])} "
            f"off_diag_mean={s['off_diagonal_mean']:.3f} "
            f"off_diag_min={s['off_diagonal_min']:.3f}",
            flush=True,
        )
        written += 1
    print(f"[hidsag_cross_preproc_stab] done — {written} subsets written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
