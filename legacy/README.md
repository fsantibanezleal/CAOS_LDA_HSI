# Legacy Material

This folder contains historical reference material used during the early
exploration of LDA-style modelling for hyperspectral data.

The files here are preserved because they capture the origin of the
methodological ideas, but they are not treated as production assets.

## Contents

- `notebooks/`: exploratory notebooks kept as technical memory
- `papers/`: reference paper sources and extracted text snapshots

## Hygiene Rules

- Notebook outputs must remain cleared before commit.
- Machine-specific paths and transient local artifacts should not be
  reintroduced.
- Legacy code may stay exploratory, but visible text, comments, and
  headings should remain readable and professional.
- The authoritative implementation should eventually live outside
  `legacy/`, in the main application and pipeline folders.
