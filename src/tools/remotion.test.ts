import { describe, expect, it } from "vitest";
import remotion from "./remotion.js";

describe("remotion tool", () => {
  it("records caption sync and shared style bridge validation steps", async () => {
    const result = await remotion.execute(
      {
        output_path: "renders/remotion.mp4",
        fps: 30,
        edit_decisions: {
          cuts: [{ start_s: 0, end_s: 2, asset_id: "hero" }],
          overlays: [],
          render_runtime: "remotion",
          renderer_family: "explainer-data",
        },
        cuesheet: {
          audio: {
            path: "/tmp/voiceover.wav",
            duration_s: 2,
            sample_rate: 48_000,
            channels: 1,
          },
          master_clock: "voiceover",
          segments: [
            {
              start_s: 0,
              end_s: 1,
              text: "Hello world",
              words: [
                { text: "Hello", start_s: 0, end_s: 0.5, confidence: 0.99 },
                { text: "world", start_s: 0.5, end_s: 1.0, confidence: 0.99 },
              ],
            },
          ],
          sections: [{ label: "voiceover", start_s: 0, end_s: 2, kind: "vocal", energy: 0.8 }],
          beats: [],
          climax: [],
          scene_anchors: [],
        },
        playbook: {
          palette: { primary: "#2dd4bf" },
          typography: { display: "Inter Tight" },
          motion: { fast_ms: 180 },
          caption_style: { active_fill: "#2dd4bf" },
        },
      },
      testContext(),
    );

    expect(result.runtime_used).toBe("remotion");
    expect(result.validation_steps).toEqual([
      {
        name: "caption_sync",
        notes: "2 words checked; max drift 0s at 30fps.",
        status: "pass",
      },
      {
        name: "style_bridge",
        notes: "Playbook palette, typography, motion, and caption style resolved through the shared CSS bridge.",
        status: "pass",
      },
    ]);
  });
});

function testContext() {
  return {
    projectRoot: "/tmp/predit-remotion-test",
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
