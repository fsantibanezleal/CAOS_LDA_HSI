const T = {
  es: {
    title: "Reproducir",
    lead: "Todo el pipeline corre localmente con dos venvs y se publica con un comando. Sin servicios cloud, sin dependencias de plataforma.",
    cloneTitle: "Clonar y bootstrap",
    pipelineTitle: "Regenerar capa derivada",
    apiTitle: "Servir API + frontend",
    smokeTitle: "Smoke (104 endpoints)",
    deployTitle: "Deploy a VPS",
    layoutTitle: "Estructura del repo",
    rows: [
      ["data-pipeline/", "39 builders python (Wave 1..14)"],
      ["app/", "FastAPI + 104 endpoints"],
      ["frontend/", "React + TS + Vite (esta app)"],
      ["data/raw/", "datos públicos (UPV/EHU + HIDSAG zips + USGS splib07)"],
      ["data/derived/", "1118 artefactos (.json + binary streams)"],
      ["data/local/", "modelos LDA + per-pixel theta + groupings"],
      ["scripts/", "local.ps1 + local.sh + smoke.{ps1,sh} runners"],
    ],
  },
  en: {
    title: "Reproduce",
    lead: "The full pipeline runs locally with two venvs and ships with one command. No cloud services, no platform lock-in.",
    cloneTitle: "Clone & bootstrap",
    pipelineTitle: "Regenerate the derived layer",
    apiTitle: "Serve API + frontend",
    smokeTitle: "Smoke check (104 endpoints)",
    deployTitle: "Deploy to VPS",
    layoutTitle: "Repository layout",
    rows: [
      ["data-pipeline/", "39 python builders (Wave 1..14)"],
      ["app/", "FastAPI + 104 endpoints"],
      ["frontend/", "React + TS + Vite (this app)"],
      ["data/raw/", "public datasets (UPV/EHU + HIDSAG zips + USGS splib07)"],
      ["data/derived/", "1118 artifacts (.json + binary streams)"],
      ["data/local/", "LDA models + per-pixel theta + groupings"],
      ["scripts/", "local.ps1 + local.sh + smoke.{ps1,sh} runners"],
    ],
  },
};

const SH_CLONE = `git clone https://github.com/fsantibanezleal/CAOS_LDA_HSI
cd CAOS_LDA_HSI
./scripts/local.sh setup-pipeline    # creates .venv-pipeline (~70 deps)
./scripts/local.sh setup-web         # creates .venv (FastAPI light)
./scripts/local.sh setup-frontend    # node_modules`;

const SH_PIPELINE = `# regenerate everything from raw scenes:
./scripts/local.sh build-precompute-all
./scripts/local.sh build-quantization-sensitivity
./scripts/local.sh build-topic-model-variants
./scripts/local.sh build-representations
./scripts/local.sh build-lda-sweep
./scripts/local.sh build-dmr-lda-hidsag
./scripts/local.sh build-bayesian-method-comparison
./scripts/local.sh build-optuna-hyperparam-search
# Addendum B P0 + P1 + P2 + B-8 + Bayesian-labelled:
./scripts/local.sh build-linear-probe-panel
./scripts/local.sh build-rate-distortion-curve
./scripts/local.sh build-topic-routed-classifier
./scripts/local.sh build-mutual-information
./scripts/local.sh build-embedded-baseline
./scripts/local.sh build-topic-stability
./scripts/local.sh build-topic-to-usgs-v7
./scripts/local.sh build-topic-anomaly
./scripts/local.sh build-topic-spatial-continuous
./scripts/local.sh build-topic-spatial-full
./scripts/local.sh build-endmember-baseline
./scripts/local.sh build-cross-scene-transfer
./scripts/local.sh build-bayesian-classification-labelled
# §7 wordifications (V1..V12):
./scripts/local.sh build-wordifications
./scripts/local.sh build-wordifications-v4plus
./scripts/local.sh build-wordifications-v6plus
./scripts/local.sh build-wordifications-v7v11
./scripts/local.sh curate-for-web`;

const SH_API = `./scripts/local.sh dev   # uvicorn :8105 + vite :5173`;

const SH_SMOKE = `./scripts/local.sh smoke
# or against production:
./scripts/smoke.sh https://lda-hsi.fasl-work.com`;

const SH_DEPLOY = `# Branch: task/<5-digit-id>/<description>
# After commit + push + ff-merge to main, run on VPS:
ssh root@VPS "bash /opt/fasl-apps/CAOS_LDA_HSI/deploy/update.sh"`;

export function Reproducibility({ lang }: { lang: "en" | "es" }) {
  const t = T[lang];
  return (
    <div>
      <h1 style={{ fontSize: 24, marginTop: 8 }}>{t.title}</h1>
      <p className="lead" style={{ maxWidth: 760 }}>{t.lead}</p>

      <div className="col-2">
        <div className="card">
          <h3>{t.cloneTitle}</h3>
          <pre className="code">{SH_CLONE}</pre>
        </div>
        <div className="card">
          <h3>{t.apiTitle}</h3>
          <pre className="code">{SH_API}</pre>
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-tertiary)" }}>
            FastAPI <span className="tag">127.0.0.1:8105</span> + Vite dev <span className="tag">:5173</span>
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3>{t.pipelineTitle}</h3>
        <pre className="code">{SH_PIPELINE}</pre>
      </div>

      <div className="col-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h3>{t.smokeTitle}</h3>
          <pre className="code">{SH_SMOKE}</pre>
        </div>
        <div className="card">
          <h3>{t.deployTitle}</h3>
          <pre className="code">{SH_DEPLOY}</pre>
        </div>
      </div>

      <h2 style={{ fontSize: 17, marginTop: 32 }}>{t.layoutTitle}</h2>
      <ul className="list-clean card" style={{ padding: 0 }}>
        {t.rows.map(([k, v]) => (
          <li key={k}>
            <span style={{ fontFamily: "var(--mono)", color: "var(--accent)" }}>{k}</span> — <span style={{ color: "var(--text-secondary)" }}>{v}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
