import { useTranslation } from "react-i18next";

import { ExternalIcon } from "../components/chrome/Icons";

const COMMANDS: Array<{ heading: string; commands: string[] }> = [
  {
    heading: "First setup",
    commands: [
      "git clone https://github.com/fsantibanezleal/CAOS_LDA_HSI.git",
      "cd CAOS_LDA_HSI",
      "scripts/local.ps1 setup-all      # Windows / PowerShell",
      "./scripts/local.sh setup-all     # Linux / macOS"
    ]
  },
  {
    heading: "Acquire public datasets",
    commands: [
      "scripts/local.ps1 fetch-all",
      "# HIDSAG ZIPs are opt-in:",
      "$env:CAOS_HIDSAG_DOWNLOAD_IDS = 'GEOMET,MINERAL1,MINERAL2,GEOCHEM,PORPHYRY'",
      "scripts/local.ps1 fetch-hidsag"
    ]
  },
  {
    heading: "Build compact derived assets",
    commands: [
      "scripts/local.ps1 build-real",
      "scripts/local.ps1 build-field",
      "scripts/local.ps1 build-spectral",
      "scripts/local.ps1 build-analysis",
      "scripts/local.ps1 build-corpus",
      "scripts/local.ps1 build-baselines",
      "scripts/local.ps1 build-inventory",
      "scripts/local.ps1 build-hidsag",
      "scripts/local.ps1 build-hidsag-band-quality"
    ]
  },
  {
    heading: "Run validation core",
    commands: [
      "scripts/local.ps1 run-core",
      "scripts/local.ps1 run-hidsag-sensitivity",
      "scripts/local.ps1 build-local-core"
    ]
  },
  {
    heading: "Generate compact subset cards",
    commands: ["scripts/local.ps1 build-subset-cards"]
  },
  {
    heading: "Run locally",
    commands: [
      "scripts/local.ps1 dev      # FastAPI :8105 + Vite :5173",
      "scripts/local.ps1 build    # frontend/dist/",
      "scripts/local.ps1 preview  # production-style on :8105",
      "scripts/local.ps1 smoke"
    ]
  }
];

export function Usage() {
  const { t } = useTranslation();
  return (
    <section className="usage section">
      <div>
        <h2 className="section-title">{t("tabUsage")}</h2>
        <p className="section-lead">{t("usageLead")}</p>
        <p style={{ marginTop: 8 }}>
          <a
            className="usage-link"
            href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Local-Reproduction-Guide"
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {t("usageWiki")}
            <ExternalIcon size={14} />
          </a>
        </p>
      </div>

      {COMMANDS.map((block) => (
        <div key={block.heading} className="usage-block">
          <h3>{block.heading}</h3>
          <pre className="usage-pre">{block.commands.join("\n")}</pre>
        </div>
      ))}
    </section>
  );
}
