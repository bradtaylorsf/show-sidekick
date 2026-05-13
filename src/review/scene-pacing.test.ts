import { describe, expect, it } from "vitest";
import { verifyScenePacing } from "./scene-pacing.js";

describe("verifyScenePacing", () => {
  it("flags scenes exceeding the pipeline max duration as critical", () => {
    const findings = verifyScenePacing(
      [{ start_s: 0, end_s: 7 }],
      { defaults: { max_scene_duration_s: 5 } },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Scene exceeds maximum duration",
        location: "scenes[0]",
      }),
    );
  });

  it("flags scenes below the pipeline min duration as critical", () => {
    const findings = verifyScenePacing(
      [{ start_s: 0, end_s: 1.5 }],
      { defaults: { min_scene_duration_s: 2 } },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Scene is below minimum duration",
        location: "scenes[0]",
      }),
    );
  });

  it("flags music-led scenes crossing section boundaries as suggestions", () => {
    const findings = verifyScenePacing(
      [{ start_s: 8, end_s: 12 }],
      {
        master_clock: "audio",
        defaults: {
          sections: [
            { label: "verse", start_s: 0, end_s: 10 },
            { label: "chorus", start_s: 10, end_s: 20 },
          ],
        },
      },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Scene crosses music section boundary",
        location: "scenes[0]",
      }),
    );
  });

  it("does not flag section crossings outside music-led pipelines", () => {
    const findings = verifyScenePacing(
      [{ start_s: 8, end_s: 12 }],
      {
        master_clock: "voiceover",
        defaults: {
          sections: [
            { label: "setup", start_s: 0, end_s: 10 },
            { label: "turn", start_s: 10, end_s: 20 },
          ],
        },
      },
    );

    expect(findings).toEqual([]);
  });
});
