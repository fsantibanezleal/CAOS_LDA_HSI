"""Per-recipe topic count K used by every fixed-K backbone of the V-sweep.

One definition, imported by the LDA canonical fit (build_v_sweep_canonical_fit),
the ProdLDA / ETM backbone builders (F-2, F-14) and the F-7 backbone builder
(build_v_sweep_backbones_f7), so that the four backbones of a (recipe, scene)
cell are compared at the same K.

    K_P1(scene)   = max(4, min(12, #classes))
    K(scene, L)   = K_P1                          if L >= 8
                  = clip(round(L / 2), 3, K_P1)    if 2.5 <= L < 8
                  = min(4, K_P1)  (at least 3)     if L < 2.5

with L the mean number of tokens per document of the corpus. Short-document
recipes get few topics (V7, V10, V11, V13, V15, V17, V19: K = 3; V9: K = 4).

Issue #817: the F-7 backbone builder used K_P1 for ProdLDA and ETM on every
recipe while LDA used K(scene, L). Since F-7 = I(Z; Y) / H(Y) <= log K / H(Y),
the columns were bounded differently (K = 3 caps F-7 at 0.46 on these scenes).
HDP infers its own number of topics and is not forced to K.
"""
from __future__ import annotations

CLASS_COUNTS = {
    "indian-pines-corrected": 16,
    "salinas-corrected": 16,
    "salinas-a-corrected": 6,
    "pavia-university": 9,
    "kennedy-space-center": 13,
    "botswana": 14,
}


def class_count_for(scene_id: str) -> int:
    """Number of labelled classes of a scene (0 when unknown)."""
    return CLASS_COUNTS.get(scene_id, 0)


def k_p1(scene_id: str) -> int:
    """The scene-level topic count: max(4, min(12, #classes)); 12 when unknown."""
    cls = class_count_for(scene_id)
    return max(4, min(12, cls)) if cls > 0 else 12


def topic_count_for(scene_id: str, mean_doc_length: float) -> int:
    """Per-recipe K: clip(round(mean_doc / 2), 3, K_P1), K_P1 for long documents."""
    upper = k_p1(scene_id)
    if mean_doc_length < 2.5:
        return max(3, min(upper, 4))
    if mean_doc_length < 8:
        return max(3, min(upper, int(round(mean_doc_length / 2))))
    return upper
