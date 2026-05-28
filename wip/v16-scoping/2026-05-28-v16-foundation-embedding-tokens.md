# V16 — Foundation-Model Spectral Embedding Tokens (#674)

**Status**: scoping doc, 2026-05-28.
**Tracks**: #674.
**Risk**: HIGH (novelty bet), MEDIUM-HIGH (compute), LOW-MEDIUM (integration).
**Decision**: proceed with HyperSIGMA path, park HyperspectralMAE
until upstream public weights confirmed.

## Goal

Build a V16 wordification that uses a frozen pretrained foundation
model to embed each labelled pixel spectrum into a learnt latent
space, then quantises that embedding into LDA-compatible tokens via
either product-quantisation (PQ-like V11) or vector-quantisation
(VQ-VAE-like V13). The result is a recipe whose vocabulary is
**learnt from 450K hyperspectral images** rather than from the
single scene the LDA is being fit on.

The thesis is that the foundation-model basis carries information
about both (a) atmospheric and sensor noise patterns it has already
learnt to discount and (b) class-discriminative spectral signatures
that show up across thousands of scenes. Under that thesis V16
should hit a higher F-7 NMI ceiling than V20 (current best
label-aware recipe) on the labelled scenes.

## Foundation model selection

### HyperSIGMA (selected, primary path)

- **Paper**: arXiv:2406.11519. TPAMI'25.
- **Code + weights**: https://github.com/WHU-Sigma/HyperSIGMA
- **Architecture**: Vision Transformer with Sparse Sampling Attention
  (SSA) + spectral-enhancement module. Spatial + spectral branches.
- **Pre-training data**: HyperGlobal-450K (450K hyperspectral images).
- **Output**: per-pixel embedding of dimension D_emb (model-config
  dependent, typically 768 or 1024 for ViT-base).
- **License**: see repo, likely permissive for research; verify
  before any redistribution.

### HyperspectralMAE (parked, secondary)

- **Reference**: arXiv:2505.05710 (cited in #674 body).
- **Status as of 2026-05-28**: no confirmed public weights / repo
  found via web search. Park until upstream confirms availability.
- **Fallback**: if HyperSIGMA proves brittle, try SpectralEarth
  (arXiv:2408.08447) which is the only other large-scale HSI
  foundation model with confirmed public pretraining.

## Pipeline shape

```
labelled pixels per scene (D × B)
        ↓ HyperSIGMA inference (frozen, no fine-tuning)
embeddings (D × D_emb)
        ↓ quantise per pixel (one of three options below)
tokens
        ↓ LDA / HDP / ProdLDA / ETM as in the rest of the V-sweep
F-axis values
```

Three quantisation paths to consider:

| Path | Codebook | Tokens per pixel | Vocab | Theoretical fit |
|---|---|---|---|---|
| V16-A: PQ | offline PQ ($M=4$ sub-vectors, $K=64$) | 4 | 256 | V11-style. Cheapest. |
| V16-B: VQ-VAE | trained on 6-scene corpus, $K=128$ | 1 | 128 | V13-style. Codebook learns scene-specific clusters. |
| V16-C: cluster | k-means on the 6-scene embeddings, $k=200$ | 1 | 200 | Cheapest learnt-codebook. |

Recommendation: **start with V16-A (PQ)** because it has the closest
analogue in the existing V-sweep (V11) — easy to verify the recipe
mechanics are correct on a small scene before scaling. Then add
V16-B once V16-A's c_v lands in the expected range.

## Compute estimate

| Step | Time per scene | Total (6 scenes) |
|---|---|---|
| Embed labelled pixels (~1.5K-30K per scene) | 1-5 min on T4 GPU | ~15 min |
| Fit PQ codebook | 30-60 s on CPU | ~3 min |
| Encode pixels → tokens | <10 s | <1 min |
| Fit LDA + compute F-2 + F-7 | per cell ~30 s | ~3 min |
| **Total V16-A** | | **~20 min on a T4** |

Hetzner-side: VPS is CPU-only; would need either a Colab notebook
or local GPU (Felipe's machine has none reported in the repo).

**Decision branch**:
- If a GPU box is available → run V16-A end-to-end this cycle.
- If not → write the recipe code only, mark it `hasSweepArtefacts:
  false` in the catalog, and ship the recipe as a "code-ready,
  awaits-GPU" tile in the workspace UI.

## Code layout

- `data-pipeline/build_wordifications_v16.py` — main builder, with
  `--codebook {pq,vqvae,kmeans}` flag.
- `data-pipeline/_hypersigma_loader.py` — model loading helper.
  Clone the HyperSIGMA repo as a git submodule under
  `third_party/HyperSIGMA/`; load weights via `torch.load` from the
  released checkpoint.
- `requirements.txt` — add `timm`, `einops` (HyperSIGMA deps).
  Do **not** add the HyperSIGMA repo as a pip dep; vendor.

## Risks

1. **Weight checkpoint size**: TPAMI'25 weights are likely
   400 MB-1.5 GB. Bandwidth + git LFS implications.
2. **Reproducibility on Hetzner**: VPS has no GPU. V16 artefacts
   would need to be built on a different machine and then copied
   to the VPS as derived JSON. Document the workflow in the
   deployment doc.
3. **Licence**: confirm the HyperSIGMA repo licence allows research
   redistribution before vendoring.
4. **Empirical ceiling**: V20's F-7 NMI ceiling is already ~0.52
   mean; if V16 fails to exceed this, the novelty claim weakens.
   But the paper-worthiness is "LDA-on-foundation-embeddings,
   first time on HSI" — even a 0.50 result is publishable.

## Next-cycle action

- [ ] Clone HyperSIGMA repo to a sandbox dir.
- [ ] Run their pretrained model on a single Indian Pines pixel
      batch to confirm forward-pass works on CPU (acceptable
      for first 1K pixels; full scene needs GPU).
- [ ] Build `_hypersigma_loader.py` with a stable API.
- [ ] Build `build_wordifications_v16.py` with PQ codebook path.
- [ ] Wire V16 into the catalog as `hasSweepArtefacts: false` until
      the F-2/F-7 cells land.

## References

- HyperSIGMA: https://github.com/WHU-Sigma/HyperSIGMA
- HyperSIGMA paper: https://arxiv.org/abs/2406.11519
- SpectralEarth (alternative): https://arxiv.org/html/2408.08447v2
- V11 (PQ-similar architecture, already in repo): see
  `data-pipeline/build_wordifications_v11.py`.
- V13 (VQ-VAE, code reusable for V16-B): see
  `data-pipeline/build_wordifications_v13.py`.
