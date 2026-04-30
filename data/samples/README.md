# Sample Data

This folder is reserved for compact local assets that are safe to keep in
Git and useful for deterministic demos.

Current strategy:

- keep public dataset references in `data/manifests/`
- keep synthetic didactic demo assets in `data/demo/`
- keep derived HSI / MSI scene summaries in `data/derived/`
- avoid committing large raw third-party HSI / MSI files even when they
  are publicly downloadable
