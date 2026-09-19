"""F-15 alignment judge: tie-invariant form (#817).

The archived F-15 took each document's top-10 tokens with numpy.argsort, so on
documents whose tokens all appear once (V3, V12, V15) the value depended on how
the vocabulary is numbered. These tests pin the tie-invariant definition in
research_core.f15_alignment:

- the exact probabilities equal a brute-force average over every tie order;
- without ties the verdict equals the archived rule;
- renumbering the vocabulary or the topics leaves F-15 unchanged (the archived
  rule fails this, kept as a strict xfail);
- a corpus whose vocabulary differs from the fit's is refused;
- the construction limits that remain (vocabularies of <= 12 tokens, documents
  with < 3 distinct tokens) can never produce a NO verdict.
"""
from __future__ import annotations

import sys
from fractions import Fraction
from itertools import permutations, product
from pathlib import Path

import numpy as np
import pytest
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.f15_alignment import (  # noqa: E402
    cell_alignment,
    legacy_top_indices,
    legacy_verdict,
    tie_groups,
    verdict_from_counts,
    verdict_probabilities,
)


def _orders(weights: np.ndarray) -> list[list[int]]:
    """Every order of the positive weights consistent with their values (descending)."""
    groups = tie_groups(weights)
    out = []
    for perms in product(*[list(permutations(g.tolist())) for g in groups]):
        out.append([t for p in perms for t in p])
    return out


def _brute_force(doc_row: np.ndarray, phi_row: np.ndarray, n_top: int) -> dict[str, Fraction]:
    doc_orders = _orders(doc_row)
    topic_orders = _orders(phi_row)
    counts = {"YES": 0, "NO": 0, "AMBIGUOUS": 0}
    for do in doc_orders:
        doc_top = do[:n_top]
        for to in topic_orders:
            counts[legacy_verdict(doc_top, to[:n_top])] += 1
    total = len(doc_orders) * len(topic_orders)
    return {k: Fraction(v, total) for k, v in counts.items()}


def test_top5_clause_never_changes_the_verdict() -> None:
    """legacy_verdict == verdict_from_counts on random top lists (the top-5 clause is redundant)."""
    rng = np.random.default_rng(0)
    for _ in range(4000):
        V = int(rng.integers(3, 30))
        n_doc = int(rng.integers(0, min(10, V) + 1))
        doc_top = rng.choice(V, size=n_doc, replace=False).tolist()
        topic_top = rng.choice(V, size=min(10, V), replace=False).tolist()
        ts = set(topic_top)
        overlap = sum(t in ts for t in doc_top)
        miss = not any(t in ts for t in doc_top[:3])
        assert legacy_verdict(doc_top, topic_top) == verdict_from_counts(len(doc_top), overlap, miss)


CASES = [
    # (doc counts, topic weights, n_top): ties inside, across and at the cuts
    ([1, 1, 1, 1, 1, 0, 0, 0], [0.30, 0.20, 0.20, 0.10, 0.08, 0.06, 0.04, 0.02], 4),
    ([2, 1, 1, 1, 1, 1, 0, 0], [0.25, 0.25, 0.15, 0.10, 0.10, 0.10, 0.03, 0.02], 4),
    ([1, 1, 1, 1, 1, 1, 0, 0], [0.30, 0.10, 0.10, 0.10, 0.10, 0.10, 0.05, 0.05], 5),
    ([3, 3, 2, 2, 2, 1, 1, 0], [0.05, 0.10, 0.30, 0.20, 0.15, 0.10, 0.05, 0.05], 5),
    ([0, 0, 0, 1, 1, 0, 0, 1], [0.20, 0.20, 0.20, 0.10, 0.10, 0.10, 0.05, 0.05], 4),
    ([1, 1, 0, 0, 0, 0, 0, 0], [0.40, 0.20, 0.10, 0.10, 0.10, 0.05, 0.03, 0.02], 4),
    ([0, 0, 0, 0, 0, 0, 0, 0], [0.40, 0.20, 0.10, 0.10, 0.10, 0.05, 0.03, 0.02], 4),
]


@pytest.mark.parametrize("doc,phi,n_top", CASES)
def test_exact_probabilities_equal_brute_force(doc, phi, n_top) -> None:
    doc_row = np.array(doc, dtype=np.float64)
    phi_row = np.array(phi, dtype=np.float64)
    exact = verdict_probabilities(doc_row, phi_row, n_top=n_top)
    assert exact == _brute_force(doc_row, phi_row, n_top)
    assert sum(exact.values()) == 1


def test_random_small_cases_equal_brute_force() -> None:
    rng = np.random.default_rng(7)
    checked = 0
    while checked < 60:
        V = 7
        doc = rng.integers(0, 3, size=V).astype(np.float64)
        phi = rng.choice([0.05, 0.1, 0.2, 0.3], size=V).astype(np.float64)
        n_orders = len(_orders(doc)) * len(_orders(phi))
        if n_orders > 20000:
            continue
        n_top = int(rng.integers(3, 6))
        assert verdict_probabilities(doc, phi, n_top=n_top) == _brute_force(doc, phi, n_top)
        checked += 1


def test_without_ties_the_verdict_is_the_archived_one() -> None:
    rng = np.random.default_rng(1)
    for _ in range(300):
        V = int(rng.integers(12, 60))
        doc = np.where(rng.random(V) < 0.5, 0.0, rng.permutation(V) + 1.0)  # distinct counts
        phi = rng.dirichlet(np.ones(V))
        probs = verdict_probabilities(doc, phi)
        legacy = legacy_verdict(legacy_top_indices(doc, 10), legacy_top_indices(phi, 10))
        assert probs[legacy] == 1


def _tied_corpus(seed: int = 3, D: int = 40, V: int = 60, K: int = 3):
    """V3-like corpus: every document holds 25 distinct tokens once each."""
    rng = np.random.default_rng(seed)
    rows, cols = [], []
    for d in range(D):
        toks = rng.choice(V, size=25, replace=False)
        rows.extend([d] * toks.size)
        cols.extend(toks.tolist())
    doc_term = sp.csr_matrix((np.ones(len(rows)), (rows, cols)), shape=(D, V))
    phi = rng.dirichlet(np.full(V, 0.3), size=K)
    theta = rng.dirichlet(np.ones(K), size=D).astype(np.float32)
    sample = np.random.default_rng(42).choice(D, size=20, replace=False)
    return doc_term, theta, phi, sample


def _permuted(doc_term, theta, phi, perm_v, perm_k):
    return doc_term[:, perm_v], theta[:, perm_k], phi[perm_k][:, perm_v]


def test_f15_is_invariant_to_vocabulary_and_topic_numbering() -> None:
    doc_term, theta, phi, sample = _tied_corpus()
    base = cell_alignment(doc_term, theta, phi, sample)
    rng = np.random.default_rng(11)
    for _ in range(5):
        perm_v = rng.permutation(doc_term.shape[1])
        perm_k = rng.permutation(phi.shape[0])
        out = cell_alignment(*_permuted(doc_term, theta, phi, perm_v, perm_k), sample)
        assert out["f15_alignment"] == base["f15_alignment"]
        assert out["expected_no"] == base["expected_no"]
    assert base["n_docs_tie_dependent"] >= 10


@pytest.mark.xfail(strict=True, reason="the archived argsort rule depends on token numbering (#817)")
def test_archived_rule_is_not_invariant_to_vocabulary_numbering() -> None:
    doc_term, theta, phi, sample = _tied_corpus()
    base = cell_alignment(doc_term, theta, phi, sample)["f15_alignment_legacy_argsort"]
    rng = np.random.default_rng(11)
    for _ in range(5):
        perm_v = rng.permutation(doc_term.shape[1])
        out = cell_alignment(*_permuted(doc_term, theta, phi, perm_v, np.arange(3)), sample)
        assert out["f15_alignment_legacy_argsort"] == base


def test_corpus_with_another_vocabulary_is_refused() -> None:
    """The V15 failure of #817: Q = 32 documents (192 tokens) against Q = 8 topics (48)."""
    rng = np.random.default_rng(0)
    doc_term = sp.csr_matrix(rng.integers(0, 2, size=(30, 192)).astype(np.float64))
    phi = rng.dirichlet(np.ones(48), size=3)
    theta = rng.dirichlet(np.ones(3), size=30)
    with pytest.raises(ValueError, match="192 tokens but the fit's phi has 48"):
        cell_alignment(doc_term, theta, phi, np.arange(20))


def test_small_vocabulary_and_short_documents_can_never_be_no() -> None:
    rng = np.random.default_rng(5)
    for _ in range(200):
        V = int(rng.integers(3, 13))  # at most 12 tokens: top-10 leaves < 3 outside
        doc = rng.integers(0, 4, size=V).astype(np.float64)
        phi = rng.dirichlet(np.ones(V))
        assert verdict_probabilities(doc, phi)["NO"] == 0
    for _ in range(200):
        V = 40
        doc = np.zeros(V)
        doc[rng.choice(V, size=int(rng.integers(1, 3)), replace=False)] = rng.integers(1, 5)
        phi = rng.dirichlet(np.ones(V))
        assert verdict_probabilities(doc, phi)["NO"] == 0
