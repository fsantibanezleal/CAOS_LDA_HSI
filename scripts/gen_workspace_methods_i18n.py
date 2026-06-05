"""Generate the workspace_methods i18n block for EN and ES locales.

!!! SUPERSEDED — DO NOT BLINDLY MERGE THIS SCRIPT'S OUTPUT !!!
`frontend/src/i18n/locales/{en,es}/pages.json` is now the source of truth
for the workspace_methods block. This generator only defines V1-V12 (its
word dicts predate the V13-V20 catalog blocks hand-added under #774, and
its index lead has been corrected to the 19-recipe framing in pages.json
under #773/#778). Regenerating and merging would REVERT both. Keep it only
as a reference for the V1-V12 prose; if you extend it, add V13-V20 entries
AND diff against pages.json before merging.

Run from repo root. Writes JSON snippets to stdout and to:
  /tmp/workspace_methods_en.json
  /tmp/workspace_methods_es.json
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path


EN_WORDIFICATIONS = {
    "V1": {
        "tag": "band-frequency · canonical",
        "title": "Band-frequency tokens (V1)",
        "summary": "Each band contributes one token (band, quantised intensity). The canonical recipe; doc length = B; the substrate used for every F-axis in the current paper.",
        "theory": "The simplest faithful encoding: preserves both band identity and quantised intensity. Documents are dense (one token per band), so LDA can rediscover labelled-class spectra as topic-word distributions. Expected wins on F-1 classification and F-12 baselines on labelled landcover scenes; expected losses on F-9 HIDSAG preprocessing where the magnitude is the artefact, and on F-5 band-mask robustness when label boundaries are spatial-acquisition artefacts.",
    },
    "V2": {
        "tag": "q-bin · band-agnostic",
        "title": "Magnitude-only tokens (V2)",
        "summary": "Drops band identity entirely; the document is the histogram of intensity bins. Tests whether band shape matters or only the intensity distribution.",
        "theory": "The band-shuffled control: removes all spectral identity and keeps only the intensity histogram. Anywhere V2 wins, the spectrum is essentially shape-blind and V1's edge is illusory. Expect V2 to be a floor across F-axes; if it floats up on some scene, that is the strongest evidence that band identity is not informative there.",
    },
    "V3": {
        "tag": "band-bin joint",
        "title": "Joint (band, bin) vocabulary (V3)",
        "summary": "Larger vocab B × Q encoding intensity-specific band signatures. Wider design space than V1 at the cost of vocabulary size.",
        "theory": "The source schematic called this a concat trigram (3-band context); the implementation is actually a joint (band, bin) Cartesian product. This larger vocabulary lets the topic basis encode intensity-specific band signatures at the cost of seed sensitivity (F-3) and a rate-distortion penalty (F-11). Expected to do well on F-2 where finer vocabulary aligns to topic-specific signatures.",
    },
    "V4": {
        "tag": "1st derivative",
        "title": "Slope-encoded tokens (V4)",
        "summary": "Tokens encode local dλ. Robust to overall brightness or normalisation drift.",
        "theory": "Slope features are invariant to multiplicative scaling and additive shifts of the spectrum, so V4 should be robust where V1 is fragile under band masking (F-5). Expected to underperform V1 on scenes where absolute reflectance is the diagnostic (Pavia U). Useful as a baseline against SAM-style literature.",
    },
    "V5": {
        "tag": "2nd derivative · curvature",
        "title": "Curvature-encoded tokens (V5)",
        "summary": "Tokens encode d²/dλ². Captures absorption-feature inflection points.",
        "theory": "Curvature peaks correspond to inflection points of absorption features and are common in mineralogical preprocessing. Expected wins on HIDSAG (F-1, F-9). Caveat: high-frequency noise amplifies second differences, so F-3 seed stability may suffer.",
    },
    "V6": {
        "tag": "wavelet · multi-scale",
        "title": "Wavelet coefficient tokens (V6)",
        "summary": "Daubechies-4 wavelet decomposition; all coefficients binned. Multi-scale spectral structure.",
        "theory": "Multi-scale captures both broad continuum and narrow absorption simultaneously. Expected wins on F-2 coherence (wavelet bands align to physical scales) and F-12 baselines (wavelet features are a classical HSI baseline). Risk: topics are basis-aligned rather than label-aligned, so F-7 topic-label coupling may degrade.",
    },
    "V7": {
        "tag": "absorption · convex hull",
        "title": "Absorption-feature triplets (V7)",
        "summary": "Continuum-removed spectrum via convex hull; up to 6 features per pixel as (centroid, depth, area). The most physically motivated recipe for mineralogy.",
        "theory": "Each token is an actual absorption feature with measured centroid, depth and area. The most chemistry-faithful representation: it directly mirrors how spectroscopists read mineral spectra. Expected wins on HIDSAG F-1 (mineralogical separation), F-2 (topics aligned to USGS spectra) and F-7. Documents have at most six tokens, so K must be tightly bounded.",
    },
    "V8": {
        "tag": "endmember · NFINDR",
        "title": "Endmember-fraction tokens (V8)",
        "summary": "NFINDR-precomputed endmembers; NNLS unmixing produces one token per endmember weighted by abundance.",
        "theory": "Bakes the linear-mixing-model assumption into the tokens. Expected wins on Salinas where field-edge mixed pixels dominate, and F-12 against unmixing literature. Limit: seed stability (F-3) depends on which NFINDR endmembers were chosen, and NFINDR itself is seed-dependent.",
    },
    "V9": {
        "tag": "region · SAM",
        "title": "Region-SAM tokens (V9)",
        "summary": "Felzenszwalb spatial pre-segmentation; each pixel emits one token (region_id, SAM-distance-to-region-mean).",
        "theory": "Spatial aggregation damps band-level noise and bakes neighbourhood information into the corpus. Expected wins on F-5 band-mask robustness and F-3 seed stability (fewer tokens means less variance). Pays the price on F-1 pixel-resolution classification and F-11 rate-distortion.",
    },
    "V10": {
        "tag": "band group · VNIR/SWIR",
        "title": "Physical band-group tokens (V10)",
        "summary": "Hard partition into VNIR / SWIR-1 / SWIR-2. Three tokens per pixel encoding group means.",
        "theory": "The coarsest spectral representation. Useful as a what-if-we-used-only-3-bands baseline; expected to lose most F-axes but provides a tight floor for comparison.",
    },
    "V11": {
        "tag": "product quantisation",
        "title": "Codebook-VQ tokens (V11)",
        "summary": "Splits the B-vector into 4 sub-vectors; each sub-vector encoded as one of Q codewords learnt by k-means.",
        "theory": "Standard product quantisation used in approximate-nearest-neighbour search, repurposed as a wordification. Expected wins on F-11 rate-distortion and F-12 against vector-quantisation literature. Reproducibility caveat: the current implementation does not pin a seed for the codebook fit; results may shift across runs until that is fixed.",
    },
    "V12": {
        "tag": "GMM soft tokens",
        "title": "GMM-component tokens (V12)",
        "summary": "Global Gaussian Mixture over band intensities; each band emits a token labelled by its dominant component.",
        "theory": "Smoother than uniform binning: GMM boundaries flex with the data distribution. Expected to improve F-3 seed stability and F-2 coherence over V1 at a small F-1 classification cost. The smooth boundaries reduce quantisation noise that hurts F-3.",
    },
}

EN_NEURAL = {
    "ProdLDA": {
        "tag": "neural · product LDA",
        "title": "ProdLDA",
        "summary": "Logistic-normal product-of-experts topic model. Already evaluated as a baseline on V1; surfaced here alongside the V-recipes.",
        "theory": "ProdLDA replaces LDA's Dirichlet over topics with a logistic-normal, allowing gradient-based amortised inference. Acts as a deep-learning point of comparison; the V-sweep keeps the existing ProdLDA results untouched and shows them next to the new wordification sweep.",
    },
    "ETM": {
        "tag": "neural · embedded topic model",
        "title": "Embedded Topic Model (ETM)",
        "summary": "Topics and words live in a shared embedding space. Already evaluated; surfaced for comparison only.",
        "theory": "ETM jointly learns word embeddings and topic embeddings; the topic-word distribution is the softmax of their dot product. A topology-aware baseline; not re-run per V-recipe in the current sweep.",
    },
    "CAE": {
        "tag": "neural · conv autoencoder",
        "title": "Convolutional Autoencoder (CAE)",
        "summary": "Non-topic deep baseline. Already evaluated as a representation-learning comparator.",
        "theory": "A convolutional autoencoder over spectra; latent dimensions used as features for the downstream classifier. Surfaced here only as a reference latent-space method.",
    },
    "BetaVAE": {
        "tag": "neural · disentangled",
        "title": "Beta-VAE",
        "summary": "Disentangled variational autoencoder. Already evaluated.",
        "theory": "Beta-VAE encourages factorised latent dimensions via a re-weighted KL term. Like the CAE, this is here for comparison against deep latent-space alternatives, not re-run per recipe.",
    },
}


ES_WORDIFICATIONS = {
    "V1": {
        "tag": "band-frequency · canónica",
        "title": "Tokens band-frequency (V1)",
        "summary": "Cada banda aporta un token (banda, intensidad cuantizada). La receta canónica; longitud doc = B; sustrato sobre el que corren los 12 F-ejes del paper.",
        "theory": "La codificación más simple y fiel: preserva identidad de banda e intensidad. Documentos densos (un token por banda) permiten que LDA redescubra espectros por clase como distribuciones tópico-palabra. Esperado ganar en F-1 (clasificación) y F-12 (líneas base) en escenas etiquetadas; esperado perder en F-9 HIDSAG donde la magnitud es artefacto y en F-5 cuando los bordes de etiqueta vienen de artefactos de adquisición.",
    },
    "V2": {
        "tag": "q-bin · band-agnostic",
        "title": "Tokens sólo magnitud (V2)",
        "summary": "Descarta identidad de banda; el documento es el histograma de bins de intensidad. Pone a prueba si importa la forma espectral o sólo la distribución de intensidades.",
        "theory": "El control con bandas barajadas: elimina toda identidad espectral y deja sólo el histograma de intensidad. Donde V2 gane, el espectro es esencialmente ciego a forma y la ventaja de V1 es ilusoria. Se espera que V2 sea piso; si flota en alguna escena, es la evidencia más fuerte de que la identidad de banda no es informativa ahí.",
    },
    "V3": {
        "tag": "joint (banda, bin)",
        "title": "Vocabulario conjunto (banda, bin) (V3)",
        "summary": "Vocab más grande B × Q codificando firmas banda-intensidad específicas. Más espacio de diseño que V1 a costo de vocabulario.",
        "theory": "El esquema declaraba trigrama de bandas; la implementación es producto cartesiano (banda, bin). El vocabulario más grande permite que el basis codifique firmas específicas, a costa de sensibilidad a semilla (F-3) y penalización rate-distortion (F-11). Se espera buen desempeño en F-2.",
    },
    "V4": {
        "tag": "1ª derivada",
        "title": "Tokens de pendiente (V4)",
        "summary": "Tokens codifican dλ local. Robusto a brillo global y normalización.",
        "theory": "Las pendientes son invariantes a escalamiento y desplazamientos aditivos, así que V4 debería ser robusto donde V1 es frágil bajo enmascarado de bandas (F-5). Se espera bajar respecto a V1 donde la reflectancia absoluta diagnostica (Pavia U). Útil como baseline tipo SAM.",
    },
    "V5": {
        "tag": "2ª derivada · curvatura",
        "title": "Tokens de curvatura (V5)",
        "summary": "Tokens codifican d²/dλ². Captura puntos de inflexión de absorciones.",
        "theory": "Los picos de curvatura corresponden a inflexiones de absorciones y son habituales en preprocesado mineralógico. Esperado ganar en HIDSAG (F-1, F-9). Caveat: el ruido de alta frecuencia amplifica las segundas diferencias y puede comprometer la estabilidad F-3.",
    },
    "V6": {
        "tag": "wavelet · multi-escala",
        "title": "Coeficientes wavelet (V6)",
        "summary": "Descomposición Daubechies-4; todos los coeficientes binizados. Estructura espectral multi-escala.",
        "theory": "Captura continuum amplio y absorciones estrechas a la vez. Esperado ganar en F-2 (las bandas wavelet alinean con escalas físicas) y F-12 (los rasgos wavelet son baseline clásico de HSI). Riesgo: tópicos alineados a base, no a clase, así que F-7 puede degradarse.",
    },
    "V7": {
        "tag": "absorción · envolvente",
        "title": "Tripletas de absorción (V7)",
        "summary": "Espectro continuum-removed por envolvente convexa; hasta 6 rasgos por píxel como (centro, profundidad, área). El recipe más físico para mineralogía.",
        "theory": "Cada token es una absorción medida con centro, profundidad y área — la representación más fiel a cómo un espectroscopista lee espectros minerales. Esperado ganar en HIDSAG F-1, F-2 (alineación con USGS) y F-7. Los documentos tienen ≤6 tokens, así que K debe acotarse.",
    },
    "V8": {
        "tag": "endmember · NFINDR",
        "title": "Fracciones de endmember (V8)",
        "summary": "Endmembers pre-calculados con NFINDR; un token por endmember pesado por abundancia (NNLS).",
        "theory": "Mete el modelo lineal de mezcla en los tokens. Esperado ganar en Salinas (píxeles mezclados en bordes) y F-12 frente a literatura de unmixing. Límite: la estabilidad F-3 depende de qué endmembers eligió NFINDR, que es a su vez sensible a semilla.",
    },
    "V9": {
        "tag": "región · SAM",
        "title": "Tokens región-SAM (V9)",
        "summary": "Pre-segmentación espacial Felzenszwalb; cada píxel emite un token (region_id, distancia SAM al medio de la región).",
        "theory": "La agregación espacial amortigua ruido por banda y mete vecindad en el corpus. Esperado ganar en F-5 y F-3 (menos tokens, menos varianza). Paga el precio en F-1 (clasificación pixel) y F-11 (rate-distortion).",
    },
    "V10": {
        "tag": "grupo banda · VNIR/SWIR",
        "title": "Tokens por grupos físicos (V10)",
        "summary": "Partición dura en VNIR / SWIR-1 / SWIR-2. Tres tokens por píxel con medias por grupo.",
        "theory": "La representación espectral más gruesa. Útil como baseline ¿y si usáramos sólo 3 bandas?; esperado perder en casi todos los F-ejes pero da un piso tight de comparación.",
    },
    "V11": {
        "tag": "cuantización producto",
        "title": "Tokens codebook-VQ (V11)",
        "summary": "Parte el vector B en 4 sub-vectores; cada sub-vector codificado a una de Q codewords aprendidas con k-means.",
        "theory": "Cuantización producto estándar de búsqueda aproximada de vecinos, aquí como wordification. Esperado ganar en F-11 rate-distortion (PQ es literalmente para esto) y F-12 frente a literatura VQ. Caveat de reproducibilidad: la semilla de nanopq no está pinneada y los resultados pueden moverse entre corridas hasta que se arregle.",
    },
    "V12": {
        "tag": "GMM soft",
        "title": "Tokens GMM (V12)",
        "summary": "Mezcla gaussiana global sobre intensidades por banda; cada banda emite el id de su componente dominante.",
        "theory": "Más suave que binizado uniforme: las fronteras GMM se acomodan a la distribución. Esperado mejorar F-3 y F-2 sobre V1 a costo pequeño en F-1. El ruido de cuantización que daña F-3 baja.",
    },
}

ES_NEURAL = {
    "ProdLDA": {
        "tag": "neuronal · product LDA",
        "title": "ProdLDA",
        "summary": "Modelo logístico-normal producto-de-expertos. Ya evaluado como baseline sobre V1; aparece junto a los V-recipes.",
        "theory": "ProdLDA reemplaza el Dirichlet sobre tópicos de LDA por una logística-normal, permitiendo inferencia amortizada por gradiente. Punto de comparación deep; el V-sweep no la re-corre por recipe, sólo la muestra al lado.",
    },
    "ETM": {
        "tag": "neuronal · embedded topic model",
        "title": "Embedded Topic Model (ETM)",
        "summary": "Tópicos y palabras viven en un mismo espacio de embedding. Ya evaluado; se muestra para comparación.",
        "theory": "ETM aprende embeddings de palabras y de tópicos en conjunto; la distribución tópico-palabra es softmax del producto punto. Baseline topology-aware; no se re-corre por V-recipe en el sweep actual.",
    },
    "CAE": {
        "tag": "neuronal · autoencoder convolucional",
        "title": "Autoencoder convolucional (CAE)",
        "summary": "Baseline no-tópico. Ya evaluado como comparador de representación.",
        "theory": "Autoencoder convolucional sobre espectros; dimensiones latentes usadas como features del clasificador. Referencia de espacio latente.",
    },
    "BetaVAE": {
        "tag": "neuronal · desentangled",
        "title": "Beta-VAE",
        "summary": "Autoencoder variacional desentangled. Ya evaluado.",
        "theory": "Beta-VAE favorece dimensiones factorizadas vía un término KL re-ponderado. Como el CAE, sólo aquí para comparación; no se re-corre por receta.",
    },
}


def build(side: str, words: dict, neural: dict) -> dict:
    is_en = side == "en"
    index = (
        {
            "title": "Methods workspace",
            "lead": "Explore each topic-modelling method on its own page: how the tokens are built, the theory hypothesis, the F-axis sweep, and side-by-side comparators. Nineteen built wordification recipes (V1..V20; V16 scaffold) plus four neural baselines.",
            "wordifications_heading": "Wordification recipes",
            "neural_heading": "Neural baselines",
        }
        if is_en
        else {
            "title": "Workspace por métodos",
            "lead": "Explora cada método de topic modelling en su propia página: cómo se construyen los tokens, la hipótesis teórica, el sweep F-eje, y comparadores lado a lado. Diecinueve recetas de wordification construidas (V1..V20; V16 scaffold) más cuatro baselines neuronales.",
            "wordifications_heading": "Recetas de wordification",
            "neural_heading": "Baselines neuronales",
        }
    )
    deep = (
        {
            "not_found": "No method exists with id {{id}}.",
            "back_to_index": "Back to methods index",
            "theory_heading": "Hypothesis card",
            "sweep_heading": "F-axis sweep results",
            "compare_heading": "Compare against",
            "compare_lead": "Jump to any other method to see its results side by side.",
            "no_sweep_yet": "This method is a baseline; the V-sweep does not re-run it per recipe. Existing results from the V1 evaluation are surfaced elsewhere.",
            "sweep_pending": "Sweep results appear here as the F-1, F-2, F-5 and remaining F-axes complete. The pipeline is running.",
        }
        if is_en
        else {
            "not_found": "No existe un método con id {{id}}.",
            "back_to_index": "Volver al índice de métodos",
            "theory_heading": "Tarjeta de hipótesis",
            "sweep_heading": "Resultados sweep F-eje",
            "compare_heading": "Comparar con",
            "compare_lead": "Salta a cualquier otro método para ver sus resultados lado a lado.",
            "no_sweep_yet": "Este método es baseline; el V-sweep no lo re-corre por receta. Los resultados existentes sobre V1 se muestran en otra parte.",
            "sweep_pending": "Los resultados del sweep aparecerán a medida que F-1, F-2, F-5 y los F-ejes restantes terminen. El pipeline está corriendo.",
        }
    )
    return {
        "workspace_methods": {
            "index": index,
            "deep": deep,
            "catalog": {**words, **neural},
        }
    }


def main() -> int:
    en_block = build("en", EN_WORDIFICATIONS, EN_NEURAL)
    es_block = build("es", ES_WORDIFICATIONS, ES_NEURAL)
    out_dir = Path(tempfile.gettempdir())
    (out_dir / "workspace_methods_en.json").write_text(
        json.dumps(en_block, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (out_dir / "workspace_methods_es.json").write_text(
        json.dumps(es_block, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {out_dir / 'workspace_methods_en.json'}")
    print(f"wrote {out_dir / 'workspace_methods_es.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
