import { describe, expect, it } from "vitest";
import { getRequiredByStage, loadRequiredByStage } from "./required-by-stage.js";

describe("required-by-stage decision log rules", () => {
  it("loads and validates the bundled YAML source of truth", async () => {
    const requirements = await loadRequiredByStage();

    expect(requirements.proposal?.required).toEqual([
      "render_runtime_selection",
      "renderer_family_selection",
      "playbook_selection",
      "motion_commitment",
      "concept_selection",
    ]);
    expect(requirements.assets?.required_per_provider).toEqual(["model_selection"]);
  });

  it("exposes a sync loader for reviewer audits", () => {
    const requirements = getRequiredByStage();

    expect(requirements.compose?.conditional[0]?.add_one_of).toEqual(["fallback_decision", "downgrade_approval"]);
  });
});
