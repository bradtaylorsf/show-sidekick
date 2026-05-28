import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import remotion, { buildRemotionCompositionProps, buildRemotionSlideSceneProps } from "./remotion.js";

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

  it("builds slide scene props from deck, scene plan, and edit decisions", () => {
    const slideScenes = buildRemotionSlideSceneProps({
      fps: 30,
      resolution: { width: 1920, height: 1080 },
      deck_manifest: deckManifest(),
      asset_manifest: {
        assets: [
          {
            id: "deck_slide_slide_001",
            kind: "image",
            path: "captures/slides/slide-001.png",
          },
        ],
      },
      scene_plan: {
        scenes: [
          {
            slug: "slide-001",
            order: 0,
            start_s: 0,
            end_s: 4,
            narrative_role: "hook",
            scene_anchor: "slide-001 voiceover",
            slide_id: "slide-001",
            slide_ids: ["slide-001"],
            treatment: "highlight",
            focus_rect: { x: 0.12, y: 0.18, width: 0.42, height: 0.22 },
            highlights: [{ rect: { x: 0.1, y: 0.16, width: 0.46, height: 0.2 }, label: "evidence" }],
            callouts: [{ text: "Review first", anchor: "right" }],
            caption: "Approved voiceover caption.",
            shot_language: {
              shot_size: "MS",
              camera_movement: "pan_right",
              lighting_key: "soft",
              lens_mm: 35,
              depth_of_field: "deep",
              color_temperature: "daylight",
            },
            required_assets: [{ id: "deck_slide_slide_001", source: "supplied" }],
          },
        ],
      },
      edit_decisions: {
        cuts: [
          {
            start_s: 0,
            end_s: 4,
            asset_id: "deck_slide_slide_001",
            scene_id: "slide-001",
            scene_kind: "slide_scene",
            slide_id: "slide-001",
            motion: { type: "pan_right", zoom_start: 1, zoom_end: 1.1 },
          },
        ],
        overlays: [],
        render_runtime: "remotion",
        renderer_family: "explainer-teacher",
      },
    });

    expect(slideScenes).toEqual([
      expect.objectContaining({
        cutIndex: 0,
        startFrame: 0,
        durationFrames: 120,
        asset_id: "deck_slide_slide_001",
        scene_id: "slide-001",
        props: expect.objectContaining({
          slide_id: "slide-001",
          image_path: "captures/slides/slide-001.png",
          motion: expect.objectContaining({ type: "pan_right", zoom_end: 1.1 }),
          highlights: [expect.objectContaining({ label: "evidence" })],
          callouts: [expect.objectContaining({ text: "Review first" })],
        }),
      }),
    ]);
  });

  it("uses cut captions instead of provider prompts and suppresses duplicate scene copy", () => {
    const narration = "They told you Mom is coming home tomorrow, and you do not feel ready.";
    const props = buildRemotionCompositionProps({
      fps: 30,
      resolution: { width: 1080, height: 1920 },
      asset_manifest: {
        assets: [
          {
            id: "paid_sample_clip",
            kind: "video",
            path: "projects/show/episode/clips/higgsfield-sample.mp4",
            prompt: 'Animate "Hook" as a short explainer-teacher animated explainer beat.',
          },
        ],
      },
      edit_decisions: {
        cuts: [
          {
            start_s: 0,
            end_s: 4,
            asset_id: "paid_sample_clip",
            caption: narration,
          },
        ],
        overlays: [],
        render_runtime: "remotion",
        renderer_family: "explainer-teacher",
      },
    });

    expect(props.width).toBe(1080);
    expect(props.height).toBe(1920);
    expect(props.cuts[0]).toMatchObject({
      label: narration,
      caption: narration,
      showSceneCopy: false,
    });
    expect(props.showBeatCounter).toBe(false);
    expect(props.captions.map((word) => word.text).join(" ")).toBe(narration);
    expect(JSON.stringify(props)).not.toContain("short explainer-teacher");
  });

  it("keeps the beat counter opt-in for debug renders", () => {
    const props = buildRemotionCompositionProps({
      fps: 30,
      debug_overlay: "beats",
      edit_decisions: {
        cuts: [{ start_s: 0, end_s: 4, asset_id: "paid_sample_clip" }],
        overlays: [],
        render_runtime: "remotion",
        renderer_family: "explainer-teacher",
      },
    });

    expect(props.showBeatCounter).toBe(true);
  });

  it("maps resolved compose recipe overlays into Remotion composition props", () => {
    const props = buildRemotionCompositionProps({
      fps: 30,
      edit_decisions: {
        cuts: [{ start_s: 0, end_s: 2, asset_id: "paid_sample_clip", caption: "Script owned captions." }],
        overlays: [
          {
            component: "hero_title",
            registry: "overlay",
            props: {
              title: "SHOW",
              subtitle: "Episode",
              fps: 30,
              duration_frames: 60,
            },
            timeline: { from_s: 0, to_s: "end" },
          },
          {
            component: "caption_burn",
            registry: "overlay",
            props: {
              words: [{ text: "Script", start_s: 0, end_s: 0.5, confidence: 1 }],
              style: {
                position: "center",
                font_family: "Helvetica Neue",
                background: "rgba(30, 64, 175, 0.85)",
              },
              fps: 30,
              duration_frames: 60,
            },
            timeline: { sync: "script" },
          },
        ],
        render_runtime: "remotion",
        renderer_family: "explainer-teacher",
      },
    });

    expect(props.overlays).toHaveLength(2);
    expect(props.overlays[0]).toMatchObject({
      component: "hero_title",
      registry: "overlay",
      startFrame: 0,
      durationFrames: 60,
      captionBurn: false,
    });
    expect(JSON.stringify(props.overlays[0]?.node)).toContain("overlay_hero_title");
    expect(props.overlays[1]).toMatchObject({
      component: "caption_burn",
      captionBurn: true,
    });
    expect(props.overlays[1]?.node).toBeDefined();
    expect(JSON.stringify(props.overlays[1]?.node)).toContain('"position":"center"');
    expect(JSON.stringify(props.overlays[1]?.node)).toContain("Helvetica Neue");
  });

  it("refuses to compose when edit decisions lock another runtime", async () => {
    await expect(
      remotion.execute(
        {
          output_path: "renders/remotion.mp4",
          edit_decisions: {
            cuts: [{ start_s: 0, end_s: 2, asset_id: "hero" }],
            overlays: [],
            render_runtime: "hyperframes",
            renderer_family: "explainer-data",
          },
        },
        testContext(),
      ),
    ).rejects.toThrow(/refuses runtime swap/u);
  });
});

function deckManifest() {
  return {
    source: {
      kind: "pptx" as const,
      file_type: "pptx" as const,
      source_path: "/tmp/source.pptx",
      working_file_path: "projects/show/episode/deck/source.pptx",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      byte_size: 1024,
    },
    slides: [
      {
        id: "slide-001",
        order: 1,
        image_path: "captures/slides/slide-001.png",
        image: { width: 1920, height: 1080 },
        text: "Slide text",
        text_source: "native" as const,
        notes_source: "pptx_notes" as const,
        warnings: [],
        source: { slide_number: 1 },
      },
    ],
    extraction: {
      screenshot_engine: "deck-renderer",
      warnings: [],
    },
  };
}

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
