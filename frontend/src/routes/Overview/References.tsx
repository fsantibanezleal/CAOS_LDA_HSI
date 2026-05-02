interface RefEntry {
  authors: string;
  year: string;
  title: string;
  venue: string;
  url?: string;
}

const PROJECT: RefEntry[] = [
  {
    authors: "Egaña, Santibañez-Leal, Vidal, Díaz, Liberman, Ehrenfeld",
    year: "2020",
    title: "A Robust Stochastic Approach to Mineral Hyperspectral Analysis for Geometallurgy",
    venue: "Minerals 10(12), 1139",
    url: "https://doi.org/10.3390/min10121139"
  },
  {
    authors: "Santibañez-Leal, Ehrenfeld, Garrido, Navarro, Egaña",
    year: "2022",
    title: "Geometallurgical estimation of mineral samples from hyperspectral images and statistical topic modelling",
    venue: "Procemin Geomet 2022",
    url: "https://www.researchgate.net/publication/369708272_Geometallurgical_estimation_of_mineral_samples_from_hyperspectral_images_and_topic_modelling"
  },
  {
    authors: "Santibañez-Leal, Ehrenfeld, Garrido, Navarro, Egaña",
    year: "2023",
    title: "HIDSAG: Hyperspectral Image Database for Supervised Analysis in Geometallurgy",
    venue: "Scientific Data 10, 154",
    url: "https://doi.org/10.1038/s41597-023-02061-x"
  }
];

const FOUNDATIONS: RefEntry[] = [
  {
    authors: "Blei, Ng, Jordan",
    year: "2003",
    title: "Latent Dirichlet Allocation",
    venue: "JMLR 3, 993–1022",
    url: "http://dx.doi.org/10.1162/jmlr.2003.3.4-5.993"
  },
  {
    authors: "Hoffman, Blei, Bach",
    year: "2010",
    title: "Online Learning for Latent Dirichlet Allocation",
    venue: "NIPS"
  },
  {
    authors: "Sievert, Shirley",
    year: "2014",
    title: "LDAvis: A method for visualizing and interpreting topics",
    venue: "ACL Workshop"
  },
  {
    authors: "Heinrich",
    year: "2005",
    title: "Parameter estimation for text analysis",
    venue: "Technical Report"
  },
  {
    authors: "Zhai, Boyd-Graber",
    year: "2013",
    title: "Online Latent Dirichlet Allocation with Infinite Vocabulary",
    venue: "ICML 28(1), 561–569"
  },
  {
    authors: "Dieng, Ruiz, Blei",
    year: "2020",
    title: "Topic Modeling in Embedding Spaces",
    venue: "TACL 8, 439–453"
  }
];

const HSI_LINE: RefEntry[] = [
  {
    authors: "Wahabzada, Mahlein, Bauckhage, Steiner, Oerke, Kersting",
    year: "2015",
    title: "Plant Phenotyping using Probabilistic Topic Models",
    venue: "Scientific Reports / PLOS ONE lineage"
  },
  {
    authors: "Zou, Zare",
    year: "2017",
    title: "Partial-Membership Latent Dirichlet Allocation (PM-LDA) for hyperspectral unmixing",
    venue: "IEEE TGRS"
  },
  {
    authors: "Borsoi et al.",
    year: "2021",
    title: "Spectral Variability in Hyperspectral Data Unmixing — A Comprehensive Review",
    venue: "IEEE Geoscience and Remote Sensing Magazine"
  },
  {
    authors: "Mantripragada et al.",
    year: "2024",
    title: "LDVAE / SpACNN-LDVAE — Latent Dirichlet Variational Autoencoders for HSI",
    venue: "IEEE TGRS"
  },
  {
    authors: "Achanta et al.",
    year: "2012",
    title: "SLIC superpixels compared to state-of-the-art methods",
    venue: "IEEE TPAMI 34(11), 2274–2282"
  },
  {
    authors: "Clark, Roush",
    year: "1984",
    title: "Reflectance Spectroscopy: Quantitative Analysis Techniques for Remote Sensing",
    venue: "JGR 89(B7), 6329–6340"
  }
];

const DATASETS: RefEntry[] = [
  {
    authors: "Kokaly et al.",
    year: "2017",
    title: "USGS Spectral Library Version 7",
    venue: "USGS Data Series 1035",
    url: "https://doi.org/10.3133/ds1035"
  },
  {
    authors: "GIC UPV/EHU",
    year: "ongoing",
    title: "Hyperspectral Remote Sensing Scenes (Indian Pines, Salinas, Pavia, KSC, Botswana)",
    venue: "ehu.eus",
    url: "https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes"
  },
  {
    authors: "Borsoi et al.",
    year: "ongoing",
    title: "Public unmixing examples (Samson, Jasper Ridge, Urban)",
    venue: "github.com/ricardoborsoi",
    url: "https://github.com/ricardoborsoi"
  },
  {
    authors: "Caltech / NASA",
    year: "ongoing",
    title: "ECOSTRESS Spectral Library",
    venue: "speclib.jpl.nasa.gov",
    url: "https://speclib.jpl.nasa.gov"
  }
];

function RefSection({ title, items }: { title: string; items: RefEntry[] }) {
  return (
    <section className="overview-refs-section">
      <h3>{title}</h3>
      <ul>
        {items.map((entry, idx) => (
          <li key={idx}>
            <strong>{entry.authors}</strong> ({entry.year}). {entry.url ? (
              <a href={entry.url} target="_blank" rel="noreferrer">
                {entry.title}
              </a>
            ) : (
              entry.title
            )}. <em>{entry.venue}</em>.
          </li>
        ))}
      </ul>
    </section>
  );
}

export function References() {
  return (
    <article className="overview-article">
      <p className="overview-lead">
        Bibliographic anchor of the project. The wiki page{" "}
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/References"
          target="_blank"
          rel="noreferrer"
        >
          References
        </a>{" "}
        is the canonical extended version.
      </p>
      <RefSection title="Project publications" items={PROJECT} />
      <RefSection title="LDA / topic-modelling foundations" items={FOUNDATIONS} />
      <RefSection title="PTM on hyperspectral data — modern line" items={HSI_LINE} />
      <RefSection title="Public datasets" items={DATASETS} />
      <p className="overview-note">
        Author ORCID:{" "}
        <a
          href="https://orcid.org/0000-0002-0150-3246"
          target="_blank"
          rel="noreferrer"
        >
          0000-0002-0150-3246
        </a>
        . Personal publications page:{" "}
        <a
          href="https://fsantibanezleal.github.io/publications/"
          target="_blank"
          rel="noreferrer"
        >
          fsantibanezleal.github.io/publications
        </a>
        . Full bibliographic trail with provenance and "what this repo
        inherits" notes:{" "}
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/blob/main/legacy/papers/CITATIONS.md"
          target="_blank"
          rel="noreferrer"
        >
          legacy/papers/CITATIONS.md
        </a>
        .
      </p>
    </article>
  );
}
