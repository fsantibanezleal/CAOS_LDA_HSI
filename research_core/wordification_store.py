"""Validated storage of wordification corpora (doc-term matrices).

Every wordification builder writes one corpus per (recipe, scheme, Q, scene)
to ``data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/`` as
``doc_term.npz`` plus ``vocab.json`` (which records ``"Q"`` and the vocabulary).
Every downstream builder reads the corpus back by the same path.

Why this module exists (issue #817): before commit 2d51158 the V15 builder wrote
every ``--q`` run to a hard-coded ``V15/uniform_Q8`` folder, so the Q-sweep's
``--q 32`` run overwrote the Q = 8 corpus with the Q = 32 vocabulary on
2026-05-30. Nothing checked the folder against its content, and three builders
(F-15, HDP) read the wrong vocabulary for months: F-15 compared document token
indices of the 192-token Q = 32 vocabulary with topic token indices of the
48-token Q = 8 fit. The writer here derives the folder from the same ``q`` that
is recorded in the metadata and refuses a mismatch; the reader refuses a corpus
whose recorded Q, column count or vocabulary disagree with what was asked for;
``check_against_fit`` compares a corpus with the stored LDA fit that was trained
on it (corpus marginal and document lengths, exactly as the fit stored them).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from research_core.paths import DATA_DIR

WORDIFICATION_ROOT = DATA_DIR / "local" / "wordifications"
LDA_FIT_ROOT = DATA_DIR / "local" / "v_sweep" / "lda_fits"

_FOLDER_RE = re.compile(r"^(?P<scheme>[a-z_]+)_Q(?P<q>\d+)$")


class CorpusStoreError(RuntimeError):
    """A stored corpus disagrees with its folder, its metadata or its fit."""


def corpus_dir(recipe: str, scheme: str, q: int, scene_id: str,
               root: Path | None = None) -> Path:
    """Folder of one corpus: ``<root>/<recipe>/<scheme>_Q<q>/<scene_id>``."""
    base = WORDIFICATION_ROOT if root is None else Path(root)
    return base / recipe / f"{scheme}_Q{int(q)}" / scene_id


def folder_scheme_q(out_dir: Path) -> tuple[str, int]:
    """Parse ``(scheme, q)`` from a corpus folder's parent (``<scheme>_Q<q>``)."""
    m = _FOLDER_RE.match(Path(out_dir).parent.name)
    if m is None:
        raise CorpusStoreError(
            f"{out_dir}: parent folder {Path(out_dir).parent.name!r} is not '<scheme>_Q<q>'"
        )
    return m.group("scheme"), int(m.group("q"))


def write_corpus(out_dir: Path, doc_term: sp.spmatrix, meta: dict) -> None:
    """Write ``doc_term.npz`` and ``vocab.json`` after checking they agree.

    Refuses to write when the ``Q`` recorded in ``meta`` differs from the Q in
    the folder name, or when the number of columns differs from the vocabulary.
    """
    scheme, q = folder_scheme_q(out_dir)
    if "Q" not in meta or int(meta["Q"]) != q:
        raise CorpusStoreError(
            f"{out_dir}: metadata Q={meta.get('Q')!r} but the folder is {scheme}_Q{q}"
        )
    if meta.get("scheme") not in (None, scheme):
        raise CorpusStoreError(
            f"{out_dir}: metadata scheme={meta.get('scheme')!r} but the folder is {scheme}_Q{q}"
        )
    vocab = meta.get("vocab")
    if vocab is None or doc_term.shape[1] != len(vocab):
        raise CorpusStoreError(
            f"{out_dir}: doc_term has {doc_term.shape[1]} columns but the vocabulary has "
            f"{None if vocab is None else len(vocab)} tokens"
        )
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    sp.save_npz(out_dir / "doc_term.npz", sp.csr_matrix(doc_term))
    with (out_dir / "vocab.json").open("w", encoding="utf-8") as handle:
        json.dump(meta, handle)


def load_corpus(recipe: str, scheme: str, q: int, scene_id: str,
                root: Path | None = None) -> tuple[sp.csr_matrix, dict] | None:
    """Read one corpus and check it is the one asked for.

    Returns ``None`` when the corpus does not exist. Raises
    :class:`CorpusStoreError` when ``vocab.json`` records another Q or scheme,
    or when the doc-term columns do not match the vocabulary.
    """
    d = corpus_dir(recipe, scheme, q, scene_id, root)
    npz_path, vocab_path = d / "doc_term.npz", d / "vocab.json"
    if not (npz_path.exists() and vocab_path.exists()):
        return None
    meta = json.loads(vocab_path.read_text(encoding="utf-8"))
    doc_term = sp.load_npz(npz_path).tocsr()
    problems = []
    if "Q" in meta and int(meta["Q"]) != int(q):
        problems.append(f"vocab.json records Q={meta['Q']}")
    if meta.get("scheme") not in (None, scheme):
        problems.append(f"vocab.json records scheme={meta['scheme']!r}")
    if "vocab" in meta and doc_term.shape[1] != len(meta["vocab"]):
        problems.append(
            f"doc_term has {doc_term.shape[1]} columns, vocabulary {len(meta['vocab'])}"
        )
    if problems:
        raise CorpusStoreError(f"{d} (asked for {scheme} Q={q}): " + "; ".join(problems))
    return doc_term, meta


def corpus_marginal(doc_term: sp.spmatrix) -> np.ndarray:
    """Token frequencies over the corpus, float32, as the canonical fit stores them."""
    totals = np.asarray(doc_term.sum(axis=0)).reshape(-1).astype(np.float64)
    return (totals / max(float(totals.sum()), 1e-12)).astype(np.float32)


def doc_lengths(doc_term: sp.spmatrix) -> np.ndarray:
    """Tokens per document, int32, as the canonical fit stores them."""
    return np.asarray(doc_term.sum(axis=1)).reshape(-1).astype(np.int32)


def check_against_fit(doc_term: sp.spmatrix, meta: dict, fit_dir: Path) -> list[str]:
    """Compare a corpus with the stored LDA fit trained on it.

    The canonical fit (build_v_sweep_canonical_fit) stores the corpus
    ``vocab.json`` it read, ``corpus_marginal.npy`` (float32) and
    ``doc_lengths.npy`` (int32). Returns the list of disagreements (empty when
    the corpus is the one the fit was trained on, up to row order within equal
    marginals and lengths).
    """
    fit_dir = Path(fit_dir)
    problems: list[str] = []
    fit_meta = json.loads((fit_dir / "vocab.json").read_text(encoding="utf-8"))
    if fit_meta.get("vocab") != meta.get("vocab"):
        problems.append(
            f"vocabulary differs from the fit's ({len(meta.get('vocab') or [])} vs "
            f"{len(fit_meta.get('vocab') or [])} tokens)"
        )
    if "Q" in fit_meta and "Q" in meta and int(fit_meta["Q"]) != int(meta["Q"]):
        problems.append(f"Q differs from the fit's ({meta['Q']} vs {fit_meta['Q']})")
    stored_marginal = np.load(fit_dir / "corpus_marginal.npy")
    marginal = corpus_marginal(doc_term)
    if stored_marginal.shape != marginal.shape or not np.array_equal(stored_marginal, marginal):
        problems.append("corpus marginal differs from the fit's")
    stored_lengths = np.load(fit_dir / "doc_lengths.npy")
    lengths = doc_lengths(doc_term)
    if stored_lengths.shape != lengths.shape or not np.array_equal(stored_lengths, lengths):
        problems.append("document lengths differ from the fit's")
    phi_path = fit_dir / "phi.npy"
    if phi_path.exists():
        n_cols = np.load(phi_path, mmap_mode="r").shape[1]
        if n_cols != doc_term.shape[1]:
            problems.append(f"fit phi has {n_cols} columns, corpus {doc_term.shape[1]}")
    return problems
