"""MLflow logging helper for the CAOS_LDA_HSI builders.

Builders import this module's `mlflow_run` context manager. It points
MLflow's tracking URI at `data/local/mlruns/` (gitignored) and tags
every run with the builder name, the scene_id when relevant, and
records:

- params: K, recipe, scheme, Q, alpha, eta, seeds, etc.
- metrics: perplexity, NPMI / c_v / u_mass coherence, ARI vs label,
  matched-cosine stability, downstream R^2 / F1, etc.
- artifacts: the generated derived JSON itself

If MLflow is not available the context manager is a no-op so existing
builders that don't import this stay backwards-compatible.
"""
from __future__ import annotations

import contextlib
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


@contextlib.contextmanager
def mlflow_run(
    builder_name: str,
    scene_id: str | None = None,
    params: dict[str, Any] | None = None,
    tags: dict[str, str] | None = None,
):
    """Context manager that wraps a builder run with MLflow tracking.

    Usage:
        from _mlflow_helper import mlflow_run
        with mlflow_run("build_topic_views", scene_id="indian-pines-corrected",
                        params={"K": 12, "recipe": "V1", "Q": 12}) as run:
            ...
            run.log_metric("perplexity", 124.7)
            run.log_metric("c_v", 0.342)
            run.log_artifact(out_path)
    """
    try:
        import mlflow  # type: ignore
    except Exception:
        # Stub when mlflow not available
        class _StubRun:
            def log_param(self, *a, **kw): pass
            def log_metric(self, *a, **kw): pass
            def log_artifact(self, *a, **kw): pass
            def set_tag(self, *a, **kw): pass
        yield _StubRun()
        return

    tracking_uri = os.environ.get("MLFLOW_TRACKING_URI") or f"file:{ROOT / 'data' / 'local' / 'mlruns'}"
    mlflow.set_tracking_uri(tracking_uri)
    experiment_name = os.environ.get("MLFLOW_EXPERIMENT") or "caos-lda-hsi"
    mlflow.set_experiment(experiment_name)

    run_name = f"{builder_name}/{scene_id}" if scene_id else builder_name
    with mlflow.start_run(run_name=run_name) as active_run:
        active_run.set_tag = lambda k, v: mlflow.set_tag(k, v)  # type: ignore
        active_run.log_param = lambda k, v: mlflow.log_param(k, v)  # type: ignore
        active_run.log_metric = lambda k, v, **kw: mlflow.log_metric(k, v, **kw)  # type: ignore
        active_run.log_artifact = lambda p, **kw: mlflow.log_artifact(p, **kw)  # type: ignore

        mlflow.set_tag("builder", builder_name)
        if scene_id is not None:
            mlflow.set_tag("scene_id", scene_id)
        if tags:
            for k, v in tags.items():
                mlflow.set_tag(k, str(v))
        if params:
            for k, v in params.items():
                if isinstance(v, (int, float, str, bool)):
                    mlflow.log_param(k, v)
                else:
                    mlflow.log_param(k, str(v))
        yield active_run
