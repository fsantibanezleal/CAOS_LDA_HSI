"""Audit every stored wordification corpus against its folder and its LDA fit.

For each ``data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/`` corpus:

- ``vocab.json`` must record the folder's Q (and scheme);
- ``doc_term.npz`` must have one column per vocabulary token;
- when a canonical LDA fit of that corpus exists
  (``data/local/v_sweep/lda_fits/<scene>_<recipe>_<scheme>_Q<q>/``), the corpus
  vocabulary must equal the one the fit stored, and the corpus marginal and the
  document lengths must equal the fit's ``corpus_marginal.npy`` and
  ``doc_lengths.npy`` exactly.

This is the check that would have caught the V15 Q = 8 corpus overwritten with
the Q = 32 vocabulary on 2026-05-30 (#817). Run it after any wordification
rebuild; it exits 1 when any corpus disagrees.

Usage: python data-pipeline/check_wordification_store.py [--recipes V15 ...] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.wordification_store import (  # noqa: E402
    LDA_FIT_ROOT,
    WORDIFICATION_ROOT,
    CorpusStoreError,
    check_against_fit,
    folder_scheme_q,
)


def audit_corpus(recipe: str, sdir: Path, fit_root: Path) -> dict:
    """Return the audit record of one corpus folder."""
    scheme, q = folder_scheme_q(sdir)
    rec = {"recipe": recipe, "scheme": scheme, "Q": q, "scene_id": sdir.name,
           "problems": [], "fit_checked": False}
    meta = json.loads((sdir / "vocab.json").read_text(encoding="utf-8"))
    doc_term = sp.load_npz(sdir / "doc_term.npz").tocsr()
    rec["recorded_Q"] = meta.get("Q")
    rec["n_docs"], rec["n_cols"] = int(doc_term.shape[0]), int(doc_term.shape[1])
    rec["n_vocab"] = len(meta.get("vocab") or [])
    rec["generated_at"] = meta.get("generated_at")
    if "Q" in meta and int(meta["Q"]) != q:
        rec["problems"].append(f"vocab.json records Q={meta['Q']}, folder Q={q}")
    if meta.get("scheme") not in (None, scheme):
        rec["problems"].append(f"vocab.json records scheme={meta['scheme']!r}")
    if rec["n_cols"] != rec["n_vocab"]:
        rec["problems"].append(f"{rec['n_cols']} columns, {rec['n_vocab']} vocabulary tokens")
    fit_dir = fit_root / f"{sdir.name}_{recipe}_{scheme}_Q{q}"
    if (fit_dir / "vocab.json").exists():
        rec["fit_checked"] = True
        rec["problems"].extend(check_against_fit(doc_term, meta, fit_dir))
    return rec


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--recipes", nargs="+", default=None)
    parser.add_argument("--root", type=Path, default=WORDIFICATION_ROOT)
    parser.add_argument("--fit-root", type=Path, default=LDA_FIT_ROOT)
    parser.add_argument("--json", type=Path, default=None,
                        help="also write the per-corpus records to this JSON file")
    args = parser.parse_args()

    records = []
    for rdir in sorted(p for p in args.root.iterdir() if p.is_dir()):
        if args.recipes and rdir.name not in args.recipes:
            continue
        for qdir in sorted(p for p in rdir.iterdir() if p.is_dir()):
            for sdir in sorted(p for p in qdir.iterdir() if p.is_dir()):
                try:
                    records.append(audit_corpus(rdir.name, sdir, args.fit_root))
                except (CorpusStoreError, OSError, ValueError) as exc:
                    records.append({"recipe": rdir.name, "folder": str(sdir),
                                    "problems": [f"unreadable: {exc}"], "fit_checked": False})
    bad = [r for r in records if r["problems"]]
    for r in bad:
        where = f"{r['recipe']} {r.get('scheme', '?')}_Q{r.get('Q', '?')} {r.get('scene_id', r.get('folder'))}"
        print(f"PROBLEM {where}: " + "; ".join(r["problems"]))
    n_fit = sum(1 for r in records if r["fit_checked"])
    print(f"checked {len(records)} corpora ({n_fit} against their LDA fit): {len(bad)} with problems")
    if args.json:
        args.json.write_text(json.dumps(records, indent=1), encoding="utf-8")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
