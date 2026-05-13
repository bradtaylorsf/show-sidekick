import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-validator.js";

describe("validateComposition", () => {
  it("flags leading gaps, interior gaps, and missing tail coverage", () => {
    const findings = validateComposition(
      {
        cuts: [
          { start_s: 1, end_s: 3, asset_id: "a" },
          { start_s: 4, end_s: 7, asset_id: "b" },
        ],
      },
      10,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition has a leading gap",
        patch: expect.objectContaining({ artifact_path: "cuts[0].start_s", new_value: 0 }),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition has a gap between cuts",
        patch: expect.objectContaining({ artifact_path: "cuts[0].end_s", new_value: 4 }),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition does not cover full planned duration",
        patch: expect.objectContaining({ artifact_path: "cuts[1].end_s", new_value: 10 }),
      }),
    );
  });

  it("flags overlapping cuts as suggestions", () => {
    const findings = validateComposition(
      {
        cuts: [
          { start_s: 0, end_s: 4, asset_id: "a" },
          { start_s: 3.5, end_s: 8, asset_id: "b" },
        ],
      },
      8,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        severity: "suggestion",
        title: "Composition has overlapping cuts",
      }),
    ]);
  });
});
