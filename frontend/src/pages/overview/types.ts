export type ScenePeek = {
  scene_id: string;
  n_pixels: number;
  n_labelled_pixels: number;
  n_classes: number;
  wavelengths_nm: number[];
  class_distribution: {
    label_id: number;
    name: string;
    count: number;
    rel_freq: number;
    color: string;
  }[];
  class_mean_spectra: Record<
    string,
    { mean: number[]; p5: number[]; p95: number[] }
  >;
};

export const LABELLED_SCENES = [
  { id: "indian-pines-corrected", label: "Indian Pines", sensor: "AVIRIS" },
  { id: "salinas-corrected", label: "Salinas", sensor: "AVIRIS" },
  { id: "salinas-a-corrected", label: "Salinas-A", sensor: "AVIRIS" },
  { id: "pavia-university", label: "Pavia U", sensor: "ROSIS" },
  { id: "kennedy-space-center", label: "Kennedy SC", sensor: "AVIRIS" },
  { id: "botswana", label: "Botswana", sensor: "Hyperion" },
];
