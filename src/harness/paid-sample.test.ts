import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { readCheckpoint, writeCheckpoint, type CheckpointStatus } from "../checkpoints/index.js";
import { readCostLog } from "../cost/tracker.js";
import { readDecisionLog } from "../decisions/store.js";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import { defineTool, Registry, type Tool } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import ttsSelector from "../tools/tts-selector.js";
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

  it("uses Higgsfield still generation instead of code snippets when OpenAI images are unavailable", async () => {
    const root = await scratchProject();
    const show = loadedShow(root);
    const episode = loadedEpisode(show);
    const pipeline = pipelineManifest();
    const codeSnippetInputs: unknown[] = [];
    const higgsfieldImageInputs: unknown[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "paid-demo",
      registry: new Registry({
        tools: paidSampleTools(root, {
          includeCodeSnippet: true,
          includeHiggsfieldImage: true,
          includeOpenAiImage: false,
          onCodeSnippetInput: (input) => codeSnippetInputs.push(input),
          onHiggsfieldImageInput: (input) => higgsfieldImageInputs.push(input),
        }),
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(codeSnippetInputs).toEqual([]);
    expect(higgsfieldImageInputs[0]).toMatchObject({
      prompt: expect.stringContaining("Asset type: 16:9 keyframe"),
    });
    await expect(readCheckpoint(root, "show", "episode", "assets")).resolves.toMatchObject({
      artifact: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "paid_sample_image", provider: "higgsfield", model: "gpt_image_2" }),
          expect.objectContaining({ id: "paid_sample_clip", provider: "higgsfield", model: "seedance_2_0" }),
        ]),
      },
    });
  });

  it("drafts presentation-demo scripts from deck slides with slide references and source priority", async () => {
    const root = await scratchProject();
    const show = presentationDemoShow(root);
    const episode = presentationDemoEpisode(show, { operator_notes: "Operator fallback should only be used after slide evidence." });
    const pipeline = presentationDemoPipeline([
      stage("capture", "deck_manifest"),
      { ...stage("script", "script"), required_artifacts_in: ["deck_manifest"], human_approval: "required" },
    ]);
    await writeStageCheckpoint(root, "capture", "completed", deckManifestWithNotes());

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "presentation-demo",
      registry: new Registry({ tools: [] }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: false, provider_profile: "paid-demo", nonInteractive: true, from: "script" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("awaiting_human");
    await expect(readCheckpoint(root, "show", "episode", "script")).resolves.toMatchObject({
      status: "awaiting_human",
      artifact: {
        sections: [
          expect.objectContaining({
            slug: "slide-001",
            slide_ids: ["slide-001"],
            vo_source: "pptx_notes",
            narration: expect.stringContaining("teams already have strong deck material"),
            enhancement_cues: expect.arrayContaining([
              "Voiceover source priority: pptx_notes > slide_text/OCR > operator > agent.",
            ]),
          }),
          expect.objectContaining({
            slug: "slide-002",
            slide_ids: ["slide-002"],
            vo_source: "pptx_notes",
          }),
        ],
      },
    });
  });

  it("captures a presentation-demo fixture deck into a manifest with slide screenshots", async () => {
    const root = await scratchProject();
    const show = presentationDemoShow(root);
    const deckPath = path.join(root, "shows", "show", "inputs", "episode", "deck.pdf");
    const episode = presentationDemoEpisode(show, { deck_source: "shows/show/inputs/episode/deck.pdf" });
    const pipeline = presentationDemoPipeline([stage("capture", "deck_manifest")]);
    await writeFixture(deckPath, "%PDF-1.7\n1 0 obj\n<< /Type /Pages /Count 2 >>\nendobj\n%%EOF\n");

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "presentation-demo",
      registry: new Registry({ tools: [] }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: false, provider_profile: "paid-demo", nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCheckpoint(root, "show", "episode", "capture")).resolves.toMatchObject({
      artifact: {
        source: {
          file_type: "pdf",
          source_path: "shows/show/inputs/episode/deck.pdf",
          working_file_path: "projects/show/episode/deck/source.pdf",
          byte_size: expect.any(Number),
        },
        slides: [
          expect.objectContaining({ id: "slide-001", image_path: "projects/show/episode/deck/slides/slide-001.png" }),
          expect.objectContaining({ id: "slide-002", image_path: "projects/show/episode/deck/slides/slide-002.png" }),
        ],
        extraction: {
          screenshot_engine: "paid-sample-fixture",
          extracted_at: fixedNow().toISOString(),
        },
      },
    });
    expect(existsSync(path.join(root, "projects", "show", "episode", "deck", "source.pdf"))).toBe(true);
    expect(existsSync(path.join(root, "projects", "show", "episode", "deck", "slides", "slide-001.png"))).toBe(true);
  });

  it("blocks presentation-demo TTS when the script checkpoint is still awaiting approval", async () => {
    const root = await scratchProject();
    const show = presentationDemoShow(root);
    const episode = presentationDemoEpisode(show);
    const pipeline = presentationDemoPipeline([
      { ...stage("script", "script"), human_approval: "required" },
      { ...stage("cuesheet", "cuesheet"), required_artifacts_in: ["script"], optional_artifacts_in: ["deck_manifest"] },
    ]);
    const ttsInputs: unknown[] = [];
    await writeStageCheckpoint(root, "script", "awaiting_human", approvedSlideScript());

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "presentation-demo",
      registry: new Registry({
        tools: [
          ttsSelector,
          fixtureTool("openai_tts", "tts", "openai", 0.000015, async (input) => {
            ttsInputs.push(input);
            return { audio_path: path.join(root, "fixtures", "narration.mp3"), provider: "openai", model: "gpt-4o-mini-tts", cost_usd: 0.000015 };
          }),
        ],
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: false, provider_profile: "paid-demo", nonInteractive: true, from: "cuesheet" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    expect(ttsInputs).toHaveLength(0);
    await expect(readCheckpoint(root, "show", "episode", "cuesheet")).resolves.toMatchObject({
      status: "failed",
      artifact: {
        error: expect.stringContaining("requires script checkpoint status completed"),
        last_cost_entries: [],
      },
      tool_invocations: [],
    });
  });

  it("generates approved presentation-demo narration through registry TTS and writes slide timing anchors", async () => {
    const root = await scratchProject();
    const show = presentationDemoShow(root);
    const episode = presentationDemoEpisode(show, { voice_id: "alloy", tts_provider: "openai" });
    const pipeline = presentationDemoPipeline([
      { ...stage("script", "script"), human_approval: "required" },
      { ...stage("cuesheet", "cuesheet"), required_artifacts_in: ["script"], optional_artifacts_in: ["deck_manifest"] },
    ]);
    const ttsInputs: unknown[] = [];
    const audioPath = path.join(root, "fixtures", "openai-narration.mp3");
    await writeStageCheckpoint(root, "script", "completed", approvedSlideScript());

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "presentation-demo",
      registry: new Registry({
        tools: [
          ttsSelector,
          fixtureTool("openai_tts", "tts", "openai", 0.000015, async (input) => {
            ttsInputs.push(input);
            await writeFixture(audioPath, "audio");
            return { audio_path: audioPath, provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy", cost_usd: 0.000015 };
          }),
        ],
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: false, provider_profile: "paid-demo", nonInteractive: true, from: "cuesheet" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(ttsInputs).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("Decks already carry the story"),
        voice_id: "alloy",
        model: "gpt-4o-mini-tts",
      }),
    ]);
    await expect(readCheckpoint(root, "show", "episode", "cuesheet")).resolves.toMatchObject({
      artifact: {
        master_clock: "voiceover",
        audio: {
          path: "projects/show/episode/audio/narration.mp3",
        },
        scene_anchors: [
          expect.objectContaining({ scene_id: "slide-001", slide_ids: ["slide-001"], snapped_to: "word" }),
          expect.objectContaining({ scene_id: "slide-002", slide_ids: ["slide-002"], snapped_to: "word" }),
        ],
        voiceover: {
          provider: "openai",
          tool: "openai_tts",
          voice_id: "alloy",
          model: "gpt-4o-mini-tts",
          cost_usd: 0.000015,
        },
      },
    });
    await expect(readCostLog(root, "show", "episode")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: "openai_tts", provider: "openai", model: "gpt-4o-mini-tts", usd: 0.000015 }),
      ]),
    );
    await expect(readDecisionLog({ show: "show", episode: "episode" }, { root })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "cuesheet",
          category: "voice_selection",
          picked: "openai_tts",
          reason: expect.stringContaining("voice_id=alloy"),
          options_considered: expect.arrayContaining([
            expect.objectContaining({ label: "openai_tts", rejected_because: null, notes: expect.stringContaining("cost_usd=0.000015") }),
            expect.objectContaining({ label: "attach_existing_voiceover", rejected_because: expect.stringContaining("TTS registry") }),
          ]),
        }),
      ]),
    );
  });

  it("renders presentation-demo slide scenes through the locked Remotion runtime", async () => {
    const root = await scratchProject();
    const show = presentationDemoShow(root);
    const episode = presentationDemoEpisode(show);
    const pipeline = presentationDemoPipeline([
      stage("capture", "deck_manifest"),
      { ...stage("script", "script"), human_approval: "required" },
      stage("cuesheet", "cuesheet"),
      stage("scene_plan", "scene_plan"),
      stage("assets", "asset_manifest"),
      stage("edit", "edit_decisions"),
      stage("compose", "render_report"),
    ]);
    const composeInputs: unknown[] = [];

    await writeStageCheckpoint(root, "capture", "completed", deckManifestWithNotes());
    await writeStageCheckpoint(root, "script", "completed", approvedSlideScript());
    await writeStageCheckpoint(root, "cuesheet", "completed", approvedSlideCuesheet());

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "presentation-demo",
      registry: new Registry({
        tools: paidSampleTools(root, {
          includeRemotionRuntime: true,
          onVideoComposeInput: (input) => composeInputs.push(input),
        }),
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: false, provider_profile: "paid-demo", nonInteractive: true, from: "scene_plan" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCheckpoint(root, "show", "episode", "scene_plan")).resolves.toMatchObject({
      artifact: {
        scenes: [
          expect.objectContaining({
            slug: "slide-001",
            slide_id: "slide-001",
            treatment: "zoom_pan",
            highlights: [expect.objectContaining({ label: "deck evidence" })],
            callouts: [expect.objectContaining({ text: expect.stringContaining("Decks already") })],
          }),
          expect.objectContaining({
            slug: "slide-002",
            slide_id: "slide-002",
          }),
        ],
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "assets")).resolves.toMatchObject({
      artifact: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "deck_slide_slide_001", kind: "image", provider: "deck_manifest" }),
          expect.objectContaining({ id: "paid_sample_narration", kind: "audio", provider: "openai" }),
        ]),
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "edit")).resolves.toMatchObject({
      artifact: {
        render_runtime: "remotion",
        cuts: expect.arrayContaining([
          expect.objectContaining({
            scene_kind: "slide_scene",
            slide_id: "slide-001",
            asset_id: "deck_slide_slide_001",
            timing_anchor: "section:slide-001",
            timing_source: "section",
            start_ms: 0,
            transition_in: "fade",
            transition_out: "dissolve",
            provider: "remotion",
          }),
        ]),
        audio: { music: { track_path: "projects/show/episode/audio/narration.mp3", ducking: false } },
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({
      artifact: {
        runtime_used: "remotion",
        expected_duration_s: 10,
        drift_s: 0,
        verification_notes: expect.arrayContaining(["Fixture Remotion render used slide-aware compose input."]),
      },
    });
    expect(composeInputs).toHaveLength(1);
    expect(composeInputs[0]).toMatchObject({
      deck_manifest: { slides: expect.arrayContaining([expect.objectContaining({ id: "slide-001" })]) },
      scene_plan: { scenes: expect.arrayContaining([expect.objectContaining({ slide_id: "slide-001" })]) },
      cuesheet: { master_clock: "voiceover" },
      edit_decisions: {
        render_runtime: "remotion",
        cuts: expect.arrayContaining([
          expect.objectContaining({
            scene_kind: "slide_scene",
            slide_id: "slide-001",
            timing_anchor: "section:slide-001",
            timing_source: "section",
          }),
        ]),
      },
    });
  });

  it("fails presentation-demo compose instead of silently swapping when Remotion is unavailable", async () => {
    const root = await scratchProject();
    const show = presentationDemoShow(root);
    const episode = presentationDemoEpisode(show);
    const pipeline = presentationDemoPipeline([
      stage("capture", "deck_manifest"),
      { ...stage("script", "script"), human_approval: "required" },
      stage("cuesheet", "cuesheet"),
      stage("scene_plan", "scene_plan"),
      stage("assets", "asset_manifest"),
      stage("edit", "edit_decisions"),
      stage("compose", "render_report"),
    ]);
    const ffmpegInputs: unknown[] = [];

    await writeStageCheckpoint(root, "capture", "completed", deckManifestWithNotes());
    await writeStageCheckpoint(root, "script", "completed", approvedSlideScript());
    await writeStageCheckpoint(root, "cuesheet", "completed", approvedSlideCuesheet());

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "presentation-demo",
      registry: new Registry({ tools: paidSampleTools(root, { onFfmpegInput: (input) => ffmpegInputs.push(input) }) }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: false, provider_profile: "paid-demo", nonInteractive: true, from: "scene_plan" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    expect(result.lastStage).toBe("compose");
    expect(ffmpegInputs).toHaveLength(0);
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({
      status: "failed",
      artifact: {
        error: expect.stringMatching(/remotion runtime (?:is not registered|unavailable)/u),
      },
    });
  });

  it("reports the actual ffmpeg sample runtime when a starter is configured for Remotion", async () => {
    const root = await scratchProject();
    const show = loadedShow(root, "remotion");
    const episode = loadedEpisode(show, "remotion");
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
    await expect(readCheckpoint(root, "show", "episode", "edit")).resolves.toMatchObject({
      artifact: {
        render_runtime: "ffmpeg",
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({
      artifact: {
        runtime_used: "ffmpeg",
        final_review: {
          checks: {
            promise_preservation: {
              runtime_swap_detected: false,
              render_runtime_used: "ffmpeg",
            },
          },
        },
      },
    });
  });

  it("uses available Remotion runtime and creates multiple generated motion clips from script beats", async () => {
    const root = await scratchProject();
    const show = loadedShow(root, "remotion");
    const episode = loadedEpisode(show, "remotion", [
      "Start with the contract: pipeline first.",
      "Check readiness: doctor, tools, runtimes.",
      "Build the sample: voice, frame, motion, review.",
      "Export the handoff: Premiere, EDL, logs.",
    ].join("\n"));
    const pipeline = pipelineManifest();
    const videoComposeInputs: unknown[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "paid-demo",
      registry: new Registry({
        tools: paidSampleTools(root, {
          includeRemotionRuntime: true,
          onVideoComposeInput: (input) => videoComposeInputs.push(input),
        }),
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", budget_usd: 0.75, nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCheckpoint(root, "show", "episode", "assets")).resolves.toMatchObject({
      artifact: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "paid_sample_clip", model: "seedance_2_0" }),
          expect.objectContaining({ id: "paid_sample_clip_2", model: "seedance_2_0" }),
        ]),
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "edit")).resolves.toMatchObject({
      artifact: {
        render_runtime: "remotion",
        cuts: [
          expect.objectContaining({ asset_id: "paid_sample_clip", start_s: 0, end_s: 7.5 }),
          expect.objectContaining({ asset_id: "paid_sample_clip_2", start_s: 7.5, end_s: 15 }),
        ],
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({
      artifact: {
        runtime_used: "remotion",
        final_review: {
          checks: {
            promise_preservation: {
              render_runtime_used: "remotion",
            },
          },
        },
      },
    });
    expect(videoComposeInputs).toHaveLength(1);
    expect(videoComposeInputs[0]).toMatchObject({
      edit_decisions: {
        render_runtime: "remotion",
      },
      asset_manifest: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "paid_sample_clip_2", path: "projects/show/episode/clips/higgsfield-sample-2.mp4" }),
        ]),
      },
    });
  });

  it("plans source-free news-song samples from lyrics, skips filler ad-libs, and uses OpenAI GPT Image 2", async () => {
    const root = await scratchProject();
    const show: LoadedShow = {
      ...loadedShow(root, "remotion"),
      pipelines: {
        "news-song": {
          runtime: "remotion" as const,
          aspect: "16:9",
        },
      },
      defaults: {
        pipeline: "news-song",
      },
    };
    const lyricsPath = path.join("shows", "show", "inputs", "episode", "lyrics.txt");
    await writeFixture(
      path.join(root, lyricsPath),
      [
        "[Intro]",
        "Uh...",
        "Yeah...",
        "Bankrupt the billionaires at dawn",
        "Turn the towers into tools",
        "Everybody builds the future",
      ].join("\n"),
    );
    const episode: LoadedEpisode = {
      ...loadedEpisode(show, "remotion"),
      pipeline: "news-song",
      inputs: {
        track: "shows/show/inputs/episode/track.wav",
        lyrics: lyricsPath,
        sources: null,
      },
    };
    const pipeline: PipelineManifest = {
      ...pipelineManifest(),
      slug: "news-song",
      master_clock: "audio",
      sample: {
        duration_s_min: 18,
        duration_s_max: 18,
        max_scenes: 6,
        max_cost_usd: 1.1,
      },
      stages: [
        stage("cuesheet", "cuesheet"),
        stage("source_review", "source_media_review"),
        stage("script", "script"),
        stage("scene_plan", "scene_plan"),
        stage("assets", "asset_manifest"),
        stage("edit", "edit_decisions"),
        stage("compose", "render_report"),
      ],
    };
    const higgsfieldInputs: unknown[] = [];
    const videoComposeInputs: unknown[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "news-song",
      registry: new Registry({
        tools: paidSampleTools(root, {
          includeHiggsfieldImage: true,
          includeRemotionRuntime: true,
          onHiggsfieldInput: (input) => higgsfieldInputs.push(input),
          onVideoComposeInput: (input) => videoComposeInputs.push(input),
        }),
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", budget_usd: 1.1, nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCheckpoint(root, "show", "episode", "source_review")).resolves.toMatchObject({
      artifact: {
        content_mode: "source-free-protest-music-video",
        files: expect.arrayContaining([
          expect.objectContaining({
            technical_probe: expect.objectContaining({ media_kind: "audio", duration_s: 18, sample_scope_s: 18 }),
            content_summary: expect.stringContaining("media_kind=audio"),
          }),
          expect.objectContaining({
            technical_probe: expect.objectContaining({ media_kind: "text", line_count: 5, non_filler_line_count: 3 }),
            content_summary: expect.stringContaining("non_filler_line_count=3"),
          }),
        ]),
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "script")).resolves.toMatchObject({
      artifact: {
        sections: [
          expect.objectContaining({ narration: "Bankrupt the billionaires at dawn" }),
          expect.objectContaining({ narration: "Turn the towers into tools" }),
          expect.objectContaining({ narration: "Everybody builds the future" }),
        ],
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "scene_plan")).resolves.toMatchObject({
      artifact: {
        scenes: expect.arrayContaining([
          expect.objectContaining({
            texture_keywords: expect.arrayContaining(["PS2-era low-poly geometry", "source-free lyric-art"]),
          }),
        ]),
      },
    });
    const sceneCheckpoint = (await readCheckpoint(root, "show", "episode", "scene_plan")) as { artifact: { scenes: Array<{ start_s: number; end_s: number }> } };
    expect(sceneCheckpoint.artifact.scenes).toHaveLength(6);
    expect(sceneCheckpoint.artifact.scenes.every((scene) => scene.end_s - scene.start_s <= 5)).toBe(true);
    await expect(readCheckpoint(root, "show", "episode", "assets")).resolves.toMatchObject({
      artifact: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "paid_sample_image", provider: "openai", model: "gpt-image-2" }),
          expect.objectContaining({ id: "paid_sample_clip", provider: "higgsfield", model: "seedance_2_0" }),
        ]),
      },
    });
    await expect(readCostLog(root, "show", "episode")).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tool: "openai_image", provider: "openai", usd: 0.04, mode: "sample" }),
      ]),
    );
    expect(higgsfieldInputs[0]).toMatchObject({
      image_path: "projects/show/episode/assets/openai-sample.png",
      prompt: expect.stringContaining("retro PS2 political music-video shot"),
    });
    expect(videoComposeInputs[0]).toMatchObject({
      asset_manifest: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "paid_sample_clip", path: "projects/show/episode/clips/higgsfield-sample.mp4" }),
        ]),
      },
      edit_decisions: {
        render_runtime: "remotion",
      },
    });
    await expect(
      readFile(path.join(root, "projects", "show", "episode", "artifacts", "gpt_image2_full_prompts", "001_sample_1_1.txt"), "utf8"),
    ).resolves.toContain("retro PS2 political music video");
    await expect(
      readFile(path.join(root, "projects", "show", "episode", "artifacts", "gpt_image2_full_prompts", "002_sample_1_2.txt"), "utf8"),
    ).resolves.toContain("Bankrupt the billionaires at dawn");
    const fullPlan = JSON.parse(
      await readFile(path.join(root, "projects", "show", "episode", "artifacts", "gpt_image2_full_scene_plan.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(fullPlan).toMatchObject({
      image_provider: { provider: "openai", model: "gpt-image-2" },
      alternate_image_provider: { provider: "higgsfield", model: "gpt_image_2" },
      storyboard_first: true,
      scene_count: 6,
      max_scene_duration: 3,
    });
  });

  it("keeps one-off animation samples on the selected pipeline style instead of lyric-music styling", async () => {
    const root = await scratchProject();
    const show: LoadedShow = {
      ...loadedShow(root, "remotion"),
      pipelines: {
        animation: {
          runtime: "remotion" as const,
          aspect: "16:9",
        },
      },
      defaults: {
        pipeline: "animation",
      },
    };
    const scriptPath = path.join("shows", "show", "inputs", "episode", "script.txt");
    const transcriptPath = path.join("projects", "bluey-batty-come-home", "tata-bluey.txt");
    const storyboardPath = path.join("projects", "bluey-batty-come-home", "bluey_batty_higgsfield_storyboard.csv");
    const referencePath = path.join("projects", "bluey-batty-come-home", "batty-daddy.png");
    await writeFixture(path.join(root, scriptPath), "Tata waits by the reef gate.\nBluey and Batty swim home together.");
    await writeFixture(path.join(root, transcriptPath), "Tata asks Bluey and Batty to come home before sunset.");
    await writeFixture(path.join(root, storyboardPath), "shot,description\n1,Reef gate with warm aquarium light");
    await mkdir(path.dirname(path.join(root, referencePath)), { recursive: true });
    await writeFile(path.join(root, referencePath), tinyPngBytes());
    const episode: LoadedEpisode = {
      ...loadedEpisode(show, "remotion"),
      title: "Bluey and Batty Come Home",
      pipeline: "animation",
      playbook: "flat-motion-graphics",
      inputs: {
        script: scriptPath,
        style: "bright children's storybook aquarium motion, soft rounded shapes",
        source_transcript: transcriptPath,
        storyboard_csv: storyboardPath,
        source_reference_files: [referencePath],
      },
    };
    const pipeline: PipelineManifest = {
      ...pipelineManifest(),
      slug: "animation",
      sample: {
        duration_s_min: 12,
        duration_s_max: 12,
        max_scenes: 2,
        max_cost_usd: 1.1,
      },
      stages: [stage("source_review", "source_media_review"), stage("scene_plan", "scene_plan"), stage("assets", "asset_manifest")],
    };
    const openAiInputs: unknown[] = [];
    const higgsfieldInputs: unknown[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "animation",
      registry: new Registry({
        tools: paidSampleTools(root, {
          onOpenAiInput: (input) => openAiInputs.push(input),
          onHiggsfieldInput: (input) => higgsfieldInputs.push(input),
        }),
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", budget_usd: 1.1, nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCheckpoint(root, "show", "episode", "source_review")).resolves.toMatchObject({
      artifact: {
        content_mode: "reference-guided-animation",
        files: expect.arrayContaining([
          expect.objectContaining({
            key: "source_reference_files",
            technical_probe: expect.objectContaining({ media_kind: "image", detected_format: "png" }),
          }),
        ]),
      },
    });
    await expect(readCheckpoint(root, "show", "episode", "scene_plan")).resolves.toMatchObject({
      artifact: {
        scenes: expect.arrayContaining([
          expect.objectContaining({
            texture_keywords: expect.arrayContaining(["animation", "storybook", "aquarium"]),
          }),
        ]),
      },
    });
    const imagePromptText = promptFromInput(openAiInputs[0]);
    const motionPromptText = promptFromInput(higgsfieldInputs[0]);
    expect(imagePromptText).toContain("Pipeline: animation");
    expect(imagePromptText).toContain("bright children's storybook aquarium");
    expect(motionPromptText).toContain("animation beat");
    expect(motionPromptText).toContain("bright children's storybook aquarium");
    expect(`${imagePromptText}\n${motionPromptText}`).not.toMatch(/retro PS2 political music-video|protest music-video|source-free lyric-art/u);
  });

  it("blocks invalid source reference images before paid asset generation", async () => {
    const root = await scratchProject();
    const show: LoadedShow = {
      ...loadedShow(root),
      pipelines: {
        animation: {
          runtime: "ffmpeg" as const,
          aspect: "16:9",
        },
      },
      defaults: {
        pipeline: "animation",
      },
    };
    const referencePath = path.join("projects", "bluey-batty-come-home", "batty-daddy.png");
    await writeFixture(path.join(root, referencePath), JSON.stringify({ detail: "Invalid signature or expired URL" }));
    const episode: LoadedEpisode = {
      ...loadedEpisode(show),
      title: "Bluey and Batty Come Home",
      pipeline: "animation",
      inputs: {
        narration: "Make a gentle aquarium story sample.",
        source_reference_files: [referencePath],
      },
    };
    const pipeline: PipelineManifest = {
      ...pipelineManifest(),
      slug: "animation",
      stages: [stage("assets", "asset_manifest")],
    };
    const openAiInputs: unknown[] = [];
    const higgsfieldInputs: unknown[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "animation",
      registry: new Registry({
        tools: paidSampleTools(root, {
          onOpenAiInput: (input) => openAiInputs.push(input),
          onHiggsfieldInput: (input) => higgsfieldInputs.push(input),
        }),
      }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    expect(openAiInputs).toHaveLength(0);
    expect(higgsfieldInputs).toHaveLength(0);
    await expect(readCheckpoint(root, "show", "episode", "assets")).resolves.toMatchObject({
      status: "failed",
      artifact: {
        error: expect.stringContaining("source_reference_files"),
        last_cost_entries: [],
      },
      tool_invocations: [],
    });
  });

  it("hydrates checkpointed paid-sample artifacts when starting at compose", async () => {
    const root = await scratchProject();
    const show = loadedShow(root);
    const episode = loadedEpisode(show);
    const pipeline = pipelineManifest();

    const firstPass = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "paid-demo",
      registry: new Registry({ tools: paidSampleTools(root) }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", nonInteractive: true, to: "edit" },
      io: captureIo().io,
      now: fixedNow,
    });
    const ffmpegInputs: unknown[] = [];

    const resumed = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "paid-demo",
      registry: new Registry({ tools: paidSampleTools(root, { onFfmpegInput: (input) => ffmpegInputs.push(input) }) }),
      dispatcher: createPaidSampleDispatcher({ providerProfile: "paid-demo", now: fixedNow }),
      reviewer: passReviewer,
      runOptions: { sample: true, provider_profile: "paid-demo", nonInteractive: true, from: "compose" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(firstPass.status).toBe("completed");
    expect(resumed.status).toBe("completed");
    expect(ffmpegInputs).toHaveLength(1);
    expect(ffmpegInputs[0]).toMatchObject({
      operation: "compose",
      asset_manifest: {
        assets: expect.arrayContaining([
          expect.objectContaining({ id: "paid_sample_clip", path: "projects/show/episode/clips/higgsfield-sample.mp4" }),
          expect.objectContaining({ id: "paid_sample_narration", path: "projects/show/episode/audio/narration.mp3" }),
        ]),
      },
      edit_decisions: {
        cuts: [expect.objectContaining({ asset_id: "paid_sample_clip", start_s: 0, end_s: 15 })],
        audio: {
          music: {
            track_path: "projects/show/episode/audio/narration.mp3",
          },
        },
      },
    });
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

function loadedShow(projectRoot: string, runtime: "ffmpeg" | "remotion" = "ffmpeg"): LoadedShow {
  return {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-12T00:00:00Z"),
    pipelines: {
      "paid-demo": {
        runtime,
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

function loadedEpisode(
  show: LoadedShow,
  runtime: "ffmpeg" | "remotion" = "ffmpeg",
  narration = "A concise narration fixture for the paid sample dispatcher.",
): LoadedEpisode {
  return {
    slug: "episode",
    title: "Paid Sample",
    created: new Date("2026-05-12T00:00:00Z"),
    pipeline: "paid-demo",
    runtime,
    aspect: "16:9",
    inputs: {
      narration,
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

function presentationDemoShow(projectRoot: string): LoadedShow {
  return {
    ...loadedShow(projectRoot, "remotion"),
    pipelines: {
      "presentation-demo": {
        runtime: "remotion" as const,
        aspect: "16:9",
      },
    },
    defaults: {
      pipeline: "presentation-demo",
    },
  };
}

function presentationDemoEpisode(show: LoadedShow, inputs: Record<string, unknown> = {}): LoadedEpisode {
  return {
    ...loadedEpisode(show, "remotion", ""),
    title: "Deck Demo",
    pipeline: "presentation-demo",
    inputs: {
      deck_source: "shows/show/inputs/episode/deck.pptx",
      ...inputs,
    },
  };
}

function presentationDemoPipeline(stages: Stage[]): PipelineManifest {
  return {
    ...pipelineManifest(),
    slug: "presentation-demo",
    sample_support: "paid",
    master_clock: "voiceover",
    defaults: {
      render_runtime: "remotion",
      aspect: "16:9",
    },
    stages,
  };
}

async function writeStageCheckpoint(
  root: string,
  stageSlug: string,
  status: CheckpointStatus,
  artifact: unknown,
): Promise<void> {
  await writeCheckpoint(root, "show", "episode", stageSlug, {
    stage: stageSlug,
    status,
    timestamp: fixedNow().toISOString(),
    artifact,
    review_summary: {
      decision: "pass",
      rounds: 0,
      critical: 0,
      suggestions: 0,
      nitpicks: 0,
      findings: [],
    },
    cost_snapshot: {
      stage_cost_usd: 0,
      total_so_far_usd: 0,
      budget_remaining_usd: 1,
    },
    tool_invocations: [],
  });
}

function deckManifestWithNotes(): unknown {
  return {
    source: {
      kind: "pptx",
      file_type: "pptx",
      source_path: "/Users/example/Desktop/presentation-demo.pptx",
      working_file_path: "projects/show/episode/deck/source.pptx",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      byte_size: 245760,
    },
    slides: [
      {
        id: "slide-001",
        order: 1,
        image_path: "captures/slides/slide-001.png",
        image: { width: 1920, height: 1080 },
        text: "Your deck is already the source material",
        text_source: "native",
        speaker_notes: "Open by naming the pain: teams already have strong deck material but need a video draft.",
        notes_source: "pptx_notes",
        warnings: [],
        source: { slide_number: 1 },
      },
      {
        id: "slide-002",
        order: 2,
        image_path: "captures/slides/slide-002.png",
        image: { width: 1920, height: 1080 },
        text: "Capture slides, text, and presenter notes",
        text_source: "native",
        speaker_notes: "Explain that Show Sidekick extracts slide evidence and drafts a voiceover for review.",
        notes_source: "pptx_notes",
        warnings: [],
        source: { slide_number: 2 },
      },
    ],
    extraction: {
      text_engine: "pptx-native",
      notes_engine: "pptx-notes",
      screenshot_engine: "deck-renderer",
      extracted_at: fixedNow().toISOString(),
      warnings: [],
    },
  };
}

function approvedSlideScript(): unknown {
  return {
    sections: [
      {
        slug: "slide-001",
        role: "hook",
        start_s: 0,
        end_s: 5,
        narration: "Decks already carry the story. Show Sidekick turns that source material into a reviewable demo.",
        dialogue: [],
        enhancement_cues: [],
        slide_ids: ["slide-001"],
        vo_source: "pptx_notes",
      },
      {
        slug: "slide-002",
        role: "resolution",
        start_s: 5,
        end_s: 10,
        narration: "After approval, narration timing gives captions and edit decisions a reliable clock.",
        dialogue: [],
        enhancement_cues: [],
        slide_ids: ["slide-002"],
        vo_source: "slide_text",
      },
    ],
  };
}

function approvedSlideCuesheet(): unknown {
  return {
    audio: {
      path: "projects/show/episode/audio/narration.mp3",
      duration_s: 10,
      sample_rate: 44100,
      channels: 1,
    },
    master_clock: "voiceover",
    transcription_confidence: { average: 1, low_confidence: false },
    words: [
      { text: "Decks", start_s: 0, end_s: 0.5, confidence: 1 },
      { text: "already", start_s: 0.5, end_s: 1, confidence: 1 },
      { text: "carry", start_s: 1, end_s: 1.5, confidence: 1 },
      { text: "timing", start_s: 5, end_s: 5.5, confidence: 1 },
    ],
    segments: [
      {
        start_s: 0,
        end_s: 5,
        text: "Decks already carry the story.",
        words: [
          { text: "Decks", start_s: 0, end_s: 0.5, confidence: 1 },
          { text: "already", start_s: 0.5, end_s: 1, confidence: 1 },
          { text: "carry", start_s: 1, end_s: 1.5, confidence: 1 },
        ],
      },
      {
        start_s: 5,
        end_s: 10,
        text: "Timing drives captions.",
        words: [{ text: "timing", start_s: 5, end_s: 5.5, confidence: 1 }],
      },
    ],
    sections: [
      { label: "slide-001", start_s: 0, end_s: 5, kind: "vocal", energy: 0.78 },
      { label: "slide-002", start_s: 5, end_s: 10, kind: "vocal", energy: 0.78 },
    ],
    beats: [],
    climax: [{ time_s: 7.5, type: "arrival", intensity: 0.8, source: "agent" }],
    scene_anchors: [
      { scene_id: "slide-001", start_s: 0, end_s: 5, snapped_to: "word", slide_ids: ["slide-001"], source: { section: "slide-001" } },
      { scene_id: "slide-002", start_s: 5, end_s: 10, snapped_to: "word", slide_ids: ["slide-002"], source: { section: "slide-002" } },
    ],
    voiceover: {
      audio_path: "projects/show/episode/audio/narration.mp3",
      provider: "openai",
      tool: "openai_tts",
      voice_id: "alloy",
      voice: "alloy",
      model: "gpt-4o-mini-tts",
      cost_usd: 0.000015,
    },
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

function paidSampleTools(
  root: string,
  options: {
    higgsfieldCacheHit?: boolean;
    includeCodeSnippet?: boolean;
    includeHiggsfieldImage?: boolean;
    includeOpenAiImage?: boolean;
    includeRemotionRuntime?: boolean;
    onCodeSnippetInput?: (input: unknown) => void;
    onFfmpegInput?: (input: unknown) => void;
    onHiggsfieldImageInput?: (input: unknown) => void;
    onHiggsfieldInput?: (input: unknown) => void;
    onOpenAiInput?: (input: unknown) => void;
    onVideoComposeInput?: (input: unknown) => void;
  } = {},
): Tool[] {
  const imagePath = path.join(root, "fixtures", "openai.png");
  const higgsfieldImagePath = path.join(root, "fixtures", "higgsfield.png");
  const audioPath = path.join(root, "fixtures", "narration.mp3");
  const clipPath = path.join(root, "fixtures", "clip.mp4");

  return [
    ...(options.includeCodeSnippet
      ? [
          defineTool({
            name: "code_snippet",
            capability: "image_generation",
            provider: "local",
            status: "beta",
            integration: { kind: "library", package: "fixture", install: "none" },
            best_for: "code overlay fixture",
            input: z.object({ code: z.string().min(1) }),
            output: z.unknown(),
            async isAvailable() {
              return { available: true };
            },
            async execute(input) {
              options.onCodeSnippetInput?.(input);
              throw new Error("code_snippet should not be used for paid-sample motion frames");
            },
          }),
        ]
      : []),
    ...(options.includeHiggsfieldImage
      ? [
          fixtureTool("higgsfield_image", "image_generation", "higgsfield", 0.04, async (input) => {
            options.onHiggsfieldImageInput?.(input);
            await writeFixture(higgsfieldImagePath, "higgsfield-image");
            return { image_path: higgsfieldImagePath, provider: "higgsfield", model: "gpt_image_2", cost_usd: 0.04 };
          }),
        ]
      : []),
    ...(options.includeOpenAiImage === false
      ? []
      : [
          fixtureTool("openai_image", "image_generation", "openai", 0.04, async (input) => {
            options.onOpenAiInput?.(input);
            await writeFixture(imagePath, "image");
            return { image_path: imagePath, provider: "openai", model: "gpt-image-2", cost_usd: 0.04 };
          }),
        ]),
    fixtureTool("elevenlabs_tts", "tts", "elevenlabs", 0.0003, async () => {
      await writeFixture(audioPath, "audio");
      return { audio_path: audioPath, provider: "elevenlabs", model: "eleven_multilingual_v2", cost_usd: 0.0003 };
    }),
    fixtureTool("higgsfield", "image_to_video", "higgsfield", 0.3, async (input) => {
      options.onHiggsfieldInput?.(input);
      await writeFixture(clipPath, "clip");
      return { video_path: clipPath, cost_usd: options.higgsfieldCacheHit ? 0 : 0.3, cache_hit: options.higgsfieldCacheHit === true };
    }),
    fixtureTool("ffmpeg", "video_compose", "ffmpeg", 0, async (input) => {
      options.onFfmpegInput?.(input);
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
    ...(options.includeRemotionRuntime
      ? [
          fixtureTool("remotion", "video_compose", "remotion", 0, async (input) => {
            options.onVideoComposeInput?.(input);
            const outputPath = path.join(root, "projects", "show", "episode", "renders", "paid-sample.mp4");
            const durationS = composeDuration(input);
            await writeFixture(outputPath, "render");
            return {
              output_path: outputPath,
              encoding_profile: "remotion/h264-aac",
              duration_s: durationS,
              expected_duration_s: durationS,
              drift_s: 0,
              drift_frames: 0,
              drift_tolerance_s: 0.2,
              within_tolerance: true,
              resolution: { width: 1920, height: 1080 },
              framerate: 30,
              runtime_used: "remotion",
              asset_count: composeAssetCount(input),
              warnings: [],
              verification_notes: ["Fixture Remotion render used slide-aware compose input."],
              validation_steps: [],
            };
          }),
          fixtureTool("video_compose", "video_compose", "predit", 0, async (input) => {
            options.onVideoComposeInput?.(input);
            const outputPath = path.join(root, "projects", "show", "episode", "renders", "paid-sample.mp4");
            await writeFixture(outputPath, "render");
            return {
              output_path: outputPath,
              encoding_profile: "remotion/h264-aac",
              duration_s: 15,
              resolution: { width: 1920, height: 1080 },
              framerate: 30,
              runtime_used: "remotion",
              asset_count: 5,
              warnings: [],
              validation_steps: [],
            };
          }),
        ]
      : []),
  ];
}

function fixtureTool(
  name: string,
  capability: string,
  provider: string,
  usd: number,
  execute: (input: unknown) => Promise<unknown>,
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
    async isAvailable() {
      return { available: true };
    },
    execute,
  });
}

async function writeFixture(filePath: string, contents: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

function tinyPngBytes(): Buffer {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function promptFromInput(input: unknown): string {
  return typeof input === "object" && input !== null && "prompt" in input && typeof input.prompt === "string" ? input.prompt : "";
}

function composeDuration(input: unknown): number {
  const edit = typeof input === "object" && input !== null && "edit_decisions" in input ? input.edit_decisions : undefined;
  const cuts = typeof edit === "object" && edit !== null && "cuts" in edit && Array.isArray(edit.cuts) ? edit.cuts : [];
  return cuts.reduce((max, cut) => {
    return typeof cut === "object" && cut !== null && "end_s" in cut && typeof cut.end_s === "number" ? Math.max(max, cut.end_s) : max;
  }, 0);
}

function composeAssetCount(input: unknown): number {
  const manifest = typeof input === "object" && input !== null && "asset_manifest" in input ? input.asset_manifest : undefined;
  return typeof manifest === "object" && manifest !== null && "assets" in manifest && Array.isArray(manifest.assets)
    ? manifest.assets.length
    : 0;
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
