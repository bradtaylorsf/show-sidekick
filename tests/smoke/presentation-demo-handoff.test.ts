import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import type { PublishLog } from "../../src/artifacts/index.js";
import { readPublishLog } from "../../src/artifacts/index.js";
import { createBuildHandler } from "../../src/cli/commands/build.js";
import { createInitHandler } from "../../src/cli/commands/init.js";
import type { CliIo } from "../../src/cli/commands/stub.js";
import { createProgram } from "../../src/cli/program.js";
import { projectDir } from "../../src/checkpoints/paths.js";
import type { Dispatcher } from "../../src/harness/index.js";
import { Registry } from "../../src/registry/index.js";
import { bundledRoot, computeBundledChecksum, copyBundledInto } from "../../src/version/bundled.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("presentation-demo handoff smoke", () => {
  it("initializes, builds, and exports the sample deck handoff package", async () => {
    const root = path.join(tmpdir(), `show-sidekick-presentation-handoff-${randomUUID()}`);
    scratchDirs.push(root);
    await mkdir(root, { recursive: true });
    process.chdir(root);

    await createInitHandler(captureIo().io, {
      bundledRoot,
      copyBundledInto: (target) => copyBundledInto(target, bundledRoot()),
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot()),
      cwd: () => root,
      setupRuntimes: async () => undefined,
      now: () => new Date("2026-05-23T12:00:00.000Z"),
    })(command({ starter: "presentation-demo", setupRuntimes: false }));

    const buildIo = captureIo();
    await createBuildHandler(buildIo.io, {
      registryFactory: async () => new Registry({ tools: [] }),
      dispatcherFactory: async () => presentationDemoDispatcher(root),
      reviewer: async (stageSlug, _artifact, ctx) => ({
        stage: stageSlug,
        round: ctx.round,
        decision: "pass",
        findings: [],
        summary: {
          critical: 0,
          suggestions: 0,
          nitpicks: 0,
          investigations: 0,
          success_criteria_met: 1,
          success_criteria_total: 1,
        },
      }),
      now: () => new Date("2026-05-23T12:00:00.000Z"),
    })("presentation-demo/sample-episode", command({ json: true, sample: true, providerProfile: "paid-demo" }));

    expect(parseEvents(buildIo.output().stdout)).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: "build_finished", status: "completed" })]),
    );

    const premiereOutput = captureProgram();
    await premiereOutput.program.parseAsync(
      ["node", "showkick", "--json", "export", "presentation-demo/sample-episode", "--target", "premiere", "--overwrite"],
      { from: "node" },
    );
    const premiereEvent = parseEvents(premiereOutput.output().stdout).find((event) => event.event === "exported");
    expect(premiereEvent).toMatchObject({ target: "premiere" });

    const publishLog = (await readPublishLog(root, "presentation-demo", "sample-episode")) as PublishLog;
    const premierePackage = path.join(root, "exports", "presentation-demo__sample-episode.premiere");
    expect(existsSync(path.join(premierePackage, "timeline.xml"))).toBe(true);
    expect(existsSync(path.join(premierePackage, "source", "deck_manifest.json"))).toBe(true);
    expect(existsSync(path.join(premierePackage, "metadata", "edit_decisions.json"))).toBe(true);
    expect(existsSync(path.join(premierePackage, "metadata", "render_report.json"))).toBe(true);
    expect(await readdir(path.join(premierePackage, "source", "slides"))).not.toEqual([]);
    expect(publishLog.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "deck_manifest" }),
        expect.objectContaining({ kind: "slide_screenshots" }),
        expect.objectContaining({ kind: "rendered_video" }),
      ]),
    );
    expect(publishLog.metadata).toMatchObject({
      target: "premiere",
      deck_asset_link_mode: "copy",
    });
    expect(String(publishLog.metadata?.captions_path)).toBe(
      path.join(String(publishLog.metadata?.package_path), "captions", "word_timings.json"),
    );
    expect((publishLog.metadata as { deck_asset_paths?: unknown[] }).deck_asset_paths?.length).toBe(2);

    const edlOutput = captureProgram();
    await edlOutput.program.parseAsync(
      ["node", "showkick", "--json", "export", "presentation-demo/sample-episode", "--format", "edl", "--overwrite"],
      { from: "node" },
    );
    expect(parseEvents(edlOutput.output().stdout)).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: "exported", target: "edl" })]),
    );
    expect(existsSync(path.join(root, "exports", "presentation-demo__sample-episode.edl", "timeline.edl"))).toBe(true);
  }, 30_000);
});

function presentationDemoDispatcher(root: string): Dispatcher {
  return async (ctx) => {
    const workspace = projectDir(root, ctx.show.slug, ctx.episode.slug);
    const deckDir = path.join(workspace, "deck");
    const slidesDir = path.join(deckDir, "slides");
    const audioPath = path.join(workspace, "audio", "narration.wav");
    const renderPath = path.join(workspace, "renders", "paid-sample.mp4");

    await mkdir(slidesDir, { recursive: true });
    await mkdir(path.dirname(audioPath), { recursive: true });
    await mkdir(path.dirname(renderPath), { recursive: true });
    await writeFile(path.join(deckDir, "source.pdf"), await readFile(path.join(root, "shows", "presentation-demo", "inputs", "sample-episode", "deck.pdf")));
    await writeFile(path.join(slidesDir, "slide-001.png"), "slide-001", "utf8");
    await writeFile(path.join(slidesDir, "slide-002.png"), "slide-002", "utf8");
    await writeFile(audioPath, "audio", "utf8");
    await writeFile(renderPath, "render", "utf8");

    return {
      artifact: artifactForStage(ctx.stage.produces, ctx.show.slug, ctx.episode.slug),
      cost_used: { stage_cost_usd: 0, total_so_far_usd: 0, budget_remaining_usd: 2 },
      cost_entries: [],
      decisions: [],
    };
  };
}

function artifactForStage(produces: string, show: string, episode: string): unknown {
  switch (produces) {
    case "brief":
      return {
        title: "Sample Presentation Demo",
        audience: "demo reviewer",
        platform: "web video",
        tone: "clear",
        duration_s: 20,
        hook: "Deck to animated handoff.",
        key_points: ["package deck assets", "export NLE handoff"],
      };
    case "deck_manifest":
      return deckManifest(show, episode);
    case "script":
      return {
        sections: [
          scriptSection("slide-001", 0, 10, "The deck is source material for an animated demo."),
          scriptSection("slide-002", 10, 20, "The export keeps slides, captions, and edit decisions together."),
        ],
      };
    case "cuesheet":
      return cuesheet(show, episode);
    case "scene_plan":
      return {
        scenes: [
          scene("slide-001", 0, 10),
          scene("slide-002", 10, 20),
        ],
      };
    case "asset_manifest":
      return {
        assets: [
          { id: "deck_slide_slide_001", kind: "image", path: `projects/${show}/${episode}/deck/slides/slide-001.png` },
          { id: "deck_slide_slide_002", kind: "image", path: `projects/${show}/${episode}/deck/slides/slide-002.png` },
        ],
      };
    case "edit_decisions":
      return {
        cuts: [
          { start_s: 0, end_s: 10, asset_id: "deck_slide_slide_001", scene_id: "slide-001", slide_id: "slide-001" },
          { start_s: 10, end_s: 20, asset_id: "deck_slide_slide_002", scene_id: "slide-002", slide_id: "slide-002" },
        ],
        overlays: [],
        audio: { music: { track_path: `projects/${show}/${episode}/audio/narration.wav` } },
        render_runtime: "remotion",
        renderer_family: "explainer-data",
      };
    case "render_report":
      return {
        output_path: `projects/${show}/${episode}/renders/paid-sample.mp4`,
        encoding_profile: "h264-aac",
        duration_s: 20,
        resolution: { width: 1920, height: 1080 },
        framerate: 30,
        runtime_used: "remotion",
        asset_count: 2,
        warnings: [],
        validation_steps: [{ name: "handoff_smoke", status: "pass" }],
      };
    case "publish_log":
      return { outputs: [], metadata: { sample: true } };
    default:
      return { ok: true };
  }
}

function deckManifest(show: string, episode: string): unknown {
  return {
    source: {
      kind: "pdf",
      file_type: "pdf",
      source_path: `shows/${show}/inputs/${episode}/deck.pdf`,
      working_file_path: `projects/${show}/${episode}/deck/source.pdf`,
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      byte_size: 1360,
    },
    slides: [
      deckSlide(show, episode, "slide-001", 1),
      deckSlide(show, episode, "slide-002", 2),
    ],
    extraction: {
      text_engine: "fixture",
      notes_engine: "fixture",
      screenshot_engine: "fixture",
      extracted_at: "2026-05-23T12:00:00.000Z",
      warnings: [],
    },
  };
}

function deckSlide(show: string, episode: string, id: string, order: number): unknown {
  return {
    id,
    order,
    image_path: `projects/${show}/${episode}/deck/slides/${id}.png`,
    image: { width: 640, height: 360 },
    text: `Slide ${order}`,
    text_source: "native",
    speaker_notes: `Speaker note ${order}`,
    notes_source: "operator",
    warnings: [],
    source: { slide_number: order },
  };
}

function scriptSection(slideId: string, startS: number, endS: number, narration: string): unknown {
  return {
    slug: slideId,
    role: startS === 0 ? "hook" : "resolution",
    start_s: startS,
    end_s: endS,
    narration,
    dialogue: [],
    enhancement_cues: [],
    slide_ids: [slideId],
    vo_source: "operator",
  };
}

function cuesheet(show: string, episode: string): unknown {
  return {
    audio: {
      path: `projects/${show}/${episode}/audio/narration.wav`,
      duration_s: 20,
      sample_rate: 48000,
      channels: 2,
    },
    master_clock: "voiceover",
    words: [
      { text: "The", start_s: 0, end_s: 0.2, confidence: 1 },
      { text: "deck", start_s: 0.2, end_s: 0.5, confidence: 1 },
    ],
    segments: [{ start_s: 0, end_s: 20, text: "The deck", words: [] }],
    sections: [{ label: "sample", start_s: 0, end_s: 20, kind: "vocal", energy: 0.8 }],
    beats: [],
    climax: [],
    scene_anchors: [
      { scene_id: "slide-001", start_s: 0, end_s: 10, snapped_to: "word", slide_ids: ["slide-001"], source: { section: "slide-001" } },
      { scene_id: "slide-002", start_s: 10, end_s: 20, snapped_to: "word", slide_ids: ["slide-002"], source: { section: "slide-002" } },
    ],
  };
}

function scene(slideId: string, startS: number, endS: number): unknown {
  return {
    slug: slideId,
    order: startS === 0 ? 0 : 1,
    start_s: startS,
    end_s: endS,
    narrative_role: startS === 0 ? "hook" : "resolution",
    scene_anchor: slideId,
    slide_id: slideId,
    slide_ids: [slideId],
    treatment: "zoom_pan",
    required_assets: [{ id: `deck_slide_${slideId.replace("-", "_")}`, source: "supplied" }],
  };
}

function captureIo(): { io: CliIo; output: () => { stdout: string; stderr: string } } {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: {
        write: (value: string) => {
          stdout += value;
          return true;
        },
      },
      stderr: {
        write: (value: string) => {
          stderr += value;
          return true;
        },
      },
    },
    output: () => ({ stdout, stderr }),
  };
}

function captureProgram() {
  const { io, output } = captureIo();
  return {
    program: createProgram(io),
    output,
  };
}

function command(options: Record<string, unknown>): Command {
  return {
    optsWithGlobals: () => options,
  } as unknown as Command;
}

function parseEvents(stdout: string): Array<Record<string, unknown>> {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
