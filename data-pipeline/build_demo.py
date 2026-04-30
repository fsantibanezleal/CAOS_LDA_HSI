"""Build a compact synthetic topic-modelling demo for the web application.

The goal is not to replace real MSI / HSI datasets. The goal is to ship a
small, deterministic, fully public example that explains:

1. how spectra can be discretized into tokens
2. how a document-term matrix can be assembled from spectral data
3. how LDA-like latent regimes can support routed inference
"""
from __future__ import annotations

import json
from itertools import permutations
from pathlib import Path

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.linear_model import LinearRegression
from sklearn.metrics import root_mean_squared_error
from sklearn.model_selection import LeaveOneOut


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "demo" / "demo.json"
RNG = np.random.default_rng(42)


def gaussian(x: np.ndarray, center: float, width: float, amplitude: float) -> np.ndarray:
    return amplitude * np.exp(-0.5 * ((x - center) / width) ** 2)


def normalize01(values: np.ndarray) -> np.ndarray:
    low = float(values.min())
    high = float(values.max())
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - values.max()
    exp = np.exp(shifted)
    return exp / exp.sum()


def build_basis(wavelengths: np.ndarray) -> tuple[list[dict[str, str]], np.ndarray]:
    basis_meta = [
        {
            "id": "clay-regime",
            "en": "Clay-rich variability",
            "es": "Variabilidad rica en arcillas",
            "summary_en": "Broad continuum with hydroxyl-related absorptions around 1400 nm and 2200 nm.",
            "summary_es": "Continuo amplio con absorciones asociadas a hidroxilos cerca de 1400 nm y 2200 nm.",
            "color": "#c9824d",
        },
        {
            "id": "oxide-regime",
            "en": "Ferric / oxide regime",
            "es": "Regimen ferrico / de oxidos",
            "summary_en": "Visible to NIR slope with stronger response in the red and near infrared.",
            "summary_es": "Pendiente visible a NIR con respuesta mas fuerte en el rojo y el infrarrojo cercano.",
            "color": "#d84f3c",
        },
        {
            "id": "vegetation-regime",
            "en": "Vegetation edge regime",
            "es": "Regimen de borde rojo vegetal",
            "summary_en": "Low visible reflectance followed by a red-edge jump and high NIR plateau.",
            "summary_es": "Baja reflectancia en visible seguida por un salto de borde rojo y una meseta alta en NIR.",
            "color": "#4f8f5b",
        },
        {
            "id": "water-regime",
            "en": "Water-damped regime",
            "es": "Regimen amortiguado por agua",
            "summary_en": "Lower overall reflectance with broad absorptions near water-sensitive regions.",
            "summary_es": "Reflectancia general menor con absorciones amplias cerca de regiones sensibles al agua.",
            "color": "#277da1",
        },
    ]

    clay = (
        0.48
        + 0.18 * normalize01(wavelengths)
        - gaussian(wavelengths, 1400, 110, 0.16)
        - gaussian(wavelengths, 2200, 120, 0.22)
        + gaussian(wavelengths, 1900, 260, 0.04)
    )
    oxide = (
        0.30
        + 0.10 * np.sin((wavelengths - 450) / 260)
        + gaussian(wavelengths, 850, 260, 0.34)
        - gaussian(wavelengths, 550, 80, 0.08)
    )
    vegetation = (
        0.10
        + 0.58 / (1.0 + np.exp(-(wavelengths - 730) / 38))
        - gaussian(wavelengths, 550, 80, 0.05)
        - gaussian(wavelengths, 970, 70, 0.16)
        - gaussian(wavelengths, 1200, 120, 0.08)
    )
    water = (
        0.18
        + 0.06 * np.cos((wavelengths - 450) / 180)
        - gaussian(wavelengths, 970, 70, 0.08)
        - gaussian(wavelengths, 1400, 120, 0.18)
        - gaussian(wavelengths, 1900, 140, 0.24)
        - gaussian(wavelengths, 2200, 180, 0.08)
    )
    basis = np.vstack([clay, oxide, vegetation, water])
    basis = np.clip(normalize01(basis), 0.0, 1.0)
    return basis_meta, basis


def build_tokens(
    wavelengths: np.ndarray, quantized: np.ndarray, levels: int
) -> tuple[list[str], list[str], list[str]]:
    tokens_a: list[str] = []
    tokens_b: list[str] = []
    tokens_c: list[str] = []
    for index, level in enumerate(quantized):
        band_token = f"{int(round(wavelengths[index])):04d}nm"
        count = int(level)
        if count > 0:
            tokens_a.extend([band_token] * count)
        tokens_b.append(f"q{count:02d}")
        tokens_c.append(f"{band_token}_q{count:02d}")
    return tokens_a, tokens_b, tokens_c


def dominant_names(indices: np.ndarray) -> list[dict[str, str]]:
    names = [
        {"en": "Clay-rich core", "es": "Nucleo rico en arcillas"},
        {"en": "Ferric alteration", "es": "Alteracion ferrica"},
        {"en": "Vegetated cover", "es": "Cobertura vegetal"},
        {"en": "Water-influenced zone", "es": "Zona influida por agua"},
    ]
    return [names[int(index)] for index in indices]


def fit_topic_model(doc_term: np.ndarray, n_topics: int) -> tuple[np.ndarray, np.ndarray]:
    lda = LatentDirichletAllocation(
        n_components=n_topics,
        learning_method="batch",
        max_iter=300,
        random_state=42,
        doc_topic_prior=0.4,
        topic_word_prior=0.3,
    )
    doc_topic = lda.fit_transform(doc_term)
    return doc_topic, lda.components_


def best_topic_order(components: np.ndarray, basis: np.ndarray) -> list[int]:
    components_norm = np.vstack([normalize01(row) for row in components])
    basis_norm = np.vstack([normalize01(row) for row in basis])
    corr = np.corrcoef(np.vstack([components_norm, basis_norm]))[: components.shape[0], components.shape[0] :]

    best_perm: tuple[int, ...] | None = None
    best_score = -1e18
    for perm in permutations(range(basis.shape[0])):
        score = sum(float(corr[row, perm[row]]) for row in range(components.shape[0]))
        if score > best_score:
            best_score = score
            best_perm = perm
    assert best_perm is not None
    basis_to_component = {basis_index: component_index for component_index, basis_index in enumerate(best_perm)}
    return [basis_to_component[index] for index in range(basis.shape[0])]


def routed_predictions(features: np.ndarray, mixtures: np.ndarray, target: np.ndarray) -> dict[str, np.ndarray]:
    loo = LeaveOneOut()
    baseline_preds: list[float] = []
    mixture_preds: list[float] = []
    routed_preds: list[float] = []
    dominant_topics = mixtures.argmax(axis=1)

    for train_idx, test_idx in loo.split(features):
        X_train, X_test = features[train_idx], features[test_idx]
        z_train, z_test = mixtures[train_idx], mixtures[test_idx]
        y_train = target[train_idx]
        test_topic = int(dominant_topics[test_idx[0]])

        baseline_model = LinearRegression().fit(X_train, y_train)
        baseline_preds.append(float(baseline_model.predict(X_test)[0]))

        mixture_model = LinearRegression().fit(z_train, y_train)
        mixture_preds.append(float(mixture_model.predict(z_test)[0]))

        topic_mask = dominant_topics[train_idx] == test_topic
        if int(topic_mask.sum()) >= 3:
            routed_model = LinearRegression().fit(X_train[topic_mask], y_train[topic_mask])
        else:
            routed_model = LinearRegression().fit(X_train, y_train)
        routed_preds.append(float(routed_model.predict(X_test)[0]))

    return {
        "baseline_linear": np.array(baseline_preds),
        "topic_mixture_linear": np.array(mixture_preds),
        "topic_routed_linear": np.array(routed_preds),
    }


def build_demo() -> dict:
    wavelengths = np.linspace(450.0, 2350.0, 30)
    levels = 12
    sample_count = 24

    basis_meta, basis = build_basis(wavelengths)
    latent_weights = RNG.dirichlet(np.array([1.5, 1.4, 1.3, 1.2]), size=sample_count)
    spectra = latent_weights @ basis
    spectra += RNG.normal(0.0, 0.018, size=spectra.shape)
    spectra = np.clip(spectra, 0.0, 1.0)

    quantized = np.clip(np.rint(spectra * (levels - 1)), 0, levels - 1).astype(int)
    doc_term = quantized.copy()

    inferred_mixtures, components = fit_topic_model(doc_term, n_topics=4)
    reorder = best_topic_order(components, basis)
    inferred_mixtures = inferred_mixtures[:, reorder]
    components = components[reorder]
    dominant_true = latent_weights.argmax(axis=1)
    sample_groups = dominant_names(dominant_true)

    target = (
        42.0
        + 18.0 * latent_weights[:, 0]
        + 9.5 * latent_weights[:, 1]
        + 13.0 * latent_weights[:, 2]
        - 11.0 * latent_weights[:, 3]
        + RNG.normal(0.0, 1.8, size=sample_count)
    )
    predictions = routed_predictions(spectra, inferred_mixtures, target)

    band_tokens = [f"{int(round(wavelength)):04d}nm" for wavelength in wavelengths]
    topics = []
    for topic_index, meta in enumerate(basis_meta):
        component = components[topic_index]
        sorted_indices = np.argsort(component)[::-1][:6]
        top_words = [
            {
                "token": band_tokens[index],
                "weight": round(float(component[index] / component.sum()), 4),
            }
            for index in sorted_indices
        ]
        topics.append(
            {
                "id": meta["id"],
                "name": {"en": meta["en"], "es": meta["es"]},
                "summary": {"en": meta["summary_en"], "es": meta["summary_es"]},
                "color": meta["color"],
                "top_words": top_words,
                "band_profile": [round(float(value), 4) for value in normalize01(component)],
            }
        )

    samples = []
    for sample_index in range(sample_count):
        tokens_a, tokens_b, tokens_c = build_tokens(wavelengths, quantized[sample_index], levels)
        dominant_topic = int(np.argmax(inferred_mixtures[sample_index]))
        samples.append(
            {
                "id": f"sample-{sample_index + 1:02d}",
                "label": {
                    "en": f"Document {sample_index + 1:02d}",
                    "es": f"Documento {sample_index + 1:02d}",
                },
                "source_group": sample_groups[sample_index],
                "spectrum": [round(float(value), 4) for value in spectra[sample_index]],
                "quantized_levels": [int(value) for value in quantized[sample_index]],
                "tokens_by_representation": {
                    "a": {"preview": tokens_a[:26], "total_tokens": len(tokens_a)},
                    "b": {"preview": tokens_b[:26], "total_tokens": len(tokens_b)},
                    "c": {"preview": tokens_c[:26], "total_tokens": len(tokens_c)},
                },
                "latent_mixture": [round(float(value), 4) for value in latent_weights[sample_index]],
                "inferred_topic_mixture": [round(float(value), 4) for value in softmax(np.log(inferred_mixtures[sample_index] + 1e-9))],
                "dominant_topic_id": basis_meta[dominant_topic]["id"],
                "target_value": round(float(target[sample_index]), 3),
                "predictions": {
                    key: round(float(value[sample_index]), 3) for key, value in predictions.items()
                },
            }
        )

    metrics = []
    for metric_id, label_en, label_es, note_en, note_es in [
        (
            "baseline_linear",
            "Baseline linear regression on raw spectra",
            "Regresion lineal base sobre espectros crudos",
            "One global linear model sees every sample as if it came from the same regime.",
            "Un modelo lineal global ve cada muestra como si viniera del mismo regimen.",
        ),
        (
            "topic_mixture_linear",
            "Linear regression on inferred topic mixtures",
            "Regresion lineal sobre mezclas de topicos inferidas",
            "The predictor is compressed to topic proportions before fitting the response.",
            "El predictor se comprime a proporciones de topicos antes de ajustar la respuesta.",
        ),
        (
            "topic_routed_linear",
            "Topic-routed local linear models",
            "Modelos lineales locales enrutados por topicos",
            "Each sample is routed to a local regressor according to its dominant inferred topic.",
            "Cada muestra se enruta a un regresor local segun su topico inferido dominante.",
        ),
    ]:
        rmse = root_mean_squared_error(target, predictions[metric_id])
        metrics.append(
            {
                "id": metric_id,
                "label": {"en": label_en, "es": label_es},
                "rmse": round(float(rmse), 3),
                "note": {"en": note_en, "es": note_es},
            }
        )

    return {
        "title": {
            "en": "Synthetic spectral topic demo",
            "es": "Demo sintetica de topicos espectrales"
        },
        "narrative": {
            "en": "This demo uses synthetic spectra shaped to mimic clay-rich, oxide-rich, vegetation, and water-damped regimes. The purpose is didactic: show how quantization, topic mixtures, and topic-routed inference behave in a compact public example.",
            "es": "Esta demo usa espectros sinteticos moldeados para imitar regimenes ricos en arcillas, ricos en oxidos, vegetacion y amortiguados por agua. El proposito es didactico: mostrar como se comportan la cuantizacion, las mezclas de topicos y la inferencia enrutada por topicos en un ejemplo publico compacto."
        },
        "quantization_levels": levels,
        "wavelengths_nm": [round(float(value), 2) for value in wavelengths],
        "topics": topics,
        "samples": samples,
        "model_metrics": metrics,
        "routing_rule": {
            "en": "During evaluation, each held-out sample is assigned to its dominant inferred topic and scored with the corresponding local regressor whenever enough training samples exist.",
            "es": "Durante la evaluacion, cada muestra dejada fuera se asigna a su topico inferido dominante y se evalua con el regresor local correspondiente cuando existen suficientes muestras de entrenamiento."
        }
    }


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    payload = build_demo()
    with OUTPUT.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
    print(f"Wrote demo payload to {OUTPUT}")


if __name__ == "__main__":
    main()
