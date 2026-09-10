# Changelog

All notable changes to this product. Format: `X.XX.XXX` (display, see the workspace `versioning.md`); stays `0.x` while pre-1.0. Tag every release.

## [0.02.000] · 2026-07-30

### Fixed
- **Version coherence.** Every version source in this repo now declares the same number. They had drifted
  apart (0.01.000), which `conventions/versioning.md` forbids: `VERSION`, the manifests, the CHANGELOG and the
  git tag are required to move together on every release.
- A line-wide sweep on 2026-07-30 found 79 tags across 9 CAOS repos pointing at commits declaring a
  different version, plus 13 repos whose working tree was internally incoherent. The cause is one habit: a
  release gets merged, tagged and deployed while the version files stay where they were. The cost is not
  cosmetic, since a product footer reads its version from a manifest, so a deployed app reported a version
  older than the release it was running.
- This is a MINOR bump rather than a patch: it puts the whole repo onto one clean number regardless of
  development stage, so the numbering is in order from here rather than carrying the drift forward.
- Historical tags are left untouched. A published tag is the accurate record of a release that happened, so
  drift is fixed by moving the files forward, never by rewriting or deleting a tag.
- Guarded going forward by `tools/version-audit/check_version_coherence.py` in CAOS_MANAGE.

## [0.01.000] · 2026-07-03

### Added
- Adopt the `X.XX.XXX` versioning scheme: a `VERSION` file as the single source of truth, this `CHANGELOG`, and the first git tag. Baseline documenting the current shipped state; later changes are versioned by nature (major/minor/patch).
