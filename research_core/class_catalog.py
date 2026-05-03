"""Canonical class-label catalogues for labelled HSI scenes.

These mappings are used by EDA, topic-to-data, and validation builders to
attach human-readable names and stable colours to ground-truth labels.
The label_id 0 is treated as "unlabelled" for every scene and is excluded
from class-distribution statistics.
"""
from __future__ import annotations

from typing import Dict


CLASS_NAMES: Dict[str, Dict[int, str]] = {
    "indian-pines-corrected": {
        1: "Alfalfa",
        2: "Corn-notill",
        3: "Corn-mintill",
        4: "Corn",
        5: "Grass-pasture",
        6: "Grass-trees",
        7: "Grass-pasture-mowed",
        8: "Hay-windrowed",
        9: "Oats",
        10: "Soybean-notill",
        11: "Soybean-mintill",
        12: "Soybean-clean",
        13: "Wheat",
        14: "Woods",
        15: "Buildings-Grass-Trees-Drives",
        16: "Stone-Steel-Towers",
    },
    "salinas-corrected": {
        1: "Brocoli_green_weeds_1",
        2: "Brocoli_green_weeds_2",
        3: "Fallow",
        4: "Fallow_rough_plow",
        5: "Fallow_smooth",
        6: "Stubble",
        7: "Celery",
        8: "Grapes_untrained",
        9: "Soil_vinyard_develop",
        10: "Corn_senesced_green_weeds",
        11: "Lettuce_romaine_4wk",
        12: "Lettuce_romaine_5wk",
        13: "Lettuce_romaine_6wk",
        14: "Lettuce_romaine_7wk",
        15: "Vinyard_untrained",
        16: "Vinyard_vertical_trellis",
    },
    "salinas-a-corrected": {
        1: "Brocoli_green_weeds_1",
        2: "Corn_senesced_green_weeds",
        3: "Lettuce_romaine_4wk",
        4: "Lettuce_romaine_5wk",
        5: "Lettuce_romaine_6wk",
        6: "Lettuce_romaine_7wk",
    },
    "pavia-university": {
        1: "Asphalt",
        2: "Meadows",
        3: "Gravel",
        4: "Trees",
        5: "Painted metal sheets",
        6: "Bare Soil",
        7: "Bitumen",
        8: "Self-Blocking Bricks",
        9: "Shadows",
    },
    "kennedy-space-center": {
        1: "Scrub",
        2: "Willow swamp",
        3: "CP hammock",
        4: "Slash pine",
        5: "Oak/Broadleaf",
        6: "Hardwood",
        7: "Swamp",
        8: "Graminoid marsh",
        9: "Spartina marsh",
        10: "Cattail marsh",
        11: "Salt marsh",
        12: "Mud flats",
        13: "Water",
    },
    "botswana": {
        1: "Water",
        2: "Hippo grass",
        3: "Floodplain grasses 1",
        4: "Floodplain grasses 2",
        5: "Reeds",
        6: "Riparian",
        7: "Firescar",
        8: "Island interior",
        9: "Acacia woodlands",
        10: "Acacia shrublands",
        11: "Acacia grasslands",
        12: "Short mopane",
        13: "Mixed mopane",
        14: "Exposed soils",
    },
}


# Stable colour palette for class chips — okabe-ito plus extras for >8 classes.
# Indexed by (label_id - 1) modulo length.
CLASS_PALETTE = [
    "#0072B2", "#D55E00", "#009E73", "#CC79A7",
    "#F0E442", "#56B4E9", "#E69F00", "#999999",
    "#332288", "#117733", "#88CCEE", "#882255",
    "#44AA99", "#DDCC77", "#AA4499", "#661100",
]


def class_color(label_id: int) -> str:
    """Stable colour for a positive integer label_id (1-based)."""
    if label_id <= 0:
        return "#444444"
    return CLASS_PALETTE[(label_id - 1) % len(CLASS_PALETTE)]


def class_name(scene_id: str, label_id: int) -> str | None:
    return CLASS_NAMES.get(scene_id, {}).get(label_id)


def has_labels(scene_id: str) -> bool:
    return scene_id in CLASS_NAMES
