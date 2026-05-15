import { describe, expect, it } from "vitest";
import {
  _COLOR_TEMP_PHRASES,
  _DOF_PHRASES,
  _LIGHTING_PHRASES,
  _MOVEMENT_PHRASES,
  _SHOT_SIZE_PHRASES,
  buildShotPrompt,
} from "./shot-prompt-builder.js";

describe("shot prompt builder", () => {
  it("preserves the expected phrase-map sizes", () => {
    expect(Object.keys(_SHOT_SIZE_PHRASES)).toHaveLength(10);
    expect(Object.keys(_MOVEMENT_PHRASES)).toHaveLength(18);
    expect(Object.keys(_LIGHTING_PHRASES)).toHaveLength(11);
    expect(Object.keys(_DOF_PHRASES)).toHaveLength(3);
    expect(Object.keys(_COLOR_TEMP_PHRASES)).toHaveLength(4);
  });

  it("renders the five aspects in canonical order", () => {
    const prompt = buildShotPrompt({
      subject: "a ceramic astronaut",
      subjectMotion: "turns toward a floating teacup",
      scene: "desk diorama with no overlays",
      spatialFraming: "medium close-up, centered subject, shallow background",
      camera: "slow dolly in, eye level, shallow DoF",
    });

    expect(prompt).toBe(
      [
        "Subject: a ceramic astronaut.",
        "Subject Motion: turns toward a floating teacup.",
        "Scene: desk diorama with no overlays.",
        "Spatial Framing: medium close-up, centered subject, shallow background.",
        "Camera: slow dolly in, eye level, shallow DoF.",
      ].join(" "),
    );
  });

  it("appends the playbook style suffix when supplied", () => {
    const prompt = buildShotPrompt(
      {
        subject: "one teacher character",
        subjectMotion: "points at an animated chart",
        scene: "clean classroom graphic scene",
        spatialFraming: "wide shot with chart in midground",
        camera: "locked-off camera",
      },
      "flat-motion-graphics playbook palette and typography",
    );

    expect(prompt).toContain("Style: flat-motion-graphics playbook palette and typography.");
  });

  it("keeps explicit N/A aspects instead of silently dropping them", () => {
    const prompt = buildShotPrompt({
      subject: { naReason: "pure scenery shot" },
      subjectMotion: { naReason: "no character motion" },
      scene: "empty mountain pass, dawn fog",
      spatialFraming: "wide establishing shot",
      camera: "static aerial view",
    });

    expect(prompt).toContain("Subject: N/A — pure scenery shot.");
    expect(prompt).toContain("Subject Motion: N/A — no character motion.");
    expect(prompt).toContain("Scene: empty mountain pass, dawn fog.");
  });
});
