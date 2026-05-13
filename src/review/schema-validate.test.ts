import { describe, expect, it } from "vitest";
import { validateArtifactAgainstSchema } from "./schema-validate.js";

describe("validateArtifactAgainstSchema", () => {
  it("returns a critical finding for an invalid scene plan", () => {
    const findings = validateArtifactAgainstSchema("scene_plan", { scenes: [{}] });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatchObject({
      severity: "critical",
      location: "scene_plan.scenes[0].slug",
      status: "pending",
    });
    expect(findings[0]?.proposed_fix).toContain("scene_plan.scenes[0].slug");
  });
});
