"""F-15 topic-document alignment: the deterministic judge and its tie-invariant form.

The rule (build_v_sweep_f15_self_judge, stand-in for the LLM judge of
build_v_sweep_f15_llm_alignment) compares a document's top-N tokens (N = 10,
by count) with the top-N tokens (by phi) of the document's argmax topic:

- YES (aligned) if the two top-N lists share >= 3 tokens, or if the document's
  top-1 token is among the topic's top-5;
- NO (misaligned) if the document has >= 3 top tokens and none of its top-3 is
  among the topic's top-N;
- otherwise AMBIGUOUS if the lists share no token, else YES.

F-15 of a (recipe, scene) cell is YES / (YES + NO) over 20 sampled documents.

Why a tie-invariant form (issue #817)
-------------------------------------
"Top-N" is not defined when weights tie at the cut: the archived builder took
the first N entries of ``numpy.argsort(w)[::-1]``, so the order among equal
counts decided the list. Several recipes put every token in a document exactly
once (V3 and V12: one token per band; V15: one token per index), so the whole
document is one tie and its top-10 and top-3 were fixed by the sort order of
the token indices, an artefact of how the vocabulary happens to be numbered.
The archived V3 value (0.117) moves to 0.033 when ties are broken by band index
and to about 0.18 when they are broken at random: the value measured the
vocabulary numbering, not the topics.

The tie-invariant F-15 treats tied tokens symmetrically: every token of a tie
group is equally likely to fill the free positions of a top-k list. Formally,
the verdict of a document is replaced by its distribution under uniformly random
tie-breaking, independently in the document and in the topic (each order
consistent with the weights equally likely), and computed exactly (hypergeometric
counting, rational arithmetic), not by sampling. A cell's F-15 is the ratio of
expected counts, sum_d P(YES_d) / sum_d (P(YES_d) + P(NO_d)): each document
contributes fractional YES / NO / AMBIGUOUS membership, which is exactly the
pooled rate obtained by averaging the counts over all tie orders. Properties:

- It equals the archived rule whenever no tie crosses a cut (the verdict is then
  certain), so recipes without ties keep their archived values exactly.
- It does not change when the vocabulary or the topics are renumbered (the
  archived rule does), because it depends only on the weights.
- Ties in the argmax topic are averaged in the same way.

A structural remark used by the computation: the "top-1 in topic top-5" clause
never changes a verdict. If the document's top-1 is in the topic's top-5, it is
in the topic's top-N, so the overlap is >= 1 and the top-3 intersects the
topic's list; the rule then returns YES through its final clause anyway. The
verdict therefore depends only on the size n of the document's top list, the
overlap O (the number of tokens the two top-N lists share) and whether the
document's top-3 misses the topic's top-N:

    AMBIGUOUS if n == 0;  YES if O >= 3;  NO if n >= 3 and top-3 misses;
    AMBIGUOUS if O == 0 (then n < 3);  YES otherwise.

Construction limits that remain (they are not tie effects): a document with
fewer than three distinct tokens can never be NO, and neither can any document
when the vocabulary has at most N + 2 tokens (the topic's top-N leaves fewer
than three tokens outside it), so such cells score 1.0 whenever any document
is YES.
"""
from __future__ import annotations

from fractions import Fraction
from itertools import product
from math import comb

import numpy as np

N_TOP_TOKENS = 10
N_TOP3 = 3
OVERLAP_YES = 3


# ---------------------------------------------------------------------------
# The archived rule, kept verbatim for comparison (build_v_sweep_f15_self_judge v0.1)
# ---------------------------------------------------------------------------
def legacy_top_indices(weights: np.ndarray, n: int, threshold: float = 0.0) -> list[int]:
    """Top-n indices by ``numpy.argsort(weights)[::-1]`` (tie order = sort order)."""
    n = min(n, weights.size)
    idx = np.argsort(weights)[::-1]
    out = []
    for i in idx[:n]:
        if float(weights[int(i)]) > threshold:
            out.append(int(i))
        if len(out) >= n:
            break
    return out


def legacy_verdict(doc_top: list[int], topic_top: list[int]) -> str:
    """The archived judge: 'YES', 'NO' or 'AMBIGUOUS'."""
    if not doc_top:
        return "AMBIGUOUS"
    topic_set = set(topic_top)
    overlap = sum(1 for t in doc_top if t in topic_set)
    if overlap >= OVERLAP_YES:
        return "YES"
    if doc_top[0] in set(topic_top[:5]):
        return "YES"
    if len(doc_top) >= N_TOP3:
        if not any(t in topic_set for t in doc_top[:N_TOP3]):
            return "NO"
    return "AMBIGUOUS" if overlap == 0 else "YES"


def verdict_from_counts(n: int, overlap: int, top3_misses: bool) -> str:
    """The verdict as a function of (n, O, top-3 misses); equals legacy_verdict."""
    if n == 0:
        return "AMBIGUOUS"
    if overlap >= OVERLAP_YES:
        return "YES"
    if n >= N_TOP3 and top3_misses:
        return "NO"
    if overlap == 0:
        return "AMBIGUOUS"
    return "YES"


# ---------------------------------------------------------------------------
# Tie-invariant form
# ---------------------------------------------------------------------------
def tie_groups(weights: np.ndarray) -> list[np.ndarray]:
    """Indices of the positive weights, grouped by equal value, largest value first."""
    w = np.asarray(weights, dtype=np.float64).reshape(-1)
    pos = np.flatnonzero(w > 0)
    if pos.size == 0:
        return []
    vals = w[pos]
    order = np.argsort(-vals, kind="stable")
    pos, vals = pos[order], vals[order]
    cuts = np.flatnonzero(np.diff(vals) != 0) + 1
    return [np.sort(g) for g in np.split(pos, cuts)]


def _hypergeom(pop: int, succ: int, draws: int, k: int) -> Fraction:
    """P(k successes) drawing ``draws`` without replacement from ``pop`` with ``succ`` successes."""
    if k < 0 or k > succ or draws - k < 0 or draws - k > pop - succ:
        return Fraction(0)
    return Fraction(comb(succ, k) * comb(pop - succ, draws - k), comb(pop, draws))


def _topic_top_structure(phi_row: np.ndarray, n_top: int) -> tuple[set[int], np.ndarray, int]:
    """(tokens certainly in the topic's top-n, boundary tie group, free slots in it)."""
    groups = tie_groups(phi_row)
    m = min(n_top, sum(g.size for g in groups))
    fixed: list[int] = []
    for g in groups:
        if len(fixed) + g.size <= m:
            fixed.extend(int(i) for i in g)
            if len(fixed) == m:
                return set(fixed), np.empty(0, dtype=np.int64), 0
        else:
            return set(fixed), g, m - len(fixed)
    return set(fixed), np.empty(0, dtype=np.int64), 0


def verdict_probabilities(doc_row: np.ndarray, phi_row: np.ndarray,
                          n_top: int = N_TOP_TOKENS) -> dict[str, Fraction]:
    """Exact P(YES), P(NO), P(AMBIGUOUS) of the rule under uniformly random tie-breaking.

    ``doc_row`` holds the document's token counts and ``phi_row`` the topic's
    token weights over the same vocabulary. Every order of the tokens that is
    consistent with the weights is equally likely, independently for the
    document and for the topic.
    """
    doc_groups = tie_groups(doc_row)
    n = min(n_top, sum(g.size for g in doc_groups))
    if n == 0:
        return {"YES": Fraction(0), "NO": Fraction(0), "AMBIGUOUS": Fraction(1)}
    n3 = min(N_TOP3, n)

    # Document side: group j fills positions (start_j, start_j + g_j]; a_j of its
    # tokens land in the top-3 and b_j in the top-n. Only groups with b_j > 0 matter.
    layout = []  # (tokens, a_j, b_j)
    start = 0
    for g in doc_groups:
        b = max(0, min(n - start, g.size))
        if b == 0:
            break
        a = max(0, min(n3 - start, g.size))
        layout.append((g, a, b))
        start += g.size

    fixed_topic, boundary, free = _topic_top_structure(phi_row, n_top)
    boundary_set = set(int(i) for i in boundary)
    f_counts = [sum(1 for t in g if int(t) in fixed_topic) for g, _, _ in layout]
    e_counts = [sum(1 for t in g if int(t) in boundary_set) for g, _, _ in layout]
    e_rest = len(boundary_set) - sum(e_counts)

    def doc_side(t_counts: list[int]) -> dict[str, Fraction]:
        # DP over groups: state (overlap capped at 3, top-3 still missing the topic).
        states = {(0, True): Fraction(1)}
        for (g, a, b), t in zip(layout, t_counts):
            gs = g.size
            nxt: dict[tuple[int, bool], Fraction] = {}
            for y in range(0, min(t, b) + 1):
                py = _hypergeom(gs, t, b, y)
                if py == 0:
                    continue
                # top-3 part of the group: a random a-subset of its b drawn tokens
                p_x0 = Fraction(comb(b - y, a), comb(b, a)) if a > 0 else Fraction(1)
                for (o, miss), p in states.items():
                    o2 = min(OVERLAP_YES, o + y)
                    if p_x0 > 0:
                        key = (o2, miss)
                        nxt[key] = nxt.get(key, Fraction(0)) + p * py * p_x0
                    if p_x0 < 1:
                        key = (o2, False)
                        nxt[key] = nxt.get(key, Fraction(0)) + p * py * (1 - p_x0)
            states = nxt
        out = {"YES": Fraction(0), "NO": Fraction(0), "AMBIGUOUS": Fraction(0)}
        for (o, miss), p in states.items():
            out[verdict_from_counts(n, o, miss)] += p
        return out

    if free == 0:
        return doc_side(f_counts)

    total = Fraction(0)
    result = {"YES": Fraction(0), "NO": Fraction(0), "AMBIGUOUS": Fraction(0)}
    denom = comb(len(boundary_set), free)
    ranges = [range(0, min(e, free) + 1) for e in e_counts]
    for ks in product(*ranges):
        k_rest = free - sum(ks)
        if k_rest < 0 or k_rest > e_rest:
            continue
        w = comb(e_rest, k_rest)
        for e, k in zip(e_counts, ks):
            w *= comb(e, k)
        if w == 0:
            continue
        pw = Fraction(w, denom)
        total += pw
        part = doc_side([f + k for f, k in zip(f_counts, ks)])
        for key in result:
            result[key] += pw * part[key]
    assert total == 1, total
    return result


def cell_alignment(doc_term, theta: np.ndarray, phi: np.ndarray, sample_idx: np.ndarray,
                   n_top: int = N_TOP_TOKENS) -> dict:
    """Legacy and tie-invariant F-15 of one cell over the sampled documents.

    ``doc_term`` is the corpus (rows indexable, ``.toarray()``), ``theta`` the
    document-topic matrix and ``phi`` the topic-word matrix of the fit trained
    on that corpus. Raises ValueError when the corpus and the fit disagree on
    the vocabulary size (the V15 failure of #817).
    """
    if phi.shape[1] != doc_term.shape[1]:
        raise ValueError(
            f"corpus has {doc_term.shape[1]} tokens but the fit's phi has {phi.shape[1]}"
        )
    if theta.shape[0] != doc_term.shape[0]:
        raise ValueError(
            f"corpus has {doc_term.shape[0]} documents but the fit's theta has {theta.shape[0]}"
        )
    K, V = phi.shape
    legacy_topic_top = [legacy_top_indices(phi[k], n_top) for k in range(K)]
    exp = {"YES": Fraction(0), "NO": Fraction(0), "AMBIGUOUS": Fraction(0)}
    legacy = {"YES": 0, "NO": 0, "AMBIGUOUS": 0}
    docs = []
    n_tie_dependent = n_short = 0
    for d_idx in sample_idx:
        d_idx = int(d_idx)
        row = np.asarray(doc_term[d_idx].toarray()).reshape(-1).astype(np.float64)
        th = theta[d_idx]
        z_legacy = int(np.argmax(th))
        tied_topics = [int(k) for k in np.flatnonzero(th == th.max())]
        probs = {"YES": Fraction(0), "NO": Fraction(0), "AMBIGUOUS": Fraction(0)}
        for k in tied_topics:
            pk = verdict_probabilities(row, phi[k], n_top)
            for key in probs:
                probs[key] += pk[key] / len(tied_topics)
        v_legacy = legacy_verdict(legacy_top_indices(row, n_top), legacy_topic_top[z_legacy])
        legacy[v_legacy] += 1
        for key in exp:
            exp[key] += probs[key]
        n_distinct = int((row > 0).sum())
        n_short += int(n_distinct < N_TOP3)
        certain = max(probs.values()) == 1
        n_tie_dependent += int(not certain)
        docs.append({
            "doc_idx": d_idx,
            "topic": z_legacy,
            "tied_argmax_topics": tied_topics if len(tied_topics) > 1 else None,
            "n_distinct_tokens": n_distinct,
            "p_yes": float(probs["YES"]),
            "p_no": float(probs["NO"]),
            "p_ambiguous": float(probs["AMBIGUOUS"]),
            "verdict_legacy_argsort": v_legacy,
        })
    decisive = exp["YES"] + exp["NO"]
    f15 = exp["YES"] / decisive if decisive > 0 else Fraction(0)
    legacy_decisive = legacy["YES"] + legacy["NO"]
    f15_legacy = legacy["YES"] / max(legacy_decisive, 1) if legacy_decisive > 0 else 0.0
    return {
        "K": int(K), "V": int(V), "n_docs": int(len(sample_idx)),
        "f15_alignment": float(f15),
        "expected_yes": float(exp["YES"]), "expected_no": float(exp["NO"]),
        "expected_ambiguous": float(exp["AMBIGUOUS"]),
        "f15_alignment_legacy_argsort": round(float(f15_legacy), 6),
        "legacy_n_yes": legacy["YES"], "legacy_n_no": legacy["NO"],
        "legacy_n_ambiguous": legacy["AMBIGUOUS"],
        "n_docs_tie_dependent": int(n_tie_dependent),
        "n_docs_fewer_than_3_tokens": int(n_short),
        "no_verdict_impossible_vocab": bool(V - min(n_top, V) < N_TOP3),
        "decisions": docs,
    }
