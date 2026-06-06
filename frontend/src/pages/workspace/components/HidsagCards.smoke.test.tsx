/**
 * HIDSAG Explore cards — render smoke test against the REAL served eda /
 * method-statistics payloads (loaded from data/derived on disk).
 *
 * This guards the crash class that white-screened the live app: the cards
 * were written against a fictional HidsagEda type whose fields did not exist
 * in the builder output (e.g. dominant_targets_by_mean[].std -> undefined ->
 * `.toFixed()` TypeError). tsc could not catch it because the type itself was
 * wrong. Rendering each card with the actual JSON would have thrown — so we
 * assert it does not, for all five subsets.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HidsagBriefingCard,
  HidsagTargetsCard,
  HidsagModalitySpectraCard,
  HidsagCorrelationCard,
} from "@/pages/Workspace";
import type { HidsagEda, HidsagMethodStatistics } from "@/api/client";

const SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"] as const;
// vitest runs with cwd = frontend/; data/derived is one level up.
const DERIVED = resolve(process.cwd(), "..", "data", "derived");

function loadEda(code: string): HidsagEda {
  return JSON.parse(
    readFileSync(resolve(DERIVED, "eda", "hidsag", `${code}.json`), "utf-8"),
  ) as HidsagEda;
}
function loadMethods(code: string): HidsagMethodStatistics {
  return JSON.parse(
    readFileSync(
      resolve(DERIVED, "method_statistics_hidsag", `${code}.json`),
      "utf-8",
    ),
  ) as HidsagMethodStatistics;
}

describe("HIDSAG Explore cards — real-data render smoke", () => {
  for (const code of SUBSETS) {
    it(`${code}: all four cards render without throwing`, () => {
      const eda = loadEda(code);
      const methods = loadMethods(code);

      // Sanity: the data itself is not degenerate (the root bug produced
      // numeric_variables {n:0} and an empty correlation matrix).
      const firstVar = eda.numeric_variable_names[0]!;
      expect(eda.numeric_variables[firstVar]!.n).toBeGreaterThan(0);
      expect(eda.correlation_pearson?.matrix.length).toBeGreaterThan(0);

      // Each card must render; the exact crash was in the briefing's
      // dominant_targets std formatting.
      expect(() =>
        render(
          <HidsagBriefingCard eda={eda} methods={methods} subsetCode={code} />,
        ),
      ).not.toThrow();
      expect(() => render(<HidsagTargetsCard eda={eda} />)).not.toThrow();
      expect(() =>
        render(<HidsagModalitySpectraCard eda={eda} />),
      ).not.toThrow();
      expect(() =>
        render(<HidsagCorrelationCard eda={eda} />),
      ).not.toThrow();
    });
  }

  it("cards tolerate null props (loading state)", () => {
    expect(() =>
      render(
        <HidsagBriefingCard eda={null} methods={null} subsetCode="GEOMET" />,
      ),
    ).not.toThrow();
    expect(() => render(<HidsagTargetsCard eda={null} />)).not.toThrow();
    expect(() => render(<HidsagModalitySpectraCard eda={null} />)).not.toThrow();
    expect(() => render(<HidsagCorrelationCard eda={null} />)).not.toThrow();
  });
});
