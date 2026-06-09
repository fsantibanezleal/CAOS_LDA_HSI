import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowRight } from "lucide-react";

import { Equation } from "@/components/Equation";
import { Figure } from "@/components/Figure";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";
import { RecipeSchematicsGrid } from "@/components/methodology/RecipeSchematics";
import { cn } from "@/lib/cn";

type MethodFamily = "topic" | "neural-topic" | "compression" | "deep" | "unmixing";

type MethodEntry = {
  id: string;
  family: MethodFamily;
  equations: string[];
};

const FAMILY_COLOR: Record<MethodFamily, string> = {
  topic: "rgba(40, 160, 80, 1)",
  "neural-topic": "rgba(34, 197, 94, 1)",
  compression: "rgba(56, 189, 248, 1)",
  deep: "rgba(170, 60, 200, 1)",
  unmixing: "rgba(214, 140, 40, 1)",
};

const METHODS: MethodEntry[] = [
  {
    id: "lda",
    family: "topic",
    equations: [
      "\\theta_d \\sim \\text{Dir}(\\alpha)",
      "z_{d,n} \\sim \\text{Mult}(\\theta_d)",
      "w_{d,n} \\sim \\text{Mult}(\\phi_{z_{d,n}})",
    ],
  },
  {
    id: "lda_tomo",
    family: "topic",
    equations: [
      "p(z_i = k \\mid z_{-i}, w) \\propto \\frac{n^{(d)}_{k,-i} + \\alpha}{\\sum_{k'} n^{(d)}_{k',-i} + K\\alpha} \\cdot \\frac{n^{(w)}_{k,-i} + \\eta}{\\sum_{w'} n^{(w')}_{k,-i} + V\\eta}",
    ],
  },
  {
    id: "lda_sparse",
    family: "topic",
    equations: ["\\theta_d \\sim \\text{Dir}(\\alpha)\\quad \\text{with } \\alpha \\ll 1"],
  },
  {
    id: "hdp",
    family: "topic",
    equations: [
      "G_0 \\sim \\text{DP}(\\gamma, H)",
      "G_d \\sim \\text{DP}(\\alpha_0, G_0)",
      "\\theta_{d,n} \\sim G_d, \\quad w_{d,n} \\sim F(\\theta_{d,n})",
    ],
  },
  {
    id: "ctm",
    family: "topic",
    equations: [
      "\\eta_d \\sim \\mathcal{N}(\\mu, \\Sigma)",
      "\\theta_d = \\text{softmax}(\\eta_d)",
      "w_{d,n} \\sim \\text{Mult}(\\phi_{z_{d,n}}),\\ z_{d,n} \\sim \\text{Mult}(\\theta_d)",
    ],
  },
  {
    id: "prodlda",
    family: "neural-topic",
    equations: [
      "q_\\phi(z \\mid w) = \\text{softmax}(\\text{MLP}_\\phi(w))",
      "p_\\theta(w \\mid z) = \\text{softmax}(\\beta^\\top z)",
      "\\mathcal{L} = \\mathbb{E}_q[\\log p_\\theta(w \\mid z)] - \\text{KL}(q_\\phi \\| p)",
    ],
  },
  {
    id: "etm",
    family: "neural-topic",
    equations: [
      "\\beta_k = \\text{softmax}(\\rho^\\top \\alpha_k) \\in \\Delta^{V-1}",
      "q_\\phi(\\theta \\mid w) = \\mathcal{N}(\\mu_\\phi(w), \\Sigma_\\phi(w))",
      "p(w \\mid \\theta, \\rho, \\alpha) = \\sum_k \\theta_k\\, \\beta_k = \\beta\\theta",
    ],
  },
  {
    id: "nmf",
    family: "compression",
    equations: [
      "X \\approx W H, \\quad W \\geq 0,\\ H \\geq 0",
      "D_{KL}(X \\| WH) = \\sum_{ij} X_{ij} \\log\\frac{X_{ij}}{(WH)_{ij}} - X_{ij} + (WH)_{ij}",
    ],
  },
  {
    id: "pca",
    family: "compression",
    equations: [
      "C = \\frac{1}{N} X^\\top X",
      "C v_k = \\lambda_k v_k,\\quad v_k \\in \\mathbb{R}^V",
      "z_d = V_{:K}^\\top x_d",
    ],
  },
  {
    id: "ica",
    family: "compression",
    equations: [
      "x = A s,\\quad s \\sim \\text{non-Gaussian, independent}",
      "\\max_W |\\mathbb{E}[G(W^\\top x)] - \\mathbb{E}[G(\\nu)]|",
    ],
  },
  {
    id: "dense_ae",
    family: "compression",
    equations: [
      "z = \\sigma(W_2 \\sigma(W_1 x + b_1) + b_2)",
      "\\hat x = \\sigma(W_4 \\sigma(W_3 z + b_3) + b_4)",
      "\\mathcal{L} = \\|x - \\hat x\\|_2^2",
    ],
  },
  {
    id: "cae_1d",
    family: "deep",
    equations: [
      "z = \\text{Conv1D}_{\\text{enc}}(x) \\in \\mathbb{R}^K",
      "\\hat x = \\text{ConvTranspose1D}_{\\text{dec}}(z)",
      "\\mathcal{L} = \\|x - \\hat x\\|_2^2",
    ],
  },
  {
    id: "cae_2d",
    family: "deep",
    equations: [
      "x_p \\in \\mathbb{R}^{B \\times P \\times P},\\ P = 7",
      "z = \\text{Conv2D}_{\\text{enc}}(x_p)[\\text{centre pixel}]",
    ],
  },
  {
    id: "cae_3d",
    family: "deep",
    equations: [
      "x_p \\in \\mathbb{R}^{B \\times P \\times P},\\ P = 7",
      "z = \\text{Conv3D}_{\\text{enc}}(x_p)[\\text{centre}]",
    ],
  },
  {
    id: "cae_3d_full",
    family: "deep",
    equations: [
      "z = \\text{Conv3D}_{\\text{enc}}(x_p)",
      "\\mathcal{L} = \\frac{1}{P^2}\\sum_{i,j} \\|x_p[:,i,j] - \\hat x_p[:,i,j]\\|_2^2",
    ],
  },
  {
    id: "beta_vae",
    family: "deep",
    equations: [
      "q_\\phi(z \\mid x) = \\mathcal{N}(\\mu_\\phi(x), \\sigma_\\phi^2(x))",
      "\\mathcal{L} = \\mathbb{E}_q[\\log p(x \\mid z)] - \\beta \\cdot \\text{KL}(q_\\phi \\| \\mathcal{N}(0, I))",
    ],
  },
  {
    id: "endmember",
    family: "unmixing",
    equations: [
      "E^* = \\arg\\max_{\\{e_1,\\dots,e_K\\}} |\\det[e_1 - e_0, \\dots, e_K - e_0]|",
      "\\alpha_p = \\arg\\min_{\\alpha \\geq 0,\\ \\mathbf{1}^\\top \\alpha = 1} \\|x_p - E\\alpha\\|_2^2",
    ],
  },
];

export default function MethodologyRepresentations() {
  const { t } = useTranslation(["pages"]);
  const [selectedId, setSelectedId] = useState<string>(METHODS[0]!.id);
  const selected = METHODS.find((m) => m.id === selectedId) ?? METHODS[0]!;

  return (
    <PageShell
      title={t("pages:methodology_representations.title")}
      lead={t("pages:methodology_representations.lead")}
    >
      <MethodNav methods={METHODS} selectedId={selectedId} onSelect={setSelectedId} t={t} />
      <MethodDetail entry={selected} t={t} />

      <Section
        id="recipes"
        title={t("pages:methodology_representations.recipes_title")}
      >
        <p className="mb-3 text-[14px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
          {t("pages:methodology_representations.recipes_lead")}
        </p>

        <div
          className="mb-4 rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          style={{
            borderColor: "var(--color-accent)",
            backgroundColor: "var(--color-accent-soft)",
          }}
        >
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {t("pages:methodology_representations.recipes_deepdive_lead")}
          </p>
          <Link
            to="/workspace/methods"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold"
            style={{ backgroundColor: "var(--color-accent)", color: "var(--color-bg)" }}
          >
            {t("pages:methodology_representations.recipes_deepdive_cta")}
            <ArrowRight size={14} />
          </Link>
        </div>

        <h3
          className="text-[13px] uppercase tracking-widest font-semibold mt-2 mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Per-recipe schematics
        </h3>
        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          Each card sketches a single recipe's tokenization. These are
          conceptual — actual implementations operate on the full
          B-band spectrum, with binning controlled by scheme ∈ &#123;U,Q,L&#125;
          and Q ∈ &#123;8,16,32&#125;.
        </p>
        <RecipeSchematicsGrid />

        <h3
          className="text-[13px] uppercase tracking-widest font-semibold mt-6 mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Token-construction formulas
        </h3>
        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          For a pixel spectrum{" "}
          <Equation tex="x \in \mathbb{R}^B" />, each recipe defines a map
          to a multiset of tokens drawn from a vocabulary{" "}
          <Equation tex="\mathcal{V}" />. The LDA model treats those
          multisets as documents. The nineteen built recipes (V1..V15,
          V17..V20; V16 reserved for foundation-model embeddings) differ
          in (a) which feature of <em>x</em> becomes the token alphabet,
          (b) how continuous values are quantised, and (c) whether the
          vocabulary is fixed, learnt unsupervised, or label-aware.
        </p>
        <div className="overflow-x-auto mt-3">
          <table
            className="w-full text-[13px] border-collapse"
            style={{ borderColor: "var(--color-border)" }}
          >
            <thead style={{ backgroundColor: "var(--color-panel)" }}>
              <tr>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>
                  Recipe
                </th>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>
                  Token alphabet
                </th>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>
                  Construction
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V1</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(band, q-bin)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  For each band <Equation tex="b \in [1, B]" /> emit one token{" "}
                  <Equation tex="(b, \mathrm{bin}_Q(x_b))" />. Canonical recipe; document length = <em>B</em>.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V2</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>q-bin (band-agnostic)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Drop the band index: token = <Equation tex="\mathrm{bin}_Q(x_b)" /> only. Tests whether band identity matters.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V3</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>joint (band, bin)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Token = <Equation tex="(b, q_b(x))" /> — one token per band naming its quantised bin (vocabulary <Equation tex="B \cdot Q" />).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V4</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>derivative-bin</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Token = <Equation tex="(b, \mathrm{bin}_Q(x'_b))" /> with{" "}
                  <Equation tex="x'_b = x_{b+1} - x_b" /> (first-order diff). Slope-encoded.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V5</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>2nd-derivative</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  V4 with <Equation tex="x''_b = x_{b-1} - 2 x_b + x_{b+1}" /> — curvature-encoded.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V6</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>wavelet</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Db4 DWT level-3 detail coefficients{" "}
                  <Equation tex="\{d^{(j)}_k\}" />, each binned separately. Multi-scale spectral structure.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V7</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>absorption-triplet (Clark-Roush hull)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Compute hull-corrected reflectance{" "}
                  <Equation tex="\tilde{x}_b = x_b / h_b" /> where <em>h</em> is the convex upper hull. Token per absorption feature = (centre band, depth-bin, width-bin).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V8</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>endmember-fraction</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Solve <Equation tex="x = E \alpha, \; \alpha \succeq 0" /> with NFINDR endmembers; emit one token per endmember = (endmember-id, bin(α_i)).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V9</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>region-token (spatial)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Felzenszwalb spatial pre-segmentation; each pixel emits one token (region&nbsp;id, SAM-distance-to-region-mean bin).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V10</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>band-group</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Pre-partition the B bands into G physical groups (VNIR/SWIR-1/SWIR-2/...); token = (group-id, bin(mean of group)).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V11</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>codebook-VQ (PQ)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Product quantisation: split <Equation tex="x \in \mathbb{R}^B" /> into M sub-vectors; each sub-vector mapped to nearest of K codewords. Token = (m, k_m). Yields vocabulary M·K.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V12</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>GMM-token</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Fit a GMM with G components on pixel spectra; soft-assign each pixel to a Gaussian; token = (g, bin(responsibility g)).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V13</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>VQ-VAE codebook</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  PyTorch VQ-VAE with M=4 sub-vectors and K=32 codewords each, trained via straight-through estimator. Vocab = M·K = 128.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V14</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>CWT-Morlet</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Continuous wavelet transform with Morlet mother on 16 log-scales × 8 position buckets; top-16 magnitude cells per pixel.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V15</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>spectral indices</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  NDVI, MNDWI, NBR, NDSI, EVI, SAVI computed per pixel from nearest VNIR/SWIR band approximations; each index value q-binned.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V16</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>foundation embedding (scaffold)</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Frozen HyperSIGMA ViT (billion-parameter, pre-trained on HyperGlobal-450K) embeds each pixel; embedding quantised via PQ / VQ-VAE / k-means. Code-ready; weights not yet vendored.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V17</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>sparse-coding atom</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  sklearn MiniBatchDictionaryLearning over-complete dictionary (K=64 atoms, lasso-LARS, n_nonzero=8). Token = (atom, abundance_bin).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V18</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>graph-Laplacian eigvec</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  Build kNN cosine-affinity graph; extract first K=16 eigenvectors of the sym-normalised Laplacian; bin each eigenvector axis. Token = (eigvec, bin).
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V19</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>UMAP coordinate</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  3D UMAP embedding (n_neighbors=15, min_dist=0.1) per scene; each axis q-binned. 3 tokens per pixel.
                </td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 border font-mono" style={{ borderColor: "var(--color-border)" }}>V20</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>MI-weighted band</td>
                <td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>
                  V1 (band, q-bin) tokens but with per-band copies weighted by mutual information with labels. Bands with high MI emit more copies; near-zero MI bands emit ~none.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3
          className="text-[13px] uppercase tracking-widest font-semibold mt-8 mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Mechanistic deep dive — V14, V18, V20
        </h3>
        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          Three of the seven extension recipes (V14 CWT-Morlet, V18
          graph-Laplacian, V20 mutual-information-weighted) carry the
          headline findings of the V-sweep. The full mathematical
          construction of each follows.
        </p>

        <V20MechanismCard />
        <V18MechanismCard />
        <V14MechanismCard />

        <h3
          className="text-[13px] uppercase tracking-widest font-semibold mt-8 mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Q-schemes (quantisation)
        </h3>
        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          Every recipe above invokes <Equation tex="\mathrm{bin}_Q(\cdot)" />,
          a partition of the real line into Q cells. Three schemes:
        </p>
        <ul className="list-disc list-outside ml-5 space-y-1.5 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
          <li>
            <strong>Uniform (U)</strong>: equal-width bins{" "}
            <Equation tex="(\min(x), \max(x))" />. Cheap, but allocates mass uniformly across the value range — wastes bins on saturated regions.
          </li>
          <li>
            <strong>Quantile (Q)</strong>: empirical-quantile bins so each cell receives 1/Q of the corpus mass. Equalises token frequencies; the variant the project defaults to for V1.
          </li>
          <li>
            <strong>Lloyd-Max (L)</strong>: K-means in 1D over the corpus values — the MSE-optimal Q-level quantiser for the empirical value density (Lloyd 1957 / Max 1960), satisfying the centroid and nearest-neighbour conditions. Its high-resolution distortion follows the Panter-Dite integral ∝ (∫ f<sup>1/3</sup>)³ / (12·Q²), which is ≤ the uniform-quantiser figure Δ²/12 = 1/(12·Q²) (range normalised to 1) — equality only when values are uniform over the range.
          </li>
        </ul>
        <p
          className="mt-3 text-[12.5px] italic"
          style={{ color: "var(--color-fg-faint)" }}
        >
          The {`{V1..V15, V17..V20}`} × {`{U,Q,L}`} × Q∈{`{8,16,32}`}
          cross-product generates 171 candidate vocabularies per scene
          (with V16 reserved for the foundation-model wordification);
          the methodology chooses one per scene by joint validation of
          perplexity, c_v coherence and downstream ARI.
        </p>

        <h3
          className="text-[13px] uppercase tracking-widest font-semibold mt-6 mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Document construction (pixel → corpus)
        </h3>
        <p
          className="mb-3 text-[13px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          A token alphabet defines what a single document's words look
          like. A document still needs a definition. Five constructions
          live in <code>build_groupings.py</code>:
        </p>
        <ul className="list-disc list-outside ml-5 space-y-1.5 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
          <li>
            <strong>Pixel</strong>: one document per labelled pixel. Canonical for labelled-scene benchmarks; document length = B.
          </li>
          <li>
            <strong>SLIC-500 / SLIC-2000</strong>: SLIC superpixels (Achanta et al. 2012) at two target compactness levels; one document per superpixel = bag of tokens over its constituent pixels.
          </li>
          <li>
            <strong>Patch-7 / Patch-15</strong>: fixed-size 7×7 or 15×15 spatial windows; one document per non-overlapping patch.
          </li>
          <li>
            <strong>Felzenszwalb</strong>: graph-based segmentation (Felzenszwalb-Huttenlocher 2004) with edge weights = spectral distance; one document per connected region.
          </li>
        </ul>
        <p
          className="mt-3 text-[12.5px] italic"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Construction × recipe × Q-scheme is the full configuration
          space; the methodology page fixes pixel-V1-Q-Q8 as the canonical
          combination and reports the others as sensitivity / robustness
          analyses (axes F-5, F-7, F-10).
        </p>

        <h3
          className="text-[13px] uppercase tracking-widest font-semibold mt-6 mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Availability grid
        </h3>
        <Figure caption={t("pages:methodology_representations.recipes_figure_caption")}>
          <RecipeGridSVG />
        </Figure>
      </Section>
    </PageShell>
  );
}

function MethodNav({
  methods,
  selectedId,
  onSelect,
  t,
}: {
  methods: MethodEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  t: TFunction<["pages"]>;
}) {
  const families: MethodFamily[] = ["topic", "neural-topic", "compression", "deep", "unmixing"];
  return (
    <nav
      role="tablist"
      aria-label={t("pages:methodology_representations.nav_label")}
      className="sticky top-14 z-20 -mx-6 px-6 py-3 mb-4 border-b"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-bg) 92%, transparent)",
        borderColor: "var(--color-border)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="space-y-1.5">
        {families.map((fam) => {
          const inFamily = methods.filter((m) => m.family === fam);
          if (inFamily.length === 0) return null;
          return (
            <div key={fam} className="flex items-baseline flex-wrap gap-2">
              <span
                className="text-[10px] uppercase tracking-widest font-semibold pr-2 w-44 shrink-0"
                style={{ color: FAMILY_COLOR[fam] }}
              >
                {t(`pages:methodology_representations.families.${fam}`)}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {inFamily.map((m) => {
                  const isActive = selectedId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelect(m.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[12px] transition-all",
                        isActive ? "font-semibold shadow-sm" : "opacity-80 hover:opacity-100",
                      )}
                      style={{
                        borderColor: isActive ? FAMILY_COLOR[fam] : "var(--color-border)",
                        backgroundColor: isActive ? "var(--color-accent-soft)" : "var(--color-panel)",
                        color: isActive ? FAMILY_COLOR[fam] : "var(--color-fg)",
                      }}
                    >
                      {t(`pages:methodology_representations.methods.${m.id}.label`)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function MethodDetail({ entry, t }: { entry: MethodEntry; t: TFunction<["pages"]> }) {
  const principles = t(`pages:methodology_representations.methods.${entry.id}.principles`, { returnObjects: true } as never) as unknown;
  const principlesList: string[] = Array.isArray(principles) ? (principles as string[]) : [];

  return (
    <article
      className="rounded-xl border p-6 mb-8 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div aria-hidden className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: FAMILY_COLOR[entry.family] }} />
      <header className="mb-4 mt-2">
        <div className="text-[10.5px] uppercase tracking-widest font-semibold mb-1" style={{ color: FAMILY_COLOR[entry.family] }}>
          {t(`pages:methodology_representations.families.${entry.family}`)}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: "var(--color-fg)" }}>
          {t(`pages:methodology_representations.methods.${entry.id}.label`)}
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-fg-faint)" }}>
          {t(`pages:methodology_representations.methods.${entry.id}.tag`)}
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <MethodSubsection title={t("pages:methodology_representations.section_theory")} accent={FAMILY_COLOR[entry.family]}>
          {entry.equations.map((eq, i) => (
            <Equation key={i} tex={eq} block />
          ))}
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {t(`pages:methodology_representations.methods.${entry.id}.theory_body`)}
          </p>
        </MethodSubsection>

        <MethodSubsection title={t("pages:methodology_representations.section_principles")} accent={FAMILY_COLOR[entry.family]}>
          <ul className="space-y-1.5 text-[13.5px] leading-relaxed list-disc pl-5" style={{ color: "var(--color-fg-subtle)" }}>
            {principlesList.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </MethodSubsection>

        <MethodSubsection title={t("pages:methodology_representations.section_hypothesis")} accent={FAMILY_COLOR[entry.family]}>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {t(`pages:methodology_representations.methods.${entry.id}.hypothesis`)}
          </p>
        </MethodSubsection>

        <MethodSubsection title={t("pages:methodology_representations.section_findings")} accent={FAMILY_COLOR[entry.family]}>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {t(`pages:methodology_representations.methods.${entry.id}.findings`)}
          </p>
        </MethodSubsection>
      </div>
    </article>
  );
}

function MethodSubsection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-l-2 pl-4" style={{ borderColor: accent }}>
      <h3 className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: accent }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function RecipeGridSVG() {
  const RECIPES = [
    "V1 band-frequency", "V2 intensity-as-word", "V3 joint band-bin", "V4 derivative-bin",
    "V5 2nd-derivative", "V6 wavelet", "V7 absorption-triplet", "V8 endmember-fraction",
    "V9 region-token", "V10 band-group", "V11 codebook-VQ", "V12 GMM-token",
    "V13 VQ-VAE", "V14 CWT-Morlet", "V15 spectral indices", "V16 foundation (scaffold)",
    "V17 sparse-coding", "V18 graph-Laplacian", "V19 UMAP coords", "V20 MI-weighted",
  ];
  const cols = ["U/8", "U/16", "U/32", "Q/8", "Q/16", "Q/32", "L/8", "L/16", "L/32"];
  const cellW = 32;
  const cellH = 22;
  const x0 = 200;
  const y0 = 28;
  return (
    <svg
      width="480"
      height={y0 + RECIPES.length * cellH + 14}
      viewBox={`0 0 480 ${y0 + RECIPES.length * cellH + 14}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Recipe × scheme × Q grid"
      style={{ color: "var(--color-fg)" }}
    >
      <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fill="currentColor">
        {cols.map((c, i) => (
          <text key={c} x={x0 + i * cellW + cellW / 2} y={y0 - 8} textAnchor="middle" opacity="0.7">
            {c}
          </text>
        ))}
        {RECIPES.map((label, ri) => (
          <g key={ri}>
            <text x={x0 - 10} y={y0 + ri * cellH + cellH * 0.65} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize="10.5">
              {label}
            </text>
            {cols.map((_, ci) => (
              <rect
                key={ci}
                x={x0 + ci * cellW}
                y={y0 + ri * cellH + 2}
                width={cellW - 3}
                height={cellH - 5}
                rx="2"
                fill="var(--color-accent)"
                opacity={0.15 + 0.06 * ((ri + ci) % 5)}
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}

function MechanismShell({
  recipe,
  title,
  oneLiner,
  children,
  highlightColor = "var(--color-accent)",
}: {
  recipe: string;
  title: string;
  oneLiner: string;
  children: React.ReactNode;
  highlightColor?: string;
}) {
  return (
    <div
      className="mt-4 mb-6 border rounded-lg p-4 md:p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
      }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="font-mono text-[12px] px-2 py-0.5 rounded"
          style={{
            backgroundColor: highlightColor,
            color: "var(--color-bg)",
          }}
        >
          {recipe}
        </span>
        <h4
          className="text-[14px] font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          {title}
        </h4>
      </div>
      <p
        className="text-[12.5px] italic mb-3"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {oneLiner}
      </p>
      {children}
    </div>
  );
}

function V20MechanismCard() {
  return (
    <MechanismShell
      recipe="V20"
      title="Mutual-information-weighted bands"
      oneLiner="V1 band-frequency tokens, re-emitted per band with multiplicities proportional to the band's discriminative power against labels."
      highlightColor="#9333ea"
    >
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
          <div>
            <strong>Step 1 — Per-band MI estimate.</strong>{" "}
            For each band <Equation tex="b \in [1, B]" />, treat the
            scalar feature <Equation tex="\{x_{d, b}\}_{d=1}^{D}" /> as
            a regressor against the categorical label{" "}
            <Equation tex="y \in \{1, \ldots, C\}" /> using a kNN-based
            estimator (Kraskov 2004):
          </div>
          <div className="py-1">
            <Equation tex="\widehat{I}(x_b; y) = \psi(k) - \langle \psi(n_x + 1) + \psi(n_y + 1)\rangle + \psi(N)" />
          </div>
          <div>
            <strong>Step 2 — Normalise into copy counts.</strong>
          </div>
          <div className="py-1">
            <Equation tex="w_b = \mathrm{round}\!\Big(\tfrac{\widehat{I}(x_b; y)}{\max_{b'} \widehat{I}(x_{b'}; y)} \cdot w_{\max}\Big)" />,{" "}
            <Equation tex="w_{\max} = 8" />
          </div>
          <div>
            <strong>Step 3 — Emit weighted tokens.</strong>{" "}
            Per pixel <em>d</em>, per band <em>b</em>, the V20 multiset
            adds <em>w<sub>b</sub></em> copies of the token{" "}
            <Equation tex="(b, \mathrm{bin}_Q(x_{d, b}))" />:
          </div>
          <div className="py-1">
            <Equation tex="\mathrm{wordify}_{V20}(x_d) = \biguplus_{b=1}^{B} w_b \cdot \{(b, \mathrm{bin}_Q(x_{d, b}))\}" />
          </div>
          <div className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
            Vocabulary <Equation tex="|\mathcal{V}_{V20}| = B \cdot Q" />,
            matching V3. Document length is{" "}
            <Equation tex="\sum_b w_b" />, typically a few × B.
          </div>
        </div>
        <V20MechanismSVG />
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <strong>Empirical signature.</strong> On Indian Pines V20 wins
        F-2 c<sub>v</sub> (0.88) and F-7 NMI (0.44) together; F-1
        macro-F1 is a non-discriminating tie across recipes (~0.86, V2
        nominally highest). Across the LDA Q-sweep V20's F-7 ranking
        inverts from a 0.014 deficit vs V12 at Q=8 to a 0.030 robust
        lead at Q=32. The mechanism: amplifying high-MI bands sharpens
        the LDA topic-word likelihood, while zero-copy bands collapse
        out of the document, reducing topic-mass dilution.
      </p>
    </MechanismShell>
  );
}

function V20MechanismSVG() {
  // Synthetic MI profile across 16 bands — bumps at b=3, 7, 12
  const bands = Array.from({ length: 16 }, (_, b) => b);
  const mi = bands.map((b) => {
    return (
      0.12 +
      0.8 * Math.exp(-((b - 3) ** 2) / 1.2) +
      0.55 * Math.exp(-((b - 7) ** 2) / 1.8) +
      0.4 * Math.exp(-((b - 12) ** 2) / 1.5)
    );
  });
  const maxMI = Math.max(...mi);
  const copies = mi.map((m) => Math.round((m / maxMI) * 8));
  const cellW = 28;
  const baseY = 200;
  return (
    <svg
      viewBox="0 0 480 280"
      width="100%"
      role="img"
      aria-label="V20 mechanism: per-band MI translated to per-band token copies"
      style={{ color: "var(--color-fg)" }}
    >
      <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fill="currentColor">
        <text x="240" y="14" textAnchor="middle" fontSize="11" fontWeight="700">
          V20 — Per-band MI ⇒ per-band copy count
        </text>

        {/* MI curve */}
        <text x="10" y="48" fontSize="10" opacity="0.7">MI(x_b; y)</text>
        <polyline
          fill="none"
          stroke="#9333ea"
          strokeWidth="1.6"
          points={mi
            .map((m, i) => `${30 + i * cellW},${75 - 45 * (m / maxMI)}`)
            .join(" ")}
        />
        {bands.map((b) => (
          <circle
            key={`mi-${b}`}
            cx={30 + b * cellW}
            cy={75 - 45 * ((mi[b] ?? 0) / maxMI)}
            r="2"
            fill="#9333ea"
          />
        ))}

        {/* Arrow */}
        <text x="240" y="100" textAnchor="middle" fontSize="9" opacity="0.6">
          round(MI / max(MI) · 8)
        </text>
        <path
          d="M 235 105 L 235 118 L 230 118 L 240 130 L 250 118 L 245 118 L 245 105 Z"
          fill="#9333ea"
          opacity="0.7"
        />

        {/* Copies bar chart */}
        <text x="10" y="148" fontSize="10" opacity="0.7">copies w_b</text>
        {bands.map((b) => {
          const cb = copies[b] ?? 0;
          const h = cb * 6;
          const x = 30 + b * cellW - 9;
          const isZero = cb === 0;
          return (
            <g key={`bar-${b}`}>
              <rect
                x={x}
                y={baseY - h}
                width="18"
                height={Math.max(h, 1)}
                fill={isZero ? "#cbd5e1" : "#9333ea"}
                opacity={isZero ? 0.4 : 0.85}
              />
              <text
                x={30 + b * cellW}
                y={baseY + 12}
                textAnchor="middle"
                fontSize="9"
                fill={isZero ? "#94a3b8" : "currentColor"}
                fontWeight={isZero ? 400 : 700}
              >
                {cb}
              </text>
              <text
                x={30 + b * cellW}
                y={baseY + 24}
                textAnchor="middle"
                fontSize="8"
                opacity="0.5"
              >
                b{b}
              </text>
            </g>
          );
        })}
        <line x1="20" y1={baseY + 1} x2="470" y2={baseY + 1} stroke="currentColor" strokeWidth="0.5" opacity="0.3" />

        {/* Token emission diagram */}
        <text x="240" y={baseY + 50} textAnchor="middle" fontSize="9.5" fontStyle="italic" opacity="0.7">
          high-MI bands amplify; near-zero-MI bands collapse to zero copies
        </text>
      </g>
    </svg>
  );
}

function V18MechanismCard() {
  return (
    <MechanismShell
      recipe="V18"
      title="Graph-Laplacian eigenvector tokens"
      oneLiner="Build a kNN cosine-affinity graph over pixels, take low-frequency Laplacian eigenvectors as semantic axes, bin each axis to form tokens."
      highlightColor="#0ea5e9"
    >
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
          <div>
            <strong>Step 1 — Affinity graph.</strong> Build a k-nearest-neighbour
            graph (<Equation tex="K = 10" />) over the normalised pixel
            spectra using cosine distance, then symmetrise and convert
            distances to similarities:
          </div>
          <div className="py-1">
            <Equation tex="A_{ij} = \exp(-\|x_i - x_j\|^2 / \sigma^2) \cdot \mathbf{1}[j \in \mathrm{kNN}(i) \cup i \in \mathrm{kNN}(j)]" />
          </div>
          <div>
            <strong>Step 2 — Normalised Laplacian.</strong> Compute the
            symmetric-normalised graph Laplacian:
          </div>
          <div className="py-1">
            <Equation tex="L_{\text{sym}} = I - D^{-1/2} A D^{-1/2}" />,{" "}
            <Equation tex="D = \mathrm{diag}(\sum_j A_{ij})" />
          </div>
          <div>
            <strong>Step 3 — Spectral coordinates.</strong> Extract the
            first <Equation tex="K_e = 16" /> eigenvectors corresponding
            to the smallest eigenvalues (low-frequency modes carry
            manifold structure):
          </div>
          <div className="py-1">
            <Equation tex="L_{\text{sym}} \phi_k = \lambda_k \phi_k,\quad \lambda_1 \le \lambda_2 \le \cdots \le \lambda_{K_e}" />
          </div>
          <div>
            <strong>Step 4 — Per-axis percentile binning.</strong> For each
            pixel <em>d</em> and each eigenvector <em>k</em>, project the
            pixel onto <Equation tex="\phi_k" />, then percentile-bin the
            projection into <em>Q</em> buckets. Emit one token per axis:
          </div>
          <div className="py-1">
            <Equation tex="\mathrm{wordify}_{V18}(x_d) = \big\{(k, \mathrm{bin}_Q(\phi_k(d)))\big\}_{k=1}^{K_e}" />
          </div>
          <div className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
            Vocabulary <Equation tex="|\mathcal{V}_{V18}| = K_e \cdot Q = 128" />;
            document length is exactly <em>K<sub>e</sub></em>.
          </div>
        </div>
        <V18MechanismSVG />
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <strong>Empirical signature.</strong> Highest F-2 c<sub>v</sub>
        on Pavia U among V13..V20 (0.66) and third on F-7 mean (0.43).
        Captures scenes whose labelled classes correspond to connected
        manifold regions (urban land-cover, agricultural fields).
      </p>
    </MechanismShell>
  );
}

function V18MechanismSVG() {
  // Stylised kNN graph + eigenvector projection diagram
  const nodes = [
    { x: 90, y: 90, c: "#0ea5e9" },
    { x: 130, y: 70, c: "#0ea5e9" },
    { x: 110, y: 130, c: "#0ea5e9" },
    { x: 70, y: 130, c: "#0ea5e9" },
    { x: 180, y: 100, c: "#f59e0b" },
    { x: 220, y: 80, c: "#f59e0b" },
    { x: 210, y: 140, c: "#f59e0b" },
    { x: 175, y: 165, c: "#f59e0b" },
    { x: 280, y: 110, c: "#16a34a" },
    { x: 320, y: 90, c: "#16a34a" },
    { x: 310, y: 145, c: "#16a34a" },
  ];
  const edges = [
    [0, 1], [0, 2], [0, 3], [1, 2], [1, 4], [2, 3], [2, 7],
    [4, 5], [4, 6], [4, 7], [5, 6], [6, 7], [6, 8], [8, 9],
    [8, 10], [9, 10],
  ];
  return (
    <svg
      viewBox="0 0 480 280"
      width="100%"
      role="img"
      aria-label="V18 mechanism: kNN graph + Laplacian eigenvector binning"
      style={{ color: "var(--color-fg)" }}
    >
      <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fill="currentColor">
        <text x="240" y="14" textAnchor="middle" fontSize="11" fontWeight="700">
          V18 — kNN graph ⇒ Laplacian spectrum ⇒ binned tokens
        </text>
        <text x="180" y="32" textAnchor="middle" fontSize="9" opacity="0.6">
          (a) kNN cosine graph (3 latent classes)
        </text>

        {edges.map((pair, k) => {
          const [i, j] = pair;
          const ni = nodes[i!];
          const nj = nodes[j!];
          if (!ni || !nj) return null;
          return (
            <line
              key={`e-${k}`}
              x1={ni.x}
              y1={ni.y}
              x2={nj.x}
              y2={nj.y}
              stroke="#cbd5e1"
              strokeWidth="0.8"
            />
          );
        })}
        {nodes.map((n, i) => (
          <circle key={`n-${i}`} cx={n.x} cy={n.y} r="6" fill={n.c} opacity="0.85" />
        ))}

        <text x="380" y="32" textAnchor="middle" fontSize="9" opacity="0.6">
          (b) φ_1 — Fiedler vector
        </text>
        {nodes.map((n, i) => {
          const phi = (i < 4 ? -0.7 : i < 8 ? 0.0 : 0.7) + (i % 3) * 0.06;
          return (
            <rect
              key={`bar-${i}`}
              x={360 + (i % 6) * 18}
              y={60 + Math.floor(i / 6) * 50 - phi * 20}
              width="14"
              height={Math.abs(phi) * 40 + 1}
              fill={n.c}
              opacity="0.7"
            />
          );
        })}

        <line x1="20" y1="200" x2="460" y2="200" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
        <text x="240" y="220" textAnchor="middle" fontSize="9.5" opacity="0.7">
          (c) bin φ_k along Q-percentiles ⇒ token (k, bin) per axis
        </text>

        {[0, 1, 2, 3, 4, 5, 6, 7].map((q) => (
          <g key={`bin-${q}`}>
            <rect
              x={120 + q * 28}
              y={240}
              width="24"
              height="14"
              rx="2"
              fill="#0ea5e9"
              opacity={0.25 + (q === 3 ? 0.6 : 0)}
            />
            <text
              x={132 + q * 28}
              y={251}
              textAnchor="middle"
              fontSize="8"
              fill={q === 3 ? "white" : "currentColor"}
              fontWeight={q === 3 ? 700 : 400}
            >
              q{q}
            </text>
          </g>
        ))}
        <text x="240" y="272" textAnchor="middle" fontSize="9" opacity="0.5">
          ★ pixel d's bin on φ_1
        </text>
      </g>
    </svg>
  );
}

function V14MechanismCard() {
  return (
    <MechanismShell
      recipe="V14"
      title="Continuous-wavelet (Morlet) tokens"
      oneLiner="Decompose each spectrum on the Morlet mother wavelet across log-scales; keep the top-K magnitude cells as (scale, position) tokens."
      highlightColor="#f59e0b"
    >
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
          <div>
            <strong>Step 1 — CWT decomposition.</strong> The continuous
            wavelet transform of a spectrum <em>x</em> at scale{" "}
            <em>s</em> and position <em>τ</em> is:
          </div>
          <div className="py-1">
            <Equation tex="W_x(s, \tau) = \int_{-\infty}^{\infty} x(b) \cdot \tfrac{1}{\sqrt{s}} \psi^* \!\left(\tfrac{b - \tau}{s}\right) db" />
          </div>
          <div className="text-[12px]">
            with <Equation tex="\psi" /> the complex Morlet mother
            wavelet <Equation tex="\psi(t) = \pi^{-1/4} e^{i \omega_0 t} e^{-t^2/2}" />.
          </div>
          <div>
            <strong>Step 2 — Discretise scales and positions.</strong>{" "}
            Use <Equation tex="S = 16" /> log-spaced scales{" "}
            <Equation tex="\{s_i\}_{i=1}^{S}" /> and partition the band
            axis into <Equation tex="P = 8" /> equal-width position
            buckets:
          </div>
          <div className="py-1">
            <Equation tex="C_{i, j} = \max_{\tau \in P_j} |W_x(s_i, \tau)|,\quad |\mathcal{V}_{V14}| = S \cdot P = 128" />
          </div>
          <div>
            <strong>Step 3 — Top-K selection.</strong> Sort the{" "}
            <Equation tex="S \cdot P" /> magnitudes and emit the top-16
            cells as the document's tokens:
          </div>
          <div className="py-1">
            <Equation tex="\mathrm{wordify}_{V14}(x_d) = \mathrm{top}\text{-}16\big(\{(i, j, |W_x(s_i, P_j)|)\}_{i, j}\big)" />
          </div>
        </div>
        <V14MechanismSVG />
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <strong>Empirical signature.</strong> Multi-scale absorption
        feature detection: V14 outperforms its discrete-wavelet sibling
        V6 on every scene (c<sub>v</sub> mean V14 0.63 vs V6 0.45)
        because the Morlet mother gives joint scale-position
        localisation absent from dyadic Db4.
      </p>
    </MechanismShell>
  );
}

function V14MechanismSVG() {
  const positions = 8;
  const scales = 8;
  // synthetic time-scale magnitude profile w/ a blob at (s=4, p=2) and (s=6, p=5)
  const cell = (s: number, p: number) =>
    0.05 +
    0.9 * Math.exp(-((s - 4) ** 2 + (p - 2) ** 2) / 1.4) +
    0.7 * Math.exp(-((s - 6) ** 2 + (p - 5) ** 2) / 1.8);
  // identify top 16 cells
  const flat: { s: number; p: number; v: number }[] = [];
  for (let s = 0; s < scales; s++)
    for (let p = 0; p < positions; p++) flat.push({ s, p, v: cell(s, p) });
  flat.sort((a, b) => b.v - a.v);
  const topSet = new Set(flat.slice(0, 16).map((c) => `${c.s},${c.p}`));
  const w = 32;
  const h = 22;
  const x0 = 70;
  const y0 = 50;
  return (
    <svg
      viewBox="0 0 480 280"
      width="100%"
      role="img"
      aria-label="V14 mechanism: Morlet CWT cells with top-16 highlighted"
      style={{ color: "var(--color-fg)" }}
    >
      <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fill="currentColor">
        <text x="240" y="14" textAnchor="middle" fontSize="11" fontWeight="700">
          V14 — CWT-Morlet (scale × position) cells; top-16 ⇒ tokens
        </text>
        <text x="10" y={y0 - 8} fontSize="9" opacity="0.7">
          scale (log)
        </text>
        <text x={x0 + (positions * w) / 2} y={y0 + scales * h + 18} textAnchor="middle" fontSize="9" opacity="0.7">
          band position
        </text>
        {Array.from({ length: scales }, (_, s) =>
          Array.from({ length: positions }, (_, p) => {
            const v = cell(s, p);
            const top = topSet.has(`${s},${p}`);
            return (
              <g key={`${s}-${p}`}>
                <rect
                  x={x0 + p * w}
                  y={y0 + (scales - 1 - s) * h}
                  width={w - 2}
                  height={h - 2}
                  fill={`rgb(${Math.round(245 - 100 * v)}, ${Math.round(158 - 30 * v)}, ${Math.round(40 + 30 * v)})`}
                  opacity={0.4 + 0.5 * v}
                />
                {top && (
                  <text
                    x={x0 + p * w + (w - 2) / 2}
                    y={y0 + (scales - 1 - s) * h + (h - 2) / 2 + 3}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="white"
                  >
                    ★
                  </text>
                )}
              </g>
            );
          }),
        )}
        <text x={240} y={y0 + scales * h + 40} textAnchor="middle" fontSize="9.5" opacity="0.7" fontStyle="italic">
          ★ = top-16 magnitudes selected per pixel → tokens
        </text>
      </g>
    </svg>
  );
}
