"""F-7 NMI under HDP / ProdLDA / ETM backbones for top contender recipes.

Until now the backbone factorial only stored F-2 c_v and F-14 jaccard.
This script computes F-7 NMI (between argmax topic and label) under
each non-LDA backbone, so the four-backbone comparison covers the
class-coupling axis too.

Strategy: re-run the backbone (using the deterministic builders from
``build_v_sweep_{hdp,prodlda_backbone,etm_backbone}.py``), then project
each labelled sample through the fitted model to get the argmax topic,
then compute NMI(argmax_topic, label).

Topic count (v0.2, issue #817). F-7 = I(Z; Y) / H(Y) is bounded by
log K_used / H(Y), with K_used the number of distinct argmax topics, so
backbones compared on the same cell must use the same K. v0.1 fitted
ProdLDA and ETM with K = K_P1 = max(4, min(12, #classes)) on every recipe
while the LDA column (f7_topic_to_label) used the per-recipe K of the
canonical fit (3 for V7, V10, V11, V13, V15, V17, V19; 4 for V9). ProdLDA
and ETM now use the same per-recipe K (research_core.k_policy). HDP infers
its own number of topics (truncation T = 20) and is not forced; its record
carries the number of topics it keeps (K_used_argmax: distinct argmax
topics over the documents; K_effective: topics with >= 1% of the corpus
mass, as in build_v_sweep_hdp). Every record carries K_used_argmax and the
ceiling min(1, log2(K_used_argmax) / H(Y)) (f7_upper_bound; I(Z; Y) <= H(Z)
<= log2 K_used) so that F-7 values of different K can be read against it.

Output:
``data/derived/v_sweep/backbones_f7/{backbone}_{scene}_{recipe}_uniform_Q{q}.json``
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

from research_core import k_policy as _k_policy  # noqa: E402
from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)
from research_core.wordification_store import load_corpus  # noqa: E402

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
OUT_DIR = DERIVED_DIR / "v_sweep" / "backbones_f7"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
BUILDER = "build_v_sweep_backbones_f7 v0.2"
K_POLICY = "per-recipe K of the LDA canonical fit (research_core.k_policy.topic_count_for)"


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


def load_doc_term(recipe: str, scene_id: str, q: int = 8) -> sp.csr_matrix | None:
    """The corpus, refused when its vocab.json records another Q (#817)."""
    corpus = load_corpus(recipe, "uniform", q, scene_id, root=WORDIFICATION_LOCAL)
    return None if corpus is None else corpus[0]


def label_entropy_bits(labels: np.ndarray) -> float:
    _, counts = np.unique(labels, return_counts=True)
    p = counts / counts.sum()
    return float(-(p * np.log2(p)).sum())


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


def _neural_module():
    import importlib.util

    pipe = Path(__file__).resolve().parent
    spec = importlib.util.spec_from_file_location(
        "neural_models", pipe / "build_neural_topic_models.py",
    )
    neural = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(neural)
    return neural


def _argmax_record(argmax_topic: np.ndarray, labels: np.ndarray) -> dict:
    """F-7 plus its ceiling: I(Z; Y) <= H(Z) <= log2 K_used, so F-7 <= min(1, log2 K_used / H(Y))."""
    k_used = int(np.unique(argmax_topic).size)
    h_y = label_entropy_bits(labels)
    h_z = label_entropy_bits(argmax_topic)
    bound = min(1.0, float(np.log2(k_used)) / h_y) if (k_used > 1 and h_y > 0) else 0.0
    return {
        "normalised_mi": compute_nmi(argmax_topic, labels),
        "K_used_argmax": k_used,
        "label_entropy_bits": h_y,
        "topic_entropy_bits": h_z,
        "f7_upper_bound": bound,
    }


def run_prodlda(doc_term: sp.csr_matrix, labels: np.ndarray, K: int) -> dict:
    """Fit ProdLDA, extract argmax topic per doc, compute F-7 NMI."""
    neural = _neural_module()
    dense = doc_term.toarray().astype(np.float32)
    fit = neural.fit_prodlda(dense, K, seed=42)
    theta = fit["theta"]  # [D, K]
    argmax_topic = np.argmax(theta, axis=1).astype(np.int32)
    return _argmax_record(argmax_topic, labels)


def run_etm(doc_term: sp.csr_matrix, labels: np.ndarray, K: int) -> dict:
    """Fit ETM, extract argmax topic per doc, compute F-7 NMI."""
    neural = _neural_module()
    dense = doc_term.toarray().astype(np.float32)
    fit = neural.fit_etm(dense, K, seed=42)
    theta = fit["theta"]
    argmax_topic = np.argmax(theta, axis=1).astype(np.int32)
    return _argmax_record(argmax_topic, labels)


CLASS_COUNTS = _k_policy.CLASS_COUNTS


def k_for(scene_id: str, mean_doc: float) -> int:
    """Per-recipe K, the same as the LDA canonical fit (v0.1 returned K_P1 for every recipe)."""
    return _k_policy.topic_count_for(scene_id, mean_doc)


def run_hdp(doc_term: sp.csr_matrix, labels: np.ndarray) -> dict:
    """Fit gensim HDP, project corpus, compute F-7 NMI and the topics HDP keeps."""
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
    rec = _argmax_record(argmax_topic, labels)
    # Corpus-level topic mass (top-level sticks), as build_v_sweep_hdp reports it.
    n_topics = int(hdp.get_topics().shape[0])
    try:
        alpha = np.asarray(hdp.hdp_to_lda()[0], dtype=np.float64)[:n_topics]
    except Exception:  # noqa: BLE001
        alpha = np.zeros(n_topics, dtype=np.float64)
    pi = alpha / alpha.sum() if alpha.sum() > 0 else alpha
    rec["K_inferred_total"] = n_topics
    rec["K_effective"] = int((pi > 0.01).sum())
    return rec


def main() -> int:
    parser = argparse.ArgumentParser(description="F-7 NMI under HDP / ProdLDA / ETM backbones.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--backbone", default="hdp", choices=["hdp", "prodlda", "etm"])
    parser.add_argument("--q", type=int, default=8, choices=[8, 16, 32])
    parser.add_argument("--resume", action="store_true",
                        help=f"skip cells whose output was already written by {BUILDER} "
                             "with the K this run would use")
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR,
                        help="write here instead of data/derived (regression checks)")
    args = parser.parse_args()

    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = n_fail = n_reused = 0
    summary = []
    for scene in args.scenes:
        labels = None
        for recipe in args.recipes:
            doc_term = load_doc_term(recipe, scene, args.q)
            if doc_term is None:
                print(f"[bb_f7] {scene} {recipe}: no doc_term", flush=True)
                n_skip += 1
                continue
            D = doc_term.shape[0]
            mean_doc = float(np.asarray(doc_term.sum(axis=1)).reshape(-1).mean())
            K = None if args.backbone == "hdp" else k_for(scene, mean_doc)
            out = out_dir / f"{args.backbone}_{scene}_{recipe}_uniform_Q{args.q}.json"
            if args.resume and out.exists():
                prev = json.loads(out.read_text(encoding="utf-8"))
                if prev.get("builder") == BUILDER and prev.get("K") == K:
                    print(f"[bb_f7:{args.backbone}] {scene} {recipe}: REUSED", flush=True)
                    n_reused += 1
                    summary.append(prev)
                    continue
            if labels is None:
                labels = load_labels_for_scene(scene)
                if labels is None:
                    print(f"[bb_f7] {scene}: no labels", flush=True)
                    break
            if D != len(labels):
                print(f"[bb_f7] {scene} {recipe}: shape mismatch "
                      f"({D} docs vs {len(labels)} labels)", flush=True)
                n_fail += 1
                continue
            try:
                if args.backbone == "hdp":
                    res = run_hdp(doc_term, labels)
                elif args.backbone == "prodlda":
                    res = run_prodlda(doc_term, labels, K)
                elif args.backbone == "etm":
                    res = run_etm(doc_term, labels, K)
                else:
                    raise ValueError(f"unknown backbone {args.backbone}")
            except Exception as exc:
                print(f"[bb_f7] {scene} {recipe} FAILED: {exc}", flush=True)
                n_fail += 1
                continue
            rec = {
                "scene_id": scene, "recipe": recipe, "backbone": args.backbone,
                "scheme": "uniform", "Q": args.q,
                "normalised_mi": round(res["normalised_mi"], 6),
                "K": K,
                "K_policy": K_POLICY if K is not None else "HDP infers its topic count (T = 20)",
                "K_used_argmax": res["K_used_argmax"],
                "f7_upper_bound": round(res["f7_upper_bound"], 6),
                "label_entropy_bits": round(res["label_entropy_bits"], 6),
                "topic_entropy_bits": round(res["topic_entropy_bits"], 6),
                "mean_doc_length": round(mean_doc, 4),
                "n_docs": int(D),
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds").replace("+00:00", "Z"),
                "builder": BUILDER,
            }
            if args.backbone == "hdp":
                rec["K_effective"] = res["K_effective"]
                rec["K_inferred_total"] = res["K_inferred_total"]
            with out.open("w", encoding="utf-8") as h:
                json.dump(rec, h, indent=2)
            n_ok += 1
            summary.append(rec)
            print(f"[bb_f7:{args.backbone}] {scene:30s} {recipe:4s} K={K} "
                  f"K_used={rec['K_used_argmax']} NMI={rec['normalised_mi']:.3f} "
                  f"bound={rec['f7_upper_bound']:.3f}", flush=True)

    if summary:
        from collections import defaultdict
        by_recipe = defaultdict(list)
        for r in summary:
            by_recipe[r["recipe"]].append(r["normalised_mi"])
        print(f"\n[bb_f7:{args.backbone}] Per-recipe mean F-7 NMI:")
        for r, vals in sorted(by_recipe.items()):
            print(f"    {r:4s}  mean={sum(vals)/len(vals):.3f}  (n={len(vals)})")
    print(f"\n[bb_f7:{args.backbone}] done. ok={n_ok} reused={n_reused} "
          f"skipped={n_skip} failed={n_fail}", flush=True)
    return 1 if n_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
