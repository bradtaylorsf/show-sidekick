import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import remotion from "./remotion.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("remotion tool", () => {
  it("reports available when Remotion is installed in the user project", async () => {
    const projectRoot = await scratchProject();
    await mkdir(path.join(projectRoot, "node_modules", "remotion"), { recursive: true });
    await writeFile(path.join(projectRoot, "node_modules", "remotion", "package.json"), '{"name":"remotion"}\n', "utf8");
    await writeFile(path.join(projectRoot, "node_modules", "remotion", "index.js"), "module.exports = {};\n", "utf8");

    await expect(remotion.isAvailable({ projectRoot })).resolves.toEqual({ available: true });
  });

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

  it("generates presentation-demo Remotion props and render-report timing without rendering", async () => {
    const result = await remotion.execute(
      {
        output_path: "renders/presentation-demo.mp4",
        fps: 30,
        deck_manifest: deckManifest(),
        edit_decisions: {
          cuts: [
            {
              start_s: 0,
              end_s: 3,
              asset_id: "slide-1",
              slide_id: "slide-1",
              treatment: {
                scene_type: "slide_image",
                motion: { kind: "zoom_pan", start_zoom: 1, end_zoom: 1.07 },
                highlights: [{ rect: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 }, label: "Metric" }],
                callouts: [{ text: "Explain the metric in narration." }],
              },
            },
          ],
          overlays: [],
          subtitles: { enabled: true, source: "captions/words.json" },
          render_runtime: "remotion",
          renderer_family: "presentation-demo",
        },
        cuesheet: cuesheet(),
      },
      testContext(),
    );

    expect(result).toMatchObject({
      runtime_used: "remotion",
      output_path: "renders/presentation-demo.mp4",
      duration_s: 3,
      expected_duration_s: 3,
      drift_s: 0,
      drift_frames: 0,
      within_tolerance: true,
      asset_count: 1,
    });
    expect(result.validation_steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "caption_sync", status: "pass" }),
        expect.objectContaining({
          name: "presentation_demo_composition",
          status: "pass",
          notes: expect.stringContaining("1 slide-based scene"),
        }),
      ]),
    );
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

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-remotion-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

function deckManifest() {
  return {
    source: { kind: "pdf" as const, path: "inputs/deck.pdf" },
    slide_count: 1,
    slides: [{ id: "slide-1", index: 0, screenshot_path: "slides/slide-1.png", title: "Metric" }],
  };
}

function cuesheet() {
  return {
    audio: {
      path: "/tmp/voiceover.wav",
      duration_s: 3,
      sample_rate: 48_000,
      channels: 1,
    },
    master_clock: "voiceover" as const,
    words: [{ text: "Metric", start_s: 0, end_s: 0.5, confidence: 0.99 }],
    segments: [
      {
        start_s: 0,
        end_s: 3,
        text: "Metric",
        words: [{ text: "Metric", start_s: 0, end_s: 0.5, confidence: 0.99 }],
      },
    ],
    sections: [{ label: "voiceover", start_s: 0, end_s: 3, kind: "vocal" as const, energy: 0.8 }],
    beats: [],
    climax: [],
    scene_anchors: [],
  };
}
