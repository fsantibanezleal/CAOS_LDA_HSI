"""Validated wordification store (#817).

On 2026-05-30 the V15 builder, which then wrote every ``--q`` run to a
hard-coded ``V15/uniform_Q8`` folder, overwrote the Q = 8 corpus with the
Q = 32 vocabulary; F-15 and the HDP backbone then read it for months. These
tests pin the guards: the writer derives the folder from the Q it records,
the reader refuses a corpus that records another Q, and a corpus can be
checked against the LDA fit trained on it.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pytest
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.wordification_store import (  # noqa: E402
    CorpusStoreError,
    check_against_fit,
    corpus_dir,
    corpus_marginal,
    doc_lengths,
    load_corpus,
    write_corpus,
)


def _corpus(q: int, n_idx: int = 6, D: int = 40, seed: int = 0):
    """A V15-like corpus: one token per index, bins in [0, q)."""
    rng = np.random.default_rng(seed)
    bins = rng.integers(0, q, size=(D, n_idx))
    rows = np.repeat(np.arange(D), n_idx)
    cols = (np.arange(n_idx) * q + bins).reshape(-1)
    doc_term = sp.csr_matrix((np.ones(rows.size, dtype=np.int32), (rows, cols)),
                             shape=(D, n_idx * q))
    vocab = [f"I{i}_q{b:02d}" for i in range(n_idx) for b in range(q)]
    return doc_term, {"vocab": vocab, "recipe": "V15", "scheme": "uniform", "Q": q}


def test_writer_refuses_a_q_other_than_its_folder(tmp_path: Path) -> None:
    doc_term, meta = _corpus(32)
    with pytest.raises(CorpusStoreError, match="metadata Q=32 but the folder is uniform_Q8"):
        write_corpus(corpus_dir("V15", "uniform", 8, "scene", root=tmp_path), doc_term, meta)
    assert not (tmp_path / "V15" / "uniform_Q8" / "scene" / "doc_term.npz").exists()


def test_writer_refuses_columns_that_do_not_match_the_vocabulary(tmp_path: Path) -> None:
    doc_term, meta = _corpus(8)
    meta["vocab"] = meta["vocab"][:-1]
    with pytest.raises(CorpusStoreError, match="columns but the vocabulary has"):
        write_corpus(corpus_dir("V15", "uniform", 8, "scene", root=tmp_path), doc_term, meta)


def test_reader_refuses_the_overwritten_state(tmp_path: Path) -> None:
    """Reproduce 2026-05-30: Q = 32 files under the uniform_Q8 folder."""
    doc_term, meta = _corpus(32)
    d = tmp_path / "V15" / "uniform_Q8" / "scene"
    d.mkdir(parents=True)
    sp.save_npz(d / "doc_term.npz", doc_term)
    (d / "vocab.json").write_text(json.dumps(meta), encoding="utf-8")
    with pytest.raises(CorpusStoreError, match="records Q=32"):
        load_corpus("V15", "uniform", 8, "scene", root=tmp_path)


def test_round_trip(tmp_path: Path) -> None:
    doc_term, meta = _corpus(8)
    write_corpus(corpus_dir("V15", "uniform", 8, "scene", root=tmp_path), doc_term, meta)
    back, back_meta = load_corpus("V15", "uniform", 8, "scene", root=tmp_path)
    assert (back != doc_term).nnz == 0
    assert back_meta == meta
    assert load_corpus("V15", "uniform", 16, "scene", root=tmp_path) is None


def _fit_dir(tmp_path: Path, doc_term: sp.csr_matrix, meta: dict) -> Path:
    fit = tmp_path / "fit"
    fit.mkdir()
    np.save(fit / "corpus_marginal.npy", corpus_marginal(doc_term))
    np.save(fit / "doc_lengths.npy", doc_lengths(doc_term))
    np.save(fit / "phi.npy", np.full((3, doc_term.shape[1]), 1.0 / doc_term.shape[1], dtype=np.float32))
    (fit / "vocab.json").write_text(json.dumps(meta), encoding="utf-8")
    return fit


def test_check_against_fit(tmp_path: Path) -> None:
    doc8, meta8 = _corpus(8)
    fit = _fit_dir(tmp_path, doc8, meta8)
    assert check_against_fit(doc8, meta8, fit) == []
    # The Q = 32 corpus of the same documents (q8 = q32 // 4 would recover doc8).
    doc32, meta32 = _corpus(32)
    problems = check_against_fit(doc32, meta32, fit)
    assert any("vocabulary differs" in p for p in problems)
    assert any("Q differs" in p for p in problems)
    assert any("corpus marginal differs" in p for p in problems)
    assert any("fit phi has 48 columns, corpus 192" in p for p in problems)


def _import_v15_builder():
    spec = importlib.util.spec_from_file_location(
        "build_wordifications_v15", ROOT / "data-pipeline" / "build_wordifications_v15.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize("q", [8, 16, 32])
def test_v15_builder_writes_each_q_to_its_own_folder(tmp_path: Path, monkeypatch, q: int) -> None:
    """The pre-2d51158 builder wrote every --q run to V15/uniform_Q8; this pins the fix."""
    mod = _import_v15_builder()
    root = tmp_path / "wordifications" / "V15"
    monkeypatch.setattr(mod, "WORDIFICATION_LOCAL_ROOT", root)

    def fake_build(scene_id: str, qq: int = 8) -> dict:
        doc_term, meta = _corpus(qq)
        return {"scene_id": scene_id, "D": doc_term.shape[0], "B": 200,
                "indices_computed": ["EVI", "MNDWI", "NBR", "NDSI", "NDVI", "SAVI"],
                "Q": qq, "vocab_size": len(meta["vocab"]), "doc_term": doc_term,
                "vocab": meta["vocab"]}

    monkeypatch.setattr(mod, "build_for_scene", fake_build)
    monkeypatch.setattr(sys, "argv", ["build_wordifications_v15.py", "--q", str(q),
                                      "--scenes", "indian-pines-corrected"])
    assert mod.main() == 0
    written = sorted(p.name for p in root.iterdir())
    assert written == [f"uniform_Q{q}"]
    doc_term, meta = load_corpus("V15", "uniform", q, "indian-pines-corrected",
                                 root=tmp_path / "wordifications")
    assert meta["Q"] == q and doc_term.shape[1] == 6 * q
