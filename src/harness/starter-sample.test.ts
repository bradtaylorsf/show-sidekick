import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { CuesheetSchema } from "../artifacts/cuesheet.js";
import { PipelineManifestSchema } from "../pipelines/manifest.js";
import { defineTool, Registry } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { createStageContext } from "./context.js";
import { createStarterSampleDispatcher } from "./starter-sample.js";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describe("starter sample dispatcher", () => {
  it("renders zero-key animated-explainer samples with Remotion when available", async () => {
    const root = await scratchRoot();
    const scriptPath = path.join(root, "script.txt");
    const voicePath = path.join(root, "voice.wav");
    await writeFile(
      scriptPath,
      [
        "Hook: predit can make a useful first video without keys.",
        "You: the agent personalizes this middle beat around the user.",
        "Workflow: script, scenes, runtime, and render stay in one project.",
        "Next: review the sample, then unlock paid providers.",
      ].join("\n"),
      "utf8",
    );
    await writeFile(voicePath, "fake wav", "utf8");

    const registry = new Registry({ tools: [fakeRemotion(root)] });
    const dispatcher = createStarterSampleDispatcher();
    const result = await dispatcher(
      createStageContext({
        show: show(root),
        episode: episode(root, scriptPath, voicePath),
        pipeline,
        stage: pipeline.stages.find((stage) => stage.slug === "compose") ?? pipeline.stages[0],
        playbook: undefined,
        registry,
        runOptions: { sample: true },
      }),
    );

    const render = result.artifact as {
      runtime_used: string;
      duration_s: number;
      output_path: string;
      final_review?: { checks?: { audio_spotcheck?: { narration_present?: boolean } } };
    };
    expect(render.runtime_used).toBe("remotion");
    expect(render.duration_s).toBe(30);
    expect(render.output_path).toBe("projects/first-video/sample-episode/renders/sample-preview.mp4");
    expect(render.final_review?.checks?.audio_spotcheck?.narration_present).toBe(true);
    expect(result.decisions).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "render_runtime_selection", picked: "remotion" })]),
    );
    await expect(readFile(path.join(root, render.output_path))).resolves.toBeInstanceOf(Buffer);
    const cuesheet = CuesheetSchema.parse(
      JSON.parse(await readFile(path.join(root, "projects", "first-video", "sample-episode", "cuesheet.json"), "utf8")),
    );
    expect(cuesheet.master_clock).toBe("voiceover");
    expect(cuesheet.audio.path).toBe("voice.wav");
  });

  it("produces proposal and publish artifacts for the full animated-explainer starter path", async () => {
    const root = await scratchRoot();
    const scriptPath = path.join(root, "script.txt");
    const voicePath = path.join(root, "voice.wav");
    await writeFile(scriptPath, "Hook: start free.\nYou: make it personal.\nWorkflow: render with motion.\nNext: improve it.", "utf8");
    await writeFile(voicePath, "fake wav", "utf8");

    const registry = new Registry({ tools: [fakeRemotion(root)] });
    const dispatcher = createStarterSampleDispatcher();
    const proposal = await dispatcher(
      createStageContext({
        show: show(root),
        episode: episode(root, scriptPath, voicePath),
        pipeline,
        stage: stage("proposal", "proposal_packet"),
        playbook: undefined,
        registry,
        runOptions: { sample: true },
      }),
    );
    const publish = await dispatcher(
      createStageContext({
        show: show(root),
        episode: episode(root, scriptPath, voicePath),
        pipeline,
        stage: stage("publish", "publish_log"),
        playbook: undefined,
        registry,
        runOptions: { sample: true },
      }),
    );

    expect(proposal.artifact).toMatchObject({
      production_plan: {
        render_runtime: "remotion",
        renderer_family: "animation-first",
        audio_architecture: "single_narrator",
        sample_required: true,
      },
      delivery_promise: {
        motion_led: true,
        narration_present: true,
      },
    });
    expect(publish.artifact).toMatchObject({
      outputs: expect.arrayContaining([
        expect.objectContaining({
          path: "projects/first-video/sample-episode/renders/sample-preview.mp4",
          kind: "sample_render",
        }),
      ]),
      metadata: {
        sample: true,
        provider_profile: "zero-key",
        render_runtime: "remotion",
      },
    });
    expect(proposal.decisions?.map((decision) => decision.category)).toEqual(
      expect.arrayContaining([
        "concept_selection",
        "render_runtime_selection",
        "renderer_family_selection",
        "playbook_selection",
        "motion_commitment",
        "music_source",
        "voice_selection",
      ]),
    );
  });

  it("produces deck and slide-aware edit artifacts for presentation-demo samples", async () => {
    const root = await scratchRoot();
    const scriptPath = path.join(root, "script.txt");
    const deckPath = path.join(root, "deck.pdf");
    await writeFile(scriptPath, "Hook: animate the deck.\nSlide flow: add callouts.\nNext: export the handoff.", "utf8");
    await writeFile(deckPath, "%PDF-1.4\n%%EOF\n", "utf8");

    const registry = new Registry({ tools: [fakeRemotion(root)] });
    const dispatcher = createStarterSampleDispatcher();
    const loadedShow = presentationShow(root);
    const loadedEpisode = presentationEpisode(root, scriptPath, deckPath);
    const deck = await dispatcher(
      createStageContext({
        show: loadedShow,
        episode: loadedEpisode,
        pipeline: presentationPipeline,
        stage: stage("capture", "deck_manifest"),
        playbook: undefined,
        registry,
        runOptions: { sample: true },
      }),
    );
    const edit = await dispatcher(
      createStageContext({
        show: loadedShow,
        episode: loadedEpisode,
        pipeline: presentationPipeline,
        stage: stage("edit", "edit_decisions"),
        playbook: undefined,
        registry,
        runOptions: { sample: true },
      }),
    );

    expect(deck.artifact).toMatchObject({
      source: { kind: "pdf", path: "deck.pdf" },
      slide_count: 4,
      slides: expect.arrayContaining([
        expect.objectContaining({ id: "sample_card_1", screenshot_path: "projects/deck-demo/sample-episode/assets/sample-card-1.png" }),
      ]),
    });
    expect(edit.artifact).toMatchObject({
      render_runtime: "remotion",
      renderer_family: "presentation-demo",
      subtitles: { enabled: true, source: "cuesheet.words" },
      cuts: expect.arrayContaining([
        expect.objectContaining({
          scene_type: "slide_image",
          slide_id: "sample_card_1",
          treatment: expect.objectContaining({
            scene_type: "slide_image",
            motion: expect.objectContaining({ kind: "zoom_pan" }),
            callouts: expect.arrayContaining([expect.objectContaining({ position: "bottom-right" })]),
          }),
        }),
      ]),
    });
  });
});

const pipeline = PipelineManifestSchema.parse({
  slug: "animated-explainer",
  display_name: "Animated Explainer",
  master_clock: "voiceover",
  defaults: { render_runtime: "remotion" },
  sample: { duration_s_min: 12, duration_s_max: 30 },
  stages: [
    {
      slug: "compose",
      skill: "pipelines/explainer/compose-director.md",
      produces: "render_report",
      produces_artifacts: ["render_report", "final_review"],
    },
  ],
});

const presentationPipeline = PipelineManifestSchema.parse({
  slug: "presentation-demo",
  display_name: "Presentation Demo",
  master_clock: "voiceover",
  defaults: { render_runtime: "remotion", aspect: "16:9" },
  sample: { duration_s_min: 12, duration_s_max: 30 },
  stages: [
    {
      slug: "capture",
      skill: "pipelines/presentation-demo/capture-director.md",
      produces: "deck_manifest",
      produces_artifacts: ["deck_manifest"],
    },
    {
      slug: "edit",
      skill: "pipelines/presentation-demo/edit-director.md",
      produces: "edit_decisions",
      produces_artifacts: ["edit_decisions"],
    },
  ],
});

function fakeRemotion(root: string) {
  return defineTool({
    name: "remotion",
    capability: "video_compose",
    provider: "remotion",
    status: "beta",
    integration: { kind: "library", package: "remotion", install: "npm install remotion" },
    best_for: "test remotion renderer",
    input: z.unknown(),
    output: z.unknown(),
    isAvailable: async () => ({ available: true }),
    async execute(params) {
      const input = params as { output_path?: string; resolution?: { width: number; height: number } };
      const outputPath = input.output_path ?? path.join(root, "renders", "remotion.mp4");
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]));
      return {
        output_path: path.relative(root, outputPath).split(path.sep).join("/"),
        encoding_profile: "remotion/h264-aac",
        duration_s: 30,
        resolution: input.resolution ?? { width: 1080, height: 1920 },
        framerate: 30,
        runtime_used: "remotion",
        asset_count: 4,
        warnings: [],
        validation_steps: [],
      };
    },
  });
}

function stage(slug: string, produces: string) {
  return {
    slug,
    skill: `pipelines/explainer/${slug}-director.md`,
    produces,
    produces_artifacts: [produces],
  };
}

async function scratchRoot(): Promise<string> {
  const root = path.join(tmpdir(), `predit-starter-sample-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  scratchDirs.push(root);
  return root;
}

function show(root: string): LoadedShow {
  return {
    slug: "first-video",
    display_name: "First Video",
    created: new Date("2026-05-15T12:00:00.000Z"),
    pipelines: { "animated-explainer": { runtime: "remotion", aspect: "9:16" } },
    defaults: { pipeline: "animated-explainer" },
    projectRoot: root,
    rootDir: path.join(root, "shows", "first-video"),
  };
}

function episode(root: string, scriptPath: string, voicePath: string): LoadedEpisode {
  return {
    slug: "sample-episode",
    title: "Sample Episode",
    created: new Date("2026-05-15T12:00:00.000Z"),
    pipeline: "animated-explainer",
    runtime: "remotion",
    aspect: "9:16",
    inputs: {
      script: scriptPath,
      narration_audio: voicePath,
      duration_s: 30,
    },
    cast: [],
    filePath: path.join(root, "shows", "first-video", "episodes", "sample-episode.yaml"),
  };
}

function presentationShow(root: string): LoadedShow {
  return {
    slug: "deck-demo",
    display_name: "Deck Demo",
    created: new Date("2026-05-22T12:00:00.000Z"),
    pipelines: { "presentation-demo": { runtime: "remotion", aspect: "16:9" } },
    defaults: { pipeline: "presentation-demo" },
    projectRoot: root,
    rootDir: path.join(root, "shows", "deck-demo"),
  };
}

function presentationEpisode(root: string, scriptPath: string, deckPath: string): LoadedEpisode {
  return {
    slug: "sample-episode",
    title: "Sample Presentation Demo",
    created: new Date("2026-05-22T12:00:00.000Z"),
    pipeline: "presentation-demo",
    runtime: "remotion",
    aspect: "16:9",
    inputs: {
      deck: deckPath,
      script: scriptPath,
      duration_s: 18,
    },
    cast: [],
    filePath: path.join(root, "shows", "deck-demo", "episodes", "sample-episode.yaml"),
  };
}
