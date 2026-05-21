import { useTranslation } from "react-i18next";

export function MethodCoverage() {
  const { t } = useTranslation(["pages"]);
  const groups = [
    {
      title: t("pages:overview.coverage.lda_family"),
      color: "rgba(56,189,248,1)",
      items: ["LDA (canonical)", "gensim_vb", "gensim_multicore", "sklearn_online", "sklearn_sparse", "tomotopy_lda", "tomotopy_hdp", "tomotopy_ctm", "dmr_lda_hidsag"],
    },
    {
      title: t("pages:overview.coverage.neural_topic"),
      color: "rgba(170,60,200,1)",
      items: ["ProdLDA (Pyro)", "ETM (low-rank ρα^T)"],
    },
    {
      title: t("pages:overview.coverage.deep_repr"),
      color: "rgba(40,160,80,1)",
      items: ["CAE-1D (K∈{4,6,8,10,12,16,32})", "CAE-2D (K∈{4,8,16,32})", "CAE-3D anchor (K∈{4,8,16,32})", "CAE-3D full-patch (K∈{4,8})", "β-VAE (β∈{1,2,4,8,16})"],
    },
    {
      title: t("pages:overview.coverage.k_baselines"),
      color: "rgba(214,140,40,1)",
      items: ["PCA-K", "NMF-K", "ICA-K", "dense-AE"],
    },
    {
      title: t("pages:overview.coverage.axes"),
      color: "rgba(214,39,40,1)",
      items: ["B-1 linear probe", "B-2 rate-distortion", "B-3 topic-routed + deep gate", "B-4 mutual information", "B-5 embedded baseline", "B-6 seed stability (N=7/15/30)", "B-7 USGS alignment", "B-8 cross-scene transfer", "B-9 anomaly", "B-10 spatial coherence", "B-11 endmember", "B-12 LLM tea-leaves"],
    },
  ];
  return (
    <section className="mt-12">
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
          {t("pages:overview.coverage.tag")}
        </span>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight mt-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:overview.coverage.title")}
        </h2>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
        {groups.map((g) => (
          <div
            key={g.title}
            className="rounded-lg border p-3 relative"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div
              aria-hidden="true"
              className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
              style={{ backgroundColor: g.color }}
            />
            <div className="text-[11px] uppercase tracking-widest font-semibold mt-1.5 mb-2" style={{ color: g.color }}>
              {g.title}
            </div>
            <ul className="space-y-1">
              {g.items.map((item) => (
                <li key={item} className="text-[12px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--color-fg-subtle)" }}>
                  <span aria-hidden className="inline-block w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: g.color }}/>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================================================
   8. Reading path
   =======================================================================*/

