import type { LabelCell } from "@/api/client";

export type RoutedPrediction = {
  label_id: number;
  name: string;
  color: string;
  p: number;
};

/**
 * Topic-routed-soft prediction per document (cycles 120 / 122).
 *
 *   P(L = l | d) = Σ_k  θ_d[k] · P(L = l | topic = k)
 *
 * Computed client-side from already-loaded `topic_to_data` fields:
 *   - `thetaFull[K]` — the document's posterior simplex
 *   - `perTopicLabel[K][L]` — per-topic empirical P(L | topic) from the
 *     canonical dominant-topic assignment (`p_label_given_topic_dominant`)
 *
 * Renormalises the result so the rendered top-K probabilities present
 * as clean percentages even when some labels have all-zero rows.
 */
export function computeRoutedPrediction(
  thetaFull: number[],
  perTopicLabel: LabelCell[][],
): RoutedPrediction[] {
  const K = thetaFull.length;
  if (K === 0 || perTopicLabel.length === 0) return [];
  const firstRow = perTopicLabel[0]!;
  const L = firstRow.length;
  if (L === 0) return [];
  const acc: RoutedPrediction[] = firstRow.map((c) => ({
    p: 0,
    label_id: c.label_id,
    name: c.name,
    color: c.color,
  }));
  for (let k = 0; k < K; k++) {
    const t = thetaFull[k] ?? 0;
    if (t <= 0) continue;
    const row = perTopicLabel[k];
    if (!row) continue;
    for (let l = 0; l < L; l++) {
      acc[l]!.p += t * (row[l]?.p ?? 0);
    }
  }
  let total = 0;
  for (const a of acc) total += a.p;
  if (total > 0) for (const a of acc) a.p = a.p / total;
  return acc;
}
