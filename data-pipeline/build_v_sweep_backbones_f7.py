"""F-7 NMI under HDP / ProdLDA / ETM backbones for top contender recipes.

Until now the backbone factorial only stored F-2 c_v and F-14 jaccard.
This script computes F-7 NMI (between argmax topic and label) under
each non-LDA backbone, so the four-backbone comparison covers the
class-coupling axis too.

Strategy: re-run the backbone (using the deterministic builders from
``build_v_sweep_{hdp,prodlda_backbone,etm_backbone}.py``), then project
each labelled sample through the fitted model to get the argmax topic,
then compute NMI(argmax_topic, label).

Output:
``data/derived/v_sweep/backbones_f7/{backbone}_{scene}_{recipe}_uniform_Q8.json``
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
OUT_DIR = DERIVED_DIR / "v_sweep" / "backbones_f7"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = ["V1", "V3", "V12", "V14", "V18", "V20"]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42


def load_labels_for_scene(scene_id: str) -> np.ndarray | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    mask = valid & (flat_labels > 0)
    pixel_idx = np.flatnonzero(mask)
    labels = flat_labels[pixel_idx]
    sample_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE,
    )
    return labels[sample_local]


def load_doc_term(recipe: str, scene_id: str) -> sp.csr_matrix | None:
    p = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id / "doc_term.npz"
    if not p.exists():
        return None
    return sp.load_npz(p).tocsr()


def compute_nmi(argmax_topic: np.ndarray, labels: np.ndarray) -> float:
    """NMI(topic, label) using normalisation by H(label)."""
    classes = sorted(set(labels))
    topics = sorted(set(argmax_topic))
    label_to_idx = {c: i for i, c in enumerate(classes)}
    topic_to_idx = {t: i for i, t in enumerate(topics)}
    joint = np.zeros((len(topics), len(classes)), dtype=np.float64)
    for t, c in zip(argmax_topic, labels):
        joint[topic_to_idx[int(t)], label_to_idx[int(c)]] += 1
    n = float(joint.sum())
    if n <= 0:
        return 0.0
    p = joint / n
    p_t = p.sum(axis=1)
    p_c = p.sum(axis=0)
    EPS = 1e-12
    h_c = -float((p_c * np.log2(np.maximum(p_c, EPS))).sum())
    # I = sum p(t,c) log(p(t,c) / (p(t)p(c)))
    mi = 0.0
    for i in range(joint.shape[0]):
        for j in range(joint.shape[1]):
            pij = p[i, j]
            if pij < EPS:
                continue
            mi += pij * np.log2(pij / max(p_t[i] * p_c[j], EPS))
    return float(mi / max(h_c, EPS))


def run_hdp(doc_term: sp.csr_matrix, labels: np.ndarray) -> float:
    """Fit gensim HDP, project corpus, compute F-7 NMI."""
    from gensim.models import HdpModel
    from gensim.corpora import Dictionary

    D, V = doc_term.shape
    corpus = []
    for r in range(D):
        start = doc_term.indptr[r]
        end = doc_term.indptr[r + 1]
        cols = doc_term.indices[start:end].tolist()
        vals = doc_term.data[start:end].tolist()
        corpus.append([(int(c), int(v)) for c, v in zip(cols, vals) if v > 0])
    id2token = {i: f"w{i:05d}" for i in range(V)}
    dictionary = Dictionary()
    dictionary.id2token = id2token
    dictionary.token2id = {v: k for k, v in id2token.items()}
    dictionary.cfs = {}
    dictionary.dfs = {}
    dictionary.num_docs = D
    hdp = HdpModel(
        corpus=corpus, id2word=dictionary,
        T=20, K=8, random_state=RANDOM_STATE,
    )
    # Project: hdp[bow] returns list[(topic, prob)]
    argmax_topic = np.zeros(D, dtype=np.int32)
    for r in range(D):
        bow = corpus[r]
        if not bow:
            argmax_topic[r] = 0
            continue
        topics = hdp[bow]
        if not topics:
            argmax_topic[r] = 0
            continue
        best = max(topics, key=lambda x: x[1])
        argmax_topic[r] = int(best[0])
    return compute_nmi(argmax_topic, labels)


def main() -> int:
    parser = argparse.ArgumentParser(description="F-7 NMI under HDP backbone (extension).")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--backbone", default="hdp", choices=["hdp"])
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    summary = []
    for scene in args.scenes:
        labels = load_labels_for_scene(scene)
        if labels is None:
            print(f"[bb_f7] {scene}: no labels", flush=True)
            continue
        for recipe in args.recipes:
            doc_term = load_doc_term(recipe, scene)
            if doc_term is None:
                print(f"[bb_f7] {scene} {recipe}: no doc_term", flush=True)
                n_skip += 1
                continue
            D = doc_term.shape[0]
            if D != len(labels):
                print(f"[bb_f7] {scene} {recipe}: shape mismatch "
                      f"({D} docs vs {len(labels)} labels)", flush=True)
                n_skip += 1
                continue
            try:
                nmi = run_hdp(doc_term, labels)
            except Exception as exc:
                print(f"[bb_f7] {scene} {recipe} FAILED: {exc}", flush=True)
                n_skip += 1
                continue
            rec = {
                "scene_id": scene, "recipe": recipe, "backbone": args.backbone,
                "scheme": "uniform", "Q": 8,
                "normalised_mi": round(nmi, 6),
                "n_docs": int(D),
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds").replace("+00:00", "Z"),
                "builder": "build_v_sweep_backbones_f7 v0.1",
            }
            out = OUT_DIR / f"{args.backbone}_{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(rec, h, indent=2)
            n_ok += 1
            summary.append(rec)
            print(f"[bb_f7:{args.backbone}] {scene:30s} {recipe:4s} NMI={nmi:.3f}", flush=True)

    if summary:
        from collections import defaultdict
        by_recipe = defaultdict(list)
        for r in summary:
            by_recipe[r["recipe"]].append(r["normalised_mi"])
        print(f"\n[bb_f7:{args.backbone}] Per-recipe mean F-7 NMI:")
        for r, vals in sorted(by_recipe.items()):
            print(f"    {r:4s}  mean={sum(vals)/len(vals):.3f}  (n={len(vals)})")
    print(f"\n[bb_f7:{args.backbone}] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
