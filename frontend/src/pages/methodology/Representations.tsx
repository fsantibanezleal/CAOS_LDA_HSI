import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { Equation } from "@/components/Equation";
import { Figure } from "@/components/Figure";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";
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
      "\\beta_k = \\rho \\cdot \\alpha_k^\\top \\in \\mathbb{R}^V",
      "q_\\phi(\\theta \\mid w) = \\mathcal{N}(\\mu_\\phi(w), \\Sigma_\\phi(w))",
      "p(w \\mid \\theta, \\rho, \\alpha) = \\text{softmax}(\\theta^\\top \\beta)",
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

      <div className="grid lg:grid-cols-2 gap-6">
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
    "V1 band-frequency", "V2 intensity-as-word", "V3 concat-spectra", "V4 derivative-bin",
    "V5 2nd-derivative", "V6 wavelet", "V7 absorption-triplet", "V8 endmember-fraction",
    "V9 region-token", "V10 band-group", "V11 codebook-VQ", "V12 GMM-token",
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
