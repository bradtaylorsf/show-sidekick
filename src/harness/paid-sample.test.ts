import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readCheckpoint } from "../checkpoints/index.js";
import { readCostLog } from "../cost/tracker.js";
import { readDecisionLog } from "../decisions/store.js";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import { defineTool, Registry, type Tool } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { createPaidSampleDispatcher } from "./paid-sample.js";
import { Runner, type StageReviewer } from "./runner.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("paid sample dispatcher", () => {
  it("calls provider tools through the Runner and records assets, costs, decisions, and nested final_review", async () => {
    const root = await scratchProject();
    const show = loadedShow(root);
    const episode = loadedEpisode(show);
    const pipeline = pipelineManifest();

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "paid-demo",
      registry: new Registry({ tools: paidSampleTools(root) }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readFile(path.join(root, "projects", "show", "episode", "assets", "openai-sample.png"), "utf8")).resolves.toBe(
      "image",
    );
    await expect(readFile(path.join(root, "projects", "show", "episode", "audio", "narration.mp3"), "utf8")).resolves.toBe(
      "audio",
    );
    await expect(readFile(path.join(root, "projects", "show", "episode", "clips", "higgsfield-sample.mp4"), "utf8")).resolves.toBe(
      "clip",
    );
    await expect(readCostLog(root, "show", "episode")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: "openai_image", provider: "openai", usd: 0.04, mode: "sample" }),
        expect.objectContaining({ tool: "elevenlabs_tts", provider: "elevenlabs", usd: 0.0003, mode: "sample" }),
        expect.objectContaining({ tool: "higgsfield", provider: "higgsfield", usd: 0.3, mode: "sample" }),
      ]),
    );
    await expect(readDecisionLog({ show: "show", episode: "episode" }, { root })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "provider_selection", picked: "openai" }),
        expect.objectContaining({ category: "provider_selection", picked: "higgsfield" }),
        expect.objectContaining({ category: "voice_selection", picked: "elevenlabs_tts" }),
      ]),
    );
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({
      artifact: {
        output_path: expect.stringContaining("paid-sample.mp4"),
        final_review: {
          status: "pass",
          checks: {
            promise_preservation: {
              render_runtime_used: "ffmpeg",
            },
          },
        },
      },
    });
  });

  it("records zero-cost Higgsfield cache hits", async () => {
    const root = await scratchProject();
    const show = loadedShow(root);
    const episode = loadedEpisode(show);
    const pipeline = pipelineManifest();

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "paid-demo",
      registry: new Registry({ tools: paidSampleTools(root, { higgsfieldCacheHit: true }) }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCostLog(root, "show", "episode")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "higgsfield",
          units: 0,
          usd: 0,
          mode: "sample",
          cache_hit: true,
        }),
      ]),
    );
    await expect(readDecisionLog({ show: "show", episode: "episode" }, { root })).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "budget_tradeoff", picked: "higgsfield_cache_hit" })]),
    );
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-paid-sample-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await mkdir(path.join(root, "shows", "show", "episodes"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writeFile(path.join(root, "shows", "show", "episodes", "episode.yaml"), "slug: episode\n", "utf8");
  return root;
}

function loadedShow(projectRoot: string): LoadedShow {
  return {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-12T00:00:00Z"),
    pipelines: {
      "paid-demo": {
        runtime: "ffmpeg",
        aspect: "16:9",
      },
    },
    defaults: {
      pipeline: "paid-demo",
    },
    projectRoot,
    rootDir: path.join(projectRoot, "shows", "show"),
  };
}

function loadedEpisode(show: LoadedShow): LoadedEpisode {
  return {
    slug: "episode",
    title: "Paid Sample",
    created: new Date("2026-05-12T00:00:00Z"),
    pipeline: "paid-demo",
    runtime: "ffmpeg",
    aspect: "16:9",
    inputs: {
      narration: "A concise narration fixture for the paid sample dispatcher.",
    },
    cast: [],
    filePath: path.join(show.rootDir, "episodes", "episode.yaml"),
  };
}

function pipelineManifest(): PipelineManifest {
  return {
    slug: "paid-demo",
    sample_support: "paid",
    master_clock: "voiceover",
    sample: {
      duration_s_min: 12,
      duration_s_max: 18,
      max_scenes: 3,
      max_cost_usd: 1,
    },
    orchestration: {
      budget_default_usd: 1,
      cost_drift_threshold: 10,
      max_revisions_per_stage: 0,
      max_send_backs: 0,
      max_wall_time_minutes: 5,
    },
    stages: [stage("assets", "asset_manifest"), stage("edit", "edit_decisions"), stage("compose", "render_report")],
  };
}

function stage(slug: string, produces: string): Stage {
  return {
    slug,
    skill: `pipelines/paid-demo/${slug}.md`,
    produces,
    produces_artifacts: produces === "render_report" ? ["render_report", "final_review"] : [produces],
    required_artifacts_in: [],
    optional_artifacts_in: [],
    required_tools: [],
    optional_tools: [],
    tools_available: [],
    review_focus: [],
    success_criteria: [],
    human_approval: "never",
    estimated_cost: {
      sample: { usd: slug === "assets" ? 0.35 : 0 },
      full: { usd: slug === "assets" ? 2 : 0 },
    },
  };
}

function paidSampleTools(root: string, options: { higgsfieldCacheHit?: boolean } = {}): Tool[] {
  const imagePath = path.join(root, "fixtures", "openai.png");
  const audioPath = path.join(root, "fixtures", "narration.mp3");
  const clipPath = path.join(root, "fixtures", "clip.mp4");

  return [
    fixtureTool("openai_image", "image_generation", "openai", 0.04, async () => {
      await writeFixture(imagePath, "image");
      return { image_path: imagePath, provider: "openai", model: "gpt-image-1", cost_usd: 0.04 };
    }),
    fixtureTool("elevenlabs_tts", "tts", "elevenlabs", 0.0003, async () => {
      await writeFixture(audioPath, "audio");
      return { audio_path: audioPath, provider: "elevenlabs", model: "eleven_multilingual_v2", cost_usd: 0.0003 };
    }),
    fixtureTool("higgsfield", "image_to_video", "higgsfield", 0.3, async () => {
      await writeFixture(clipPath, "clip");
      return { video_path: clipPath, cost_usd: options.higgsfieldCacheHit ? 0 : 0.3, cache_hit: options.higgsfieldCacheHit === true };
    }),
    fixtureTool("ffmpeg", "video_compose", "ffmpeg", 0, async () => {
      const outputPath = path.join(root, "projects", "show", "episode", "renders", "paid-sample.mp4");
      await writeFixture(outputPath, "render");
      return {
        output_path: outputPath,
        encoding_profile: "ffmpeg/h264-aac",
        duration_s: 15,
        resolution: { width: 1920, height: 1080 },
        framerate: 30,
        runtime_used: "ffmpeg",
        asset_count: 3,
        warnings: [],
        validation_steps: [],
      };
    }),
  ];
}

function fixtureTool(
  name: string,
  capability: string,
  provider: string,
  usd: number,
  execute: () => Promise<unknown>,
): Tool {
  return defineTool({
    name,
    capability,
    provider,
    status: "production",
    integration: { kind: "library", package: "fixture", install: "none" },
    best_for: `${name} fixture`,
    cost: usd > 0 ? { unit: "call", usd } : undefined,
    input: z.unknown(),
    output: z.unknown(),
    execute,
  });
}

async function writeFixture(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

const passReviewer: StageReviewer = (stageSlug, _artifact, ctx) => ({
  stage: stageSlug,
  round: ctx.round ?? 0,
  decision: "pass",
  findings: [],
  summary: {
    critical: 0,
    suggestions: 0,
    nitpicks: 0,
    investigations: 0,
    success_criteria_met: 0,
    success_criteria_total: 0,
  },
});

function fixedNow(): Date {
  return new Date("2026-05-12T15:42:00.000Z");
}

function captureIo() {
  return {
    io: {
      stdout: { write: () => true },
      stderr: { write: () => true },
    },
  };
}
