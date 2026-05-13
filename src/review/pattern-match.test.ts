import { describe, expect, it } from "vitest";
import type { Finding } from "../artifacts/review.js";
import { findSameClassInstances } from "./pattern-match.js";

describe("findSameClassInstances", () => {
  it("flags sibling scene timing defects in the same round", () => {
    const artifact = {
      scenes: [
        { slug: "one", start_s: 4, end_s: 3 },
        { slug: "two", start_s: 7, end_s: 7 },
        { slug: "three", start_s: 8, end_s: 10 },
      ],
    };
    const criticalFinding: Finding = {
      severity: "critical",
      title: "Scene timing is invalid",
      location: "scene_plan.scenes[0]",
      description: "Scene end_s must be greater than start_s.",
      proposed_fix: "At scene_plan.scenes[0], set end_s to 4.5 so it is greater than start_s.",
      status: "pending",
    };

    const findings = findSameClassInstances(criticalFinding, artifact);

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "critical",
      title: "Scene timing is invalid (same-class follow-up)",
      location: "scene_plan.scenes[1]",
    });
  });
});
