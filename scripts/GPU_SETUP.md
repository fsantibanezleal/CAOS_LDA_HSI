# GPU acceleration for the data pipeline

The data-pipeline contains five PyTorch-based builders that train deep
representations and neural topic models on the labelled hyperspectral
scenes. On CPU these are the slowest builders in the project; on a
modern CUDA GPU each fit drops from ~30 minutes to ~30 seconds (~50–
200x speedup measured on an RTX 4070 Laptop, 8 GB VRAM, CUDA 12.6).

This page documents:

- Which builders auto-detect and use GPU when available
- How to install CUDA-enabled PyTorch into `.venv-pipeline`
- How to run individual builders with explicit fallback to CPU
- What the script produces if no GPU is present
- Known caveats around GPU vs CPU determinism

## 1. GPU-aware builders

Every torch-based fit in the data pipeline uses

```python
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
```

and moves both tensors and models to that device. If CUDA is not
available the builder transparently falls back to CPU with no extra
configuration. The five GPU-aware builders are:

| Builder | Methods | Typical CPU vs GPU per scene |
|---|---|---|
| `data-pipeline/build_representations.py` | cae_1d, cae_2d, cae_3d (anchor + full-patch), beta_vae | 5–30 min vs 5–30 s |
| `data-pipeline/build_deep_seed_stability.py` | cae_1d, cae_2d, cae_3d, beta_vae × N seeds | N × (5–30 min) vs N × (5–30 s) |
| `data-pipeline/build_deep_anomaly.py` | cae_1d + beta_vae per-document reconstruction error | 5–10 min vs 5–10 s |
| `data-pipeline/build_neural_topic_models.py` | ProdLDA (pyro) | 5–30 min vs 5–30 s per (K × scene) cell |
| `data-pipeline/build_topic_routed_deep_gate.py` | (consumes precomputed deep latents — no GPU work itself) | n/a |

Builders that are inherently CPU-only and **do not benefit from a GPU**:

- `gensim_vb`, `gensim_multicore` (Gensim has no CUDA backend)
- `tomotopy_lda`, `tomotopy_hdp`, `tomotopy_ctm`, `dmr_lda_hidsag`
  (tomotopy is C++ Gibbs sampler, no CUDA)
- `sklearn_online`, `sklearn_sparse`, `nmf` (sklearn implementations)
- `dense_ae` (`MLPRegressor` from sklearn)
- `pca_K`, `nmf_K`, `ica_K` (sklearn decomposition)
- All Bayesian builders that use the default `pm.sample` (PyMC NUTS in
  C compiled mode). These can be ported to JAX/NumPyro for GPU but
  this is a separate cycle.

If your machine has no GPU, only the LDA-family training and the
classical sklearn baselines will run at full speed; the deep methods
will be 50–200x slower but still work end-to-end.

## 2. Installing CUDA PyTorch

The default `requirements.txt` install pulls the CPU-only PyTorch
build (`torch==2.11.0+cpu`) so the pipeline stays portable on
machines without a GPU.

To switch the same `.venv-pipeline` to a CUDA build:

### Prerequisites

- An NVIDIA GPU (Pascal architecture or newer; this project tested on
  Turing / Ada Lovelace consumer cards)
- Recent NVIDIA driver (≥ 545 covers all current PyTorch CUDA builds)
- 5 GB free disk space (the CUDA wheel is ~2.6 GB)

Verify your driver and CUDA version:

```bash
nvidia-smi
```

Look for `CUDA Version: 12.x` in the top-right of the output. Any
12.x driver works with all PyTorch `cu12*` wheels (CUDA is backward-
compatible at the driver level).

### Install command

From the project root:

```powershell
# Windows PowerShell
.venv-pipeline\Scripts\pip.exe uninstall torch torchvision torchaudio -y
.venv-pipeline\Scripts\pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cu126
```

```bash
# bash / WSL / Linux
.venv-pipeline/bin/pip uninstall torch torchvision torchaudio -y
.venv-pipeline/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
```

Notes:

- Pin torch version explicitly (e.g. `torch==2.11.0`) if you want
  to match this project's tested baseline; otherwise pip will
  resolve to the latest CUDA build.
- For older drivers (CUDA 11.x) substitute `cu118` for `cu126` in
  the index URL.
- The CPU-only build can be reinstalled at any time via
  `pip install torch --index-url https://download.pytorch.org/whl/cpu`.

### Sanity check

```bash
.venv-pipeline/Scripts/python.exe -c "
import torch
print('torch:', torch.__version__)
print('CUDA available:', torch.cuda.is_available())
if torch.cuda.is_available():
    print('device 0:', torch.cuda.get_device_name(0))
"
```

Expected output on a successful CUDA install:

```
torch: 2.11.0+cu126
CUDA available: True
device 0: NVIDIA GeForce RTX 4070 Laptop GPU
```

## 3. Running the GPU-aware builders

All builders take the same env-var filters whether running on CPU or
GPU. Examples:

```bash
# Single method, single scene
CAOS_REPR_FILTER="cae_3d_full_8" \
CAOS_SCENES_FILTER="indian-pines-corrected" \
  .venv-pipeline/Scripts/python.exe data-pipeline/build_representations.py

# Full K-curve across all 6 labelled scenes
CAOS_REPR_FILTER="cae_3d_full_4,cae_3d_full_8,cae_3d_full_16,cae_3d_full_32" \
  .venv-pipeline/Scripts/python.exe data-pipeline/build_representations.py

# Deep seed stability with extended seed budget
CAOS_DEEP_SEED_METHOD="cae_1d_8" \
CAOS_DEEP_SEED_N=30 \
  .venv-pipeline/Scripts/python.exe data-pipeline/build_deep_seed_stability.py
```

### Force CPU on a CUDA-enabled machine

If you want to compare CPU vs GPU runtimes on the same machine, set
`CUDA_VISIBLE_DEVICES=""` to hide the GPU from the process:

```bash
CUDA_VISIBLE_DEVICES="" \
  .venv-pipeline/Scripts/python.exe data-pipeline/build_representations.py
```

PyTorch will see no CUDA device and fall back to CPU.

## 4. What if I do not have a GPU?

The pipeline is fully runnable on CPU. The flag `torch.cuda.is_available()`
is `False`, the device-detection code path returns `cpu`, and every
fit runs on whichever cores are available.

Time impact, measured on the 6-labelled-scene benchmark:

- `cae_3d_full` K=8 single scene: **~30 min CPU** vs **~30 s GPU**
- `cae_3d_full` K=32 single scene: **~60 min CPU** vs **~30 s GPU**
- ProdLDA single (K, scene) cell: **~10 min CPU** vs **~30 s GPU**

If you only have CPU and only need a quick demo, run a smaller subset:

```bash
# CPU-friendly: only the lightest deep method, one scene
CAOS_REPR_FILTER="cae_1d_8" \
CAOS_SCENES_FILTER="salinas-a-corrected" \
  .venv-pipeline/Scripts/python.exe data-pipeline/build_representations.py
```

This completes in ~5 minutes on a modern laptop CPU.

## 5. GPU vs CPU determinism

PyTorch with the same seed produces **deterministic results within
the same device class**, but **CPU and GPU runs of the same fit
will not be byte-identical** because:

- cuDNN convolution algorithms reorder floating-point sums for
  parallelism, producing slightly different numerics than the CPU
  reference path
- `torch.use_deterministic_algorithms(True)` can pin GPU determinism
  but disables some optimised kernels and slows training noticeably

Empirical comparison from this project (cae_3d_full K=8 across 6
labelled scenes):

| Scene | CPU ARI | GPU ARI | Δ |
|---|---|---|---|
| Indian Pines | +0.296 | +0.304 | +0.008 |
| Salinas | +0.399 | +0.409 | +0.010 |
| Salinas-A | +0.438 | +0.432 | -0.006 |
| Pavia U | +0.402 | +0.402 | 0.000 |
| KSC | +0.214 | +0.209 | -0.005 |
| Botswana | +0.401 | +0.409 | +0.008 |

All differences are within ±0.010 ARI — **well below the per-seed
variance** measured in cycles 23–37 (`build_deep_seed_stability`,
σ ≈ 0.05). The methodological conclusions of the project do not
change between CPU and GPU runs.

For full reproducibility within a single device class (CPU-on-CPU or
GPU-on-GPU), the `RANDOM_STATE = 42` seed pinned in every builder is
sufficient.

## 6. Switching back to CPU torch

If you need to revert (e.g. running on a machine without an NVIDIA
GPU after testing on one that does):

```bash
.venv-pipeline/Scripts/pip.exe uninstall torch torchvision -y
.venv-pipeline/Scripts/pip.exe install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

The same `requirements.txt` line produces a CPU-only environment by
default; explicit indexing is only needed when targeting a specific
CUDA backend.

## 7. References

- [PyTorch official install matrix](https://pytorch.org/get-started/locally/)
- [NVIDIA driver compatibility](https://docs.nvidia.com/deploy/cuda-compatibility/)
- [PyTorch CUDA backward compatibility](https://pytorch.org/docs/stable/notes/cuda.html)
- Internal: see `data-pipeline/build_representations.py` `_torch_device()`
  helper for the auto-detection pattern used across all five GPU-aware
  builders.
