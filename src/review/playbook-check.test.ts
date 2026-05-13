import { describe, expect, it } from "vitest";
import type { Playbook } from "../shows/playbook.js";
import { crossCheckAgainstPlaybook } from "./playbook-check.js";

const playbook: Playbook = {
  palette: ["#112233", "brand-blue"],
  transitions_allowed: ["cut", "fade"],
  pacing: {
    min_scene_s: 2,
    max_scene_s: 6,
  },
  style_cues: ["noir glow", "paper grain"],
};

describe("crossCheckAgainstPlaybook", () => {
  it("flags palette mismatches as suggestions", () => {
    const findings = crossCheckAgainstPlaybook(
      "scene_plan",
      { scenes: [{ color: "#ffffff", description: "noir glow hero frame" }] },
      playbook,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Color reference is outside playbook palette",
        location: "scene_plan.scenes[0].color",
      }),
    );
  });

  it("flags transitions outside the allowlist as suggestions", () => {
    const findings = crossCheckAgainstPlaybook(
      "edit",
      {
        cuts: [{ start_s: 0, end_s: 4, asset_id: "hero", transition_out: "wipe" }],
      },
      playbook,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Transition is outside playbook allowlist",
        location: "edit.cuts[0].transition_out",
      }),
    );
  });

  it("flags scene pacing outside min and max bounds as suggestions", () => {
    const findings = crossCheckAgainstPlaybook(
      "scene_plan",
      {
        scenes: [
          { start_s: 0, end_s: 1, description: "noir glow opener" },
          { start_s: 1, end_s: 9, description: "paper grain closer" },
        ],
      },
      playbook,
    );

    expect(findings.filter((finding) => finding.title === "Scene pacing is outside playbook range")).toHaveLength(2);
    expect(findings.map((finding) => finding.location)).toEqual(
      expect.arrayContaining(["scene_plan.scenes[0]", "scene_plan.scenes[1]"]),
    );
  });

  it("flags asset descriptions missing playbook style cues as suggestions", () => {
    const findings = crossCheckAgainstPlaybook(
      "assets",
      { assets: [{ id: "hero", description: "Clean office with a centered subject." }] },
      playbook,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Asset description is missing playbook style cues",
        location: "assets.assets[0].description",
      }),
    );
  });
});
