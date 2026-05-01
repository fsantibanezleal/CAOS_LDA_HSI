"""Shared spectral utilities for offline validation experiments."""
from __future__ import annotations

import numpy as np
from scipy.optimize import linear_sum_assignment


def row_normalize(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    norms = np.linalg.norm(values, axis=1, keepdims=True)
    return values / np.maximum(norms, 1e-8)


def spectral_angle_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a_unit = row_normalize(a)
    b_unit = row_normalize(b)
    cosine = np.clip(a_unit @ b_unit.T, -1.0, 1.0)
    return np.degrees(np.arccos(cosine)).astype(np.float32)


def cosine_similarity_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a_unit = row_normalize(a)
    b_unit = row_normalize(b)
    return np.clip(a_unit @ b_unit.T, -1.0, 1.0).astype(np.float32)


def best_alignment(cost_matrix: np.ndarray, maximize: bool = False) -> tuple[np.ndarray, np.ndarray]:
    cost = np.asarray(cost_matrix, dtype=np.float32)
    if maximize:
        row_ind, col_ind = linear_sum_assignment(1.0 - cost)
        return row_ind, col_ind
    row_ind, col_ind = linear_sum_assignment(cost)
    return row_ind, col_ind
