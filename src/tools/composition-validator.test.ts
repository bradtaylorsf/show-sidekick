import { describe, expect, it } from "vitest";
import type { EditDecisions } from "../artifacts/index.js";
import compositionValidator, { validateCompositionCoverage } from "./composition-validator.js";

const baseEditDecisions: EditDecisions = {
  cuts: [],
  overlays: [],
  render_runtime: "ffmpeg",
  renderer_family: "documentary-montage",
};

describe("composition_validator", () => {
  it("registers the composition validation capability", () => {
    expect(compositionValidator.name).toBe("composition_validator");
    expect(compositionValidator.capability).toBe("composition_validation");
    expect(compositionValidator.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
  });

  it("passes when cuts cover the full duration without gaps", () => {
    expect(
      validateCompositionCoverage(
        {
          ...baseEditDecisions,
          cuts: [
            { start_s: 0, end_s: 2, asset_id: "a" },
            { start_s: 2, end_s: 5, asset_id: "b" },
          ],
        },
        5,
      ),
    ).toEqual({ passed: true, gaps: [], overlaps: [], coverage_ratio: 1 });
  });

  it("reports gaps and overlaps", () => {
    const result = validateCompositionCoverage(
      {
        ...baseEditDecisions,
        cuts: [
          { start_s: 0, end_s: 2, asset_id: "a" },
          { start_s: 1.5, end_s: 3, asset_id: "b" },
          { start_s: 4, end_s: 5, asset_id: "c" },
        ],
      },
      5,
    );

    expect(result.passed).toBe(false);
    expect(result.overlaps).toEqual([{ start_s: 1.5, end_s: 2 }]);
    expect(result.gaps).toEqual([{ start_s: 3, end_s: 4 }]);
    expect(result.coverage_ratio).toBe(0.8);
  });
});
