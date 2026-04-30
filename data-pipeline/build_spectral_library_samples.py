"""Build compact spectral-library samples from downloaded USGS archives."""
from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "usgs_splib07"
OUTPUT_DIR = ROOT / "data" / "derived" / "spectral"
OUTPUT_PATH = OUTPUT_DIR / "library_samples.json"

AVIRIS_WAVELENGTHS_NM = np.linspace(400.0, 2500.0, 224)
SENTINEL2_WAVELENGTHS_NM = np.array(
    [443.0, 490.0, 560.0, 665.0, 705.0, 740.0, 783.0, 842.0, 865.0, 945.0, 1375.0, 1610.0, 2190.0],
    dtype=np.float32,
)

TARGET_MATERIALS = [
    ("kaolinite", "clay"),
    ("illite", "clay"),
    ("montmorillonite", "clay"),
    ("alunite", "alteration mineral"),
    ("muscovite", "mica / phyllosilicate"),
    ("chlorite", "phyllosilicate"),
    ("calcite", "carbonate"),
    ("dolomite", "carbonate"),
    ("hematite", "oxide"),
    ("goethite", "oxide"),
    ("asphalt", "urban material"),
    ("concrete", "urban material"),
    ("grass", "vegetation"),
    ("dry grass", "vegetation"),
]


def normalize01(values: np.ndarray) -> np.ndarray:
    low = float(np.nanmin(values))
    high = float(np.nanmax(values))
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def clean_material_name(header: str) -> str:
    if ":" in header:
        header = header.split(":", 1)[1]
    header = re.sub(r"\s{2,}.*$", "", header.strip())
    header = header.replace("_", " ")
    return header


def sample_id(sensor_id: str, name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return f"{sensor_id}-{slug}"[:96]


def parse_spectrum(text: str) -> tuple[str, np.ndarray]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        raise ValueError("Spectrum file has no numeric values.")
    name = clean_material_name(lines[0])
    values = np.array([float(line) for line in lines[1:]], dtype=np.float32)
    values[np.abs(values) > 1e10] = np.nan
    if np.isnan(values).any():
        finite = values[np.isfinite(values)]
        fill_value = float(np.nanmedian(finite)) if finite.size else 0.0
        values = np.nan_to_num(values, nan=fill_value)
    return name, values


def quantized_tokens(wavelengths: np.ndarray, spectrum: np.ndarray, levels: int = 12) -> tuple[list[int], list[str]]:
    normalized = normalize01(spectrum)
    quantized = np.clip(np.rint(normalized * (levels - 1)), 0, levels - 1).astype(np.int32)
    tokens = [f"{int(round(float(wavelength))):04d}nm_q{int(level):02d}" for wavelength, level in zip(wavelengths, quantized)]
    return [int(value) for value in quantized], tokens


def absorption_tokens(wavelengths: np.ndarray, spectrum: np.ndarray, top_n: int = 8) -> list[str]:
    normalized = normalize01(spectrum)
    depth = 1.0 - normalized
    indices = np.argsort(depth)[::-1][:top_n]
    return [f"abs_{int(round(float(wavelengths[index]))):04d}nm" for index in indices]


def material_group(name: str) -> str | None:
    normalized = name.lower()
    for term, group in TARGET_MATERIALS:
        if term in normalized:
            return group
    return None


def build_samples_from_zip(path: Path, sensor_id: str, sensor_name: str, wavelengths: np.ndarray) -> list[dict]:
    samples = []
    seen_terms: set[str] = set()
    with zipfile.ZipFile(path) as archive:
        names = sorted(name for name in archive.namelist() if name.endswith(".txt"))
        for archive_name in names:
            group = material_group(archive_name)
            if group is None:
                continue
            term_key = next(term for term, _ in TARGET_MATERIALS if term in archive_name.lower())
            if term_key in seen_terms:
                continue
            seen_terms.add(term_key)

            text = archive.read(archive_name).decode("utf-8", "replace")
            name, spectrum = parse_spectrum(text)
            if spectrum.shape[0] != wavelengths.shape[0]:
                continue

            quantized, tokens = quantized_tokens(wavelengths, spectrum)
            samples.append(
                {
                    "id": sample_id(sensor_id, name),
                    "name": name,
                    "group": group,
                    "sensor": sensor_name,
                    "source_url": "https://www.sciencebase.gov/catalog/item/586e8c88e4b0f5ce109fccae",
                    "source_file": archive_name,
                    "band_count": int(spectrum.shape[0]),
                    "wavelengths_nm": [round(float(value), 2) for value in wavelengths],
                    "spectrum": [round(float(value), 5) for value in normalize01(spectrum)],
                    "quantized_levels": quantized,
                    "token_preview": tokens[:26],
                    "absorption_tokens": absorption_tokens(wavelengths, spectrum),
                    "notes": (
                        "Compact sample extracted from the official USGS Spectral Library Version 7 ASCII archive. "
                        "Values are normalized for visualization and tokenization only."
                    ),
                }
            )
    return samples


def main() -> None:
    sources = [
        (
            RAW_DIR / "ASCIIdata_splib07b_cvAVIRISc1997.zip",
            "aviris1997",
            "AVIRIS-Classic 1997 convolution",
            AVIRIS_WAVELENGTHS_NM,
        ),
        (
            RAW_DIR / "ASCIIdata_splib07b_rsSentinel2.zip",
            "sentinel2",
            "Sentinel-2 MSI resampling",
            SENTINEL2_WAVELENGTHS_NM,
        ),
    ]

    samples = []
    for path, sensor_id, sensor_name, wavelengths in sources:
        if not path.exists():
            print(f"Skipping {path.name}: archive not found.")
            continue
        print(f"Building spectral-library samples from {path.name} ...")
        samples.extend(build_samples_from_zip(path, sensor_id, sensor_name, wavelengths))

    payload = {
        "source": "USGS Spectral Library Version 7 compact samples",
        "source_url": "https://www.sciencebase.gov/catalog/item/586e8c88e4b0f5ce109fccae",
        "samples": samples,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote spectral-library payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
