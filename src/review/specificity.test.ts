import { describe, expect, it } from "vitest";
import type { Finding } from "../artifacts/review.js";
import { enforceCHAI, evaluateSpecificity } from "./specificity.js";

const baseCritical: Finding = {
  severity: "critical",
  title: "Caption contradicts frame",
  location: "scene_plan.scenes[0]",
  description: "Caption points to the wrong side of the frame.",
  status: "pending",
};

describe("CHAI specificity enforcement", () => {
  it("downgrades a critical finding without a proposed fix", () => {
    const result = enforceCHAI([baseCritical]);

    expect(result.findings[0]?.severity).toBe("investigation");
    expect(result.findings[0]?.description).toBe(baseCritical.description);
    expect(result.events).toEqual([
      {
        type: "proposed_fix_below_specificity_bar",
        location: "scene_plan.scenes[0]",
        title: "Caption contradicts frame",
        reason: "missing_proposed_fix",
      },
    ]);
  });

  it("downgrades a critical finding with a short proposed fix and no patch", () => {
    const result = enforceCHAI([{ ...baseCritical, proposed_fix: "Fix it." }]);

    expect(result.findings[0]?.severity).toBe("investigation");
    expect(result.events[0]?.reason).toBe("proposed_fix_too_short");
  });

  it("downgrades a critical finding with no specific token and no patch", () => {
    const proposed_fix = "Rewrite the caption so it clearly describes the visible subject and action.";

    const result = enforceCHAI([{ ...baseCritical, proposed_fix }]);

    expect(proposed_fix.length).toBeGreaterThanOrEqual(40);
    expect(result.findings[0]?.severity).toBe("investigation");
    expect(result.events[0]?.reason).toBe("proposed_fix_lacks_specific_token");
  });

  it("accepts a critical finding with a patch object", () => {
    const result = evaluateSpecificity({
      patch: { artifact_path: "scene_plan.scenes[0].start_s", new_value: 12.4 },
      proposed_fix: "Too short",
    });

    expect(result).toEqual({ ok: true });
  });
});
