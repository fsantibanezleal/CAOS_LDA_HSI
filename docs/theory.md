# Theory

## Core Hypothesis

The standard habit of searching for one representative spectrum is often
too restrictive. A sample does not speak through one perfect signature.
It speaks through a population of related spectra with internal
variability.

This project therefore treats spectral data more like text:

- one spectrum, one patch population, or one local support becomes a
  document
- quantized values become words
- a collection of spectra becomes a corpus
- latent topic mixtures summarize recurring spectral regimes

## Why LDA Is Relevant

LDA assumes that each document is associated with a mixture of latent
topics, and each topic is a distribution over words. Once spectra are
encoded as tokens, this assumption becomes useful for MSI / HSI data:

- one document can combine multiple coexisting physical regimes
- topics can isolate recurring spectral structures without forcing one
  pure endmember per document
- topic mixtures offer a lower-dimensional and often more stable space
  for comparison and inference

## Why Document Design Matters

The topic model only sees the document-term representation given to it.
For HSI / MSI data, the critical design question is therefore not merely
"which model should be used?" but also:

- what is a document?
- what is a word?
- what structure must remain visible after quantization?

The three representations in this repo exist precisely to probe those
choices.

## Topics Are Not Pure Materials

In this project, a topic should not be read as a declaration that a
single pure mineral or pure vegetation type was discovered. A topic is a
distribution over recurring token patterns. That is a better fit when:

- mixtures dominate the measurement
- acquisition conditions vary across the sample
- local heterogeneity is scientifically meaningful
- the practical goal is robust inference, not only endmember purity

This is one reason topic models and PM-LDA-like ideas are relevant to
spectral variability: they offer a probabilistic language for regimes,
co-occurrence, and soft assignment.

## Application Tracks

The current app and roadmap emphasize four application tracks:

- exploratory organization of spectral populations into latent regimes
- topic-aware regression or classification through mixture features
- topic-routed local models for segregated inference
- retrieval and comparison in topic space when raw spectra are hard to
  align directly

## Limits and Open Questions

- Quantization is necessary for classical LDA, but it can discard
  information if the alphabet is too coarse.
- Classical LDA ignores order inside a document, so any spatial or
  spectral ordering must be injected through the document design itself.
- Topic stability should be checked, not assumed.
- Real mineral or laboratory workflows still need careful validation to
  show when topic structure captures process-relevant variability rather
  than acquisition artifacts.
