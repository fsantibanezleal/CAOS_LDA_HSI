import { type SubsetCard } from "../../lib/api";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

interface BaselineSpec {
  id: string;
  title: string;
  feature_space: string;
  spatial: boolean;
  supervision: boolean;
  purpose: string;
}

const BASELINES_EN: BaselineSpec[] = [
  {
    id: "slic",
    title: "SLIC superpixels",
    feature_space: "false-colour pixel space",
    spatial: true,
    supervision: false,
    purpose: "Spatial regioning baseline. Provides patch / region documents for V7 recipes."
  },
  {
    id: "kmeans",
    title: "KMeans (raw spectra)",
    feature_space: "raw reflectance",
    spatial: false,
    supervision: false,
    purpose: "Reference unsupervised grouping in spectral feature space."
  },
  {
    id: "kmeans-topic",
    title: "KMeans (topic mixture)",
    feature_space: "topic mixture θ",
    spatial: false,
    supervision: false,
    purpose: "Same KMeans but in the K-dimensional topic-mixture space — tests if topic structure clusters more cleanly."
  },
  {
    id: "sam",
    title: "Spectral Angle Mapper",
    feature_space: "raw reflectance",
    spatial: false,
    supervision: false,
    purpose: "Library-reference alignment for Family A / C — proximity, never identification."
  },
  {
    id: "nmf",
    title: "NMF / unmixing",
    feature_space: "non-negative reflectance",
    spatial: false,
    supervision: false,
    purpose: "Mixture-oriented baseline for Family C unmixing scenes."
  }
];

const BASELINES_ES: BaselineSpec[] = [
  {
    id: "slic",
    title: "Superpixeles SLIC",
    feature_space: "espacio de pixeles falso-color",
    spatial: true,
    supervision: false,
    purpose: "Baseline de regiones espaciales. Provee documentos patch / region para recetas V7."
  },
  {
    id: "kmeans",
    title: "KMeans (espectros crudos)",
    feature_space: "reflectancia cruda",
    spatial: false,
    supervision: false,
    purpose: "Agrupamiento no supervisado de referencia en espacio espectral."
  },
  {
    id: "kmeans-topic",
    title: "KMeans (mixtura de topicos)",
    feature_space: "mixtura de topicos θ",
    spatial: false,
    supervision: false,
    purpose: "El mismo KMeans pero sobre la mixtura K-dimensional — testea si los topicos producen clusters mas limpios."
  },
  {
    id: "sam",
    title: "Spectral Angle Mapper",
    feature_space: "reflectancia cruda",
    spatial: false,
    supervision: false,
    purpose: "Alineamiento contra librerias para Familia A / C — proximidad, nunca identificacion."
  },
  {
    id: "nmf",
    title: "NMF / unmixing",
    feature_space: "reflectancia no-negativa",
    spatial: false,
    supervision: false,
    purpose: "Baseline orientado a mezclas para escenas de Familia C."
  }
];

export function ComparisonStep({ card: _card, language }: Props) {
  const isEn = language === "en";
  const baselines = isEn ? BASELINES_EN : BASELINES_ES;
  void _card;

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Baseline comparison" : "Comparacion contra baselines"}</h4>
        <p>
          {isEn
            ? "Topic outputs vs non-topic baselines. Each comparison must declare its feature space, spatial use, and supervision use. The numerical comparison surface that loads metrics from /api/local-core-benchmarks and /api/segmentation-baselines is the next implementation block — for now this surface lists the comparison contract per baseline."
            : "Salidas de topicos vs baselines no-topicas. Cada comparacion debe declarar feature space, uso espacial y uso de supervision. La superficie numerica que carga metricas desde /api/local-core-benchmarks y /api/segmentation-baselines es el siguiente bloque de implementacion — por ahora esta vista lista el contrato por baseline."}
        </p>
      </div>

      <ul className="workspace-baseline-grid">
        {baselines.map((b) => (
          <li key={b.id} className="workspace-baseline-card">
            <header className="workspace-evidence-head">
              <strong>{b.title}</strong>
              <span className="workspace-evidence-modality">{b.id}</span>
            </header>
            <dl className="workspace-evidence-meta">
              <dt>{isEn ? "Feature space" : "Feature space"}</dt>
              <dd>{b.feature_space}</dd>
              <dt>{isEn ? "Spatial" : "Espacial"}</dt>
              <dd>{b.spatial ? (isEn ? "yes" : "si") : "no"}</dd>
              <dt>{isEn ? "Supervision" : "Supervision"}</dt>
              <dd>{b.supervision ? (isEn ? "yes" : "si") : "no"}</dd>
            </dl>
            <p className="workspace-baseline-purpose">{b.purpose}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
