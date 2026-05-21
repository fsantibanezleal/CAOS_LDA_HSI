import { useTranslation } from "react-i18next";

export function HypercubeAnatomy() {
  const { t } = useTranslation(["pages"]);
  return (
    <section className="mt-12">
      <div className="mb-4">
        <span
          className="text-[11px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--color-accent)" }}
        >
          {t("pages:overview.pipeline_anatomy.tag")}
        </span>
        <h2
          className="text-xl md:text-2xl font-semibold tracking-tight mt-1"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:overview.pipeline_anatomy.title")}
        </h2>
        <p
          className="mt-2 max-w-3xl text-[13.5px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t("pages:overview.pipeline_anatomy.lead")}
        </p>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <svg viewBox="0 0 1080 320" className="w-full h-auto" role="img" aria-label="Pipeline anatomy">
          <defs>
            <marker id="ovw-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 Z" fill="currentColor"/>
            </marker>
            <linearGradient id="ovw-step1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(56,189,248,0.5)"/>
              <stop offset="100%" stopColor="rgba(31,119,180,0.18)"/>
            </linearGradient>
            <linearGradient id="ovw-step2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(170,60,200,0.5)"/>
              <stop offset="100%" stopColor="rgba(170,60,200,0.18)"/>
            </linearGradient>
            <linearGradient id="ovw-step3" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(40,160,80,0.5)"/>
              <stop offset="100%" stopColor="rgba(40,160,80,0.18)"/>
            </linearGradient>
            <linearGradient id="ovw-step4" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(214,140,40,0.5)"/>
              <stop offset="100%" stopColor="rgba(214,140,40,0.18)"/>
            </linearGradient>
          </defs>

          {/* Step 1: Cube + pixel */}
          <g transform="translate(40, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage1_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage1_sub")}</text>
            {/* mini cube */}
            <polygon points="20,40 130,40 152,58 42,58" fill="url(#ovw-step1)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
            <rect x="20" y="58" width="110" height="120" fill="url(#ovw-step1)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
            <polygon points="130,58 152,58 152,178 130,178" fill="rgba(56,189,248,0.25)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
            {/* pixel highlight */}
            <rect x="68" y="98" width="10" height="10" fill="rgba(214,39,40,0.9)"/>
            <text x="80" y="107" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage1_pixel")}</text>
            <text x="20" y="200" fontSize="10" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage1_note")}</text>
          </g>

          <line x1="210" y1="135" x2="290" y2="135" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#ovw-arr)" opacity="0.55"/>

          {/* Step 2: Discretization (12 V-recipes) */}
          <g transform="translate(300, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage2_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage2_sub")}</text>
            <rect x="0" y="32" width="220" height="148" fill="url(#ovw-step2)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" rx="6"/>
            {/* tokens list */}
            {Array.from({length: 6}, (_, i) => (
              <g key={i}>
                <rect x={12 + (i % 3) * 70} y={48 + Math.floor(i/3) * 32} width="60" height="22" rx="3" fill="rgba(170,60,200,0.25)" stroke="rgba(170,60,200,0.5)" strokeWidth="0.7"/>
                <text x={42 + (i % 3) * 70} y={63 + Math.floor(i/3) * 32} fontSize="9.5" textAnchor="middle" fill="currentColor" opacity="0.85" fontFamily="ui-monospace, monospace">
                  {["0822nm", "1102nm", "1442nm", "1922nm", "2204nm", "2356nm"][i]}
                </text>
              </g>
            ))}
            <text x="12" y="138" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage2_note1")}</text>
            <text x="12" y="154" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage2_note2")}</text>
            <text x="12" y="170" fontSize="9.5" fill="currentColor" opacity="0.55" fontStyle="italic">{t("pages:overview.pipeline_anatomy.stage2_note3")}</text>
          </g>

          <line x1="540" y1="135" x2="620" y2="135" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#ovw-arr)" opacity="0.55"/>

          {/* Step 3: Topic model */}
          <g transform="translate(630, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage3_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage3_sub")}</text>
            <rect x="0" y="32" width="180" height="148" fill="url(#ovw-step3)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" rx="6"/>
            {/* phi rows */}
            {Array.from({length: 4}, (_, k) => (
              <g key={k}>
                <text x="10" y={56 + k * 22} fontSize="9.5" fill="currentColor" opacity="0.7" fontFamily="ui-monospace, monospace">φ_{k}</text>
                {Array.from({length: 12}, (_, b) => (
                  <rect key={b} x={32 + b * 12} y={48 + k * 22} width="10" height="10"
                        fill={`rgba(40,160,80,${0.12 + 0.7 * Math.abs(Math.sin(k * 1.7 + b * 0.4))})`}/>
                ))}
              </g>
            ))}
            <text x="10" y="160" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage3_note1")}</text>
            <text x="10" y="174" fontSize="9.5" fill="currentColor" opacity="0.55" fontStyle="italic">{t("pages:overview.pipeline_anatomy.stage3_note2")}</text>
          </g>

          <line x1="820" y1="135" x2="900" y2="135" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#ovw-arr)" opacity="0.55"/>

          {/* Step 4: theta inspection */}
          <g transform="translate(910, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage4_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage4_sub")}</text>
            <rect x="0" y="32" width="130" height="148" fill="url(#ovw-step4)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" rx="6"/>
            {/* simplex */}
            <polygon points="65,55 25,165 105,165" fill="rgba(214,140,40,0.25)" stroke="rgba(214,140,40,0.7)" strokeWidth="1.2"/>
            <text x="65" y="49" fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.75" fontFamily="ui-monospace, monospace">{t("pages:overview.pipeline_anatomy.stage4_topic1")}</text>
            <text x="20" y="174" fontSize="10" fill="currentColor" opacity="0.75" fontFamily="ui-monospace, monospace">{t("pages:overview.pipeline_anatomy.stage4_topic2")}</text>
            <text x="105" y="174" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.75" fontFamily="ui-monospace, monospace">{t("pages:overview.pipeline_anatomy.stage4_topic3")}</text>
            {/* points = pixels on simplex */}
            {[
              [65, 90], [50, 110], [80, 105], [70, 130], [55, 145], [90, 140], [60, 160], [85, 155], [75, 100],
            ].map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="rgba(214,140,40,0.95)"/>
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}

/* =========================================================================
   5. Scenes showcase — class distribution color bars
   =======================================================================*/

