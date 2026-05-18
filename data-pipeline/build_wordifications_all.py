#!/usr/bin/env python3
"""Unified entry point for the three wordifications variants.

Closes #444 P1 item 3.4 by giving callers one command instead of
three:

    python -m data_pipeline.build_wordifications_all \\
        --variant {v4plus,v6plus,v7v11,all}

Internally dispatches to the existing per-variant modules
(``build_wordifications_v4plus``, ``build_wordifications_v6plus``,
``build_wordifications_v7v11``) so the recipe-building logic itself
is not touched. A future cycle can pull the shared scaffolding out
into a common helper and collapse the three variants into one
parametrised builder.

Recipes by variant:
- v4plus  → V4, V5, V10
- v6plus  → V6, V8, V9, V12
- v7v11   → V7, V11
- all     → run all three in sequence
"""
from __future__ import annotations

import argparse
import importlib
import sys

VARIANT_MODULES = {
    "v4plus": "build_wordifications_v4plus",
    "v6plus": "build_wordifications_v6plus",
    "v7v11": "build_wordifications_v7v11",
}


def run(variant: str) -> int:
    if variant not in VARIANT_MODULES:
        print(f"error: unknown variant '{variant}'", file=sys.stderr)
        return 2
    module_name = VARIANT_MODULES[variant]
    module = importlib.import_module(module_name)
    if not hasattr(module, "main"):
        print(f"error: {module_name} has no main()", file=sys.stderr)
        return 2
    print(f"--- running {module_name}.main() ---")
    rc = module.main()
    return rc if isinstance(rc, int) else 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run one or all wordifications variants. Each variant emits a "
            "subset of the V1..V12 recipe family; together they cover the "
            "full grid the framework's canonical fits select from."
        ),
    )
    parser.add_argument(
        "--variant",
        choices=list(VARIANT_MODULES.keys()) + ["all"],
        default="all",
        help="Which variant module to invoke. 'all' runs every variant.",
    )
    args = parser.parse_args()

    if args.variant == "all":
        for v in VARIANT_MODULES:
            rc = run(v)
            if rc != 0:
                print(f"variant '{v}' returned {rc}; aborting", file=sys.stderr)
                return rc
        return 0
    return run(args.variant)


if __name__ == "__main__":
    raise SystemExit(main())
