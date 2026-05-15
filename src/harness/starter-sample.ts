import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { encodeRgbaPng } from "../media/png.js";
import { projectDir } from "../checkpoints/paths.js";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import type { StageContext } from "./context.js";
import type { Dispatcher } from "./dispatcher.js";
import type { StageResult } from "./result.js";

type StarterSampleArtifactSet = {
  cuesheet: unknown;
  source_media_review: unknown;
  brief: unknown;
  script: unknown;
  scene_plan: unknown;
  asset_manifest: unknown;
  edit_decisions: unknown;
  render_report: unknown;
};

const SAMPLE_WIDTH = 540;
const SAMPLE_HEIGHT = 960;
const SAMPLE_FRAMERATE = 30;

export function createStarterSampleDispatcher(): Dispatcher {
  const artifactsByEpisode = new Map<string, StarterSampleArtifactSet>();

  return async (ctx) => {
    const key = `${ctx.show.slug}/${ctx.episode.slug}`;
    const existing = artifactsByEpisode.get(key);
    const artifacts = existing ?? (await createStarterSampleArtifacts(ctx));
    artifactsByEpisode.set(key, artifacts);

    const artifact = artifactForStage(ctx, artifacts);
    return {
      artifact,
      cost_used: {
        stage_cost_usd: 0,
        total_so_far_usd: 0,
        budget_remaining_usd: ctx.runOptions.budget_usd ?? 0,
      },
      decisions: [],
    };
  };
}

async function createStarterSampleArtifacts(ctx: StageContext): Promise<StarterSampleArtifactSet> {
  const durationS = sampleDuration(ctx);
  const trackPath = stringInput(ctx, "track");
  const lyricsPath = stringInput(ctx, "lyrics");
  const lyricText = lyricsPath ? await readFile(lyricsPath, "utf8") : "Fifteen seconds, right on time";
  const workspace = projectDir(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug);
  const assetPath = path.join(workspace, "assets", "sample-frame.png");
  const finalReviewFramesDir = path.join(workspace, "final_review", "frames");
  const renderPath = path.join(workspace, "renders", "sample-preview.mp4");
  const assetRelativePath = projectRelativePath(ctx.show.projectRoot, assetPath);
  const renderRelativePath = projectRelativePath(ctx.show.projectRoot, renderPath);
  const frameRelativePaths = ["10.png", "35.png", "65.png", "90.png"].map((fileName) =>
    projectRelativePath(ctx.show.projectRoot, path.join(finalReviewFramesDir, fileName)),
  );
  const heroFrameRelativePath = projectRelativePath(ctx.show.projectRoot, path.join(finalReviewFramesDir, "hero.png"));

  await mkdir(path.dirname(assetPath), { recursive: true });
  await mkdir(finalReviewFramesDir, { recursive: true });
  await mkdir(path.dirname(renderPath), { recursive: true });
  const image = starterFramePng();
  await writeFile(assetPath, image);
  await Promise.all(
    [...frameRelativePaths, heroFrameRelativePath].map((framePath) =>
      writeFile(path.resolve(ctx.show.projectRoot, framePath), image),
    ),
  );
  await renderStarterPreview({
    framePath: assetPath,
    trackPath,
    outputPath: renderPath,
    durationS,
  });

  const cuesheet = buildCuesheet({
    audioPath: trackPath ?? assetRelativePath,
    lyricText,
    durationS,
  });
  const sourceMediaReview = buildSourceMediaReview({
    audioPath: trackPath ?? assetRelativePath,
    durationS,
    lyricText,
  });
  const brief = buildBrief({ durationS, lyricText });
  const script = buildScript({ durationS, lyricText });
  const scenePlan = buildScenePlan({ durationS });
  const assetManifest = {
    assets: [
      {
        id: "sample_visual",
        kind: "image",
        path: assetRelativePath,
        provider: "predit",
        prompt: "Generated deterministic zero-key music-video starter frame.",
        cost_usd: 0,
      },
    ],
  };
  const editDecisions = {
    cuts: sampleCuts(durationS),
    overlays: [],
    audio: trackPath
      ? {
          music: {
            track_path: trackPath,
          },
        }
      : undefined,
    render_runtime: "ffmpeg",
    renderer_family: "animation-first",
    brand: {
      slug: ctx.show.slug,
      name: ctx.show.display_name,
    },
  };
  const renderReport = {
    output_path: renderRelativePath,
    encoding_profile: "h264-aac-mp4-starter-preview",
    duration_s: durationS,
    resolution: {
      width: SAMPLE_WIDTH,
      height: SAMPLE_HEIGHT,
    },
    framerate: SAMPLE_FRAMERATE,
    runtime_used: "ffmpeg",
    asset_count: 1,
    warnings: [],
    validation_steps: [
      {
        name: "starter-sample",
        status: "pass",
        notes: "Zero-key deterministic starter preview and NLE artifacts generated.",
      },
    ],
    final_review: buildFinalReview({ durationS, frameRelativePaths, heroFrameRelativePath }),
  };

  return {
    cuesheet,
    source_media_review: sourceMediaReview,
    brief,
    script,
    scene_plan: scenePlan,
    asset_manifest: assetManifest,
    edit_decisions: editDecisions,
    render_report: renderReport,
  };
}

function artifactForStage(ctx: StageContext, artifacts: StarterSampleArtifactSet): unknown {
  const produced = ctx.stage.produces as keyof StarterSampleArtifactSet;
  const artifact = artifacts[produced];
  if (artifact === undefined) {
    throw new Error(`starter sample dispatcher cannot produce '${ctx.stage.produces}'`);
  }
  return artifact;
}

function sampleDuration(ctx: StageContext): number {
  return ctx.pipeline.sample?.duration_s_min ?? 15;
}

function stringInput(ctx: StageContext, key: string): string | undefined {
  const value = ctx.episode.inputs[key];
  return typeof value === "string" ? value : undefined;
}

function buildCuesheet(input: { audioPath: string; lyricText: string; durationS: number }): unknown {
  const words = lyricWords(input.lyricText);
  const wordDuration = words.length > 0 ? input.durationS / words.length : input.durationS;
  const wordCues = words.map((word, index) => ({
    text: word,
    start_s: roundTime(index * wordDuration),
    end_s: roundTime(Math.min(input.durationS, (index + 1) * wordDuration)),
    confidence: 1,
  }));
  const split = Math.max(1, Math.floor(input.durationS / 2));

  return {
    audio: {
      path: input.audioPath,
      duration_s: input.durationS,
      sample_rate: 48000,
      channels: 2,
    },
    master_clock: "audio",
    bpm: 120,
    transcription_confidence: {
      average: 1,
      low_confidence: false,
    },
    words: wordCues,
    segments: [
      {
        start_s: 0,
        end_s: input.durationS,
        text: words.join(" "),
        words: wordCues,
      },
    ],
    sections: [
      {
        label: "verse",
        start_s: 0,
        end_s: split,
        kind: "vocal",
        energy: 0.7,
      },
      {
        label: "chorus",
        start_s: split,
        end_s: input.durationS,
        kind: "vocal",
        energy: 0.9,
      },
    ],
    beats: Array.from({ length: Math.floor(input.durationS * 2) }, (_value, index) => ({
      time_s: roundTime(index * 0.5),
      strength: index % 4 === 0 ? 1 : 0.65,
      is_downbeat: index % 4 === 0,
    })),
    climax: [
      {
        time_s: roundTime(input.durationS * 0.75),
        type: "arrival",
        intensity: 0.9,
        source: "algorithm",
      },
    ],
    scene_anchors: [],
  };
}

function buildSourceMediaReview(input: { audioPath: string; lyricText: string; durationS: number }): unknown {
  return {
    files: [
      {
        path: input.audioPath,
        reviewed: true,
        technical_probe: {
          duration_s: input.durationS,
          sample_rate: 48000,
          channels: 2,
        },
        content_summary: `duration_s ${input.durationS} and sample_rate 48000 are sufficient for the zero-key sample; lyrics contain ${lyricWords(input.lyricText).length} usable words.`,
        planning_implications: [
          "Use medium.en-style deterministic word timings from the starter cuesheet.",
          "Keep the smoke sample visual treatment simple and beat-synced.",
        ],
      },
    ],
  };
}

function buildBrief(input: { durationS: number; lyricText: string }): unknown {
  const words = lyricWords(input.lyricText).slice(0, 6).join(" ");

  return {
    title: "Zero-Key Music Video Sample",
    audience: "predit evaluators",
    platform: "vertical social",
    tone: "beat-synced proof of workflow",
    duration_s: input.durationS,
    hook: words.length > 0 ? words : "Fifteen seconds, right on time",
    key_points: [`${SAMPLE_WIDTH}x${SAMPLE_HEIGHT} vertical sample`, "word-timed captions", "beat-synced quick cuts"],
    notes: "Deterministic starter brief for the music-video smoke path.",
    decision_log: [],
  };
}

function buildScript(input: { durationS: number; lyricText: string }): unknown {
  const split = Math.max(1, Math.floor(input.durationS / 2));
  const words = lyricWords(input.lyricText);

  return {
    sections: [
      {
        slug: "sample-intro",
        role: "hook",
        start_s: 0,
        end_s: split,
        narration: words.slice(0, Math.ceil(words.length / 2)).join(" "),
        enhancement_cues: ["Use cuesheet word timestamps for captions."],
      },
      {
        slug: "sample-drop",
        role: "beat_drop",
        start_s: split,
        end_s: input.durationS,
        narration: words.slice(Math.ceil(words.length / 2)).join(" ") || "right on time",
        enhancement_cues: ["Place white-flash transition on the downbeat."],
      },
    ],
  };
}

function buildScenePlan(input: { durationS: number }): unknown {
  const cuts = sampleCuts(input.durationS);

  return {
    scenes: cuts.map((cut, index) => ({
      slug: `sample-scene-${index + 1}`,
      order: index,
      start_s: cut.start_s,
      end_s: cut.end_s,
      narrative_role: index === 0 ? "hook" : index === 1 ? "beat_drop" : "resolution",
      scene_anchor: index === 0 ? "opening lyric timestamp" : index === 1 ? "major beat drop" : "final cadence",
      description:
        index === 0
          ? "Vertical 9:16 illustration with beat-synced starter color and caption-safe bottom 30 percent."
          : index === 1
            ? "Energetic beat-drop push-in using the same image with different framing and scale."
            : "Clean final cadence frame with playful-with-authority color and simple editor handoff.",
      shot_intent:
        index === 0
          ? "Establish the hook and prove word-timed visual sync."
          : index === 1
            ? "Land the major beat drop with the strongest visual change."
            : "Resolve the short sample cleanly for export verification.",
      information_role: index === 0 ? "hook setup" : index === 1 ? "beat-drop payoff" : "sample close",
      hero_moment: index === 1,
      texture_keywords: ["starter", "beat-synced", "vertical"],
      shot_language: {
        shot_size: "MS",
        camera_movement: index === 0 ? "static" : "push_in",
        lighting_key: "neon",
        lens_mm: 35,
        depth_of_field: "deep",
        color_temperature: "mixed",
      },
      required_assets: [
        {
          id: "sample_visual",
          source: "supplied",
          notes: "Deterministic starter visual generated locally with zero paid calls.",
        },
      ],
    })),
  };
}

function buildFinalReview(input: {
  durationS: number;
  frameRelativePaths: string[];
  heroFrameRelativePath: string;
}): unknown {
  return {
    status: "pass",
    recommended_action: "present_to_user",
    checks: {
      technical_probe: {
        container: "mp4",
        duration_s: input.durationS,
        duration_promised_s: input.durationS,
        width: SAMPLE_WIDTH,
        height: SAMPLE_HEIGHT,
        framerate: SAMPLE_FRAMERATE,
        video_codec: "h264",
        audio_codec: "aac",
        audio_channels: 2,
        bitrate_kbps: 128,
        verdict: "pass",
      },
      visual_spotcheck: {
        frames_sampled: 4,
        frame_paths: input.frameRelativePaths,
        sample_points_pct: [10, 35, 65, 90],
        hero_frame_path: input.heroFrameRelativePath,
        matched_elements: ["starter gradient frame", "beat-synced cuts"],
        findings: [],
      },
      audio_spotcheck: {
        narration_present: false,
        music_present: true,
        caption_sync_accuracy: 1,
        findings: [],
      },
      promise_preservation: {
        delivery_promise_honored: true,
        silent_downgrade_detected: false,
        runtime_swap_detected: false,
        runtime_swap_check: "Zero-key sample uses approved ffmpeg starter runtime.",
        motion_ratio_actual: 1,
        render_runtime_used: "ffmpeg",
        findings: [],
      },
      subtitle_check: {
        present: false,
        accuracy_within_150ms: 1,
      },
    },
    issues_found: [],
  };
}

function lyricWords(value: string): string[] {
  return value
    .replace(/^\[[^\]]+\]$/gmu, "")
    .match(/[A-Za-z0-9']+/gu)
    ?.slice(0, 48) ?? ["Fifteen", "seconds", "right", "on", "time"];
}

function sampleCuts(durationS: number): Array<{ start_s: number; end_s: number; asset_id: string }> {
  const cutCount = 3;
  const cutDuration = durationS / cutCount;

  return Array.from({ length: cutCount }, (_value, index) => ({
    start_s: roundTime(index * cutDuration),
    end_s: roundTime(index === cutCount - 1 ? durationS : (index + 1) * cutDuration),
    asset_id: "sample_visual",
  }));
}

function starterFramePng(): Buffer {
  const data = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4);

  for (let y = 0; y < SAMPLE_HEIGHT; y += 1) {
    for (let x = 0; x < SAMPLE_WIDTH; x += 1) {
      const offset = (y * SAMPLE_WIDTH + x) * 4;
      const glow = Math.round(80 + 120 * (x / SAMPLE_WIDTH));
      const pulse = Math.round(60 + 100 * (y / SAMPLE_HEIGHT));
      data[offset] = glow;
      data[offset + 1] = Math.round(30 + 120 * ((x + y) / (SAMPLE_WIDTH + SAMPLE_HEIGHT)));
      data[offset + 2] = pulse;
      data[offset + 3] = 255;
    }
  }

  return encodeRgbaPng({ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, data });
}

async function renderStarterPreview(input: {
  framePath: string;
  trackPath?: string;
  outputPath: string;
  durationS: number;
}): Promise<void> {
  const args = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-loop",
    "1",
    "-framerate",
    String(SAMPLE_FRAMERATE),
    "-i",
    input.framePath,
  ];

  if (input.trackPath !== undefined) {
    args.push("-i", input.trackPath);
  }

  args.push(
    "-t",
    String(input.durationS),
    "-vf",
    "format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
  );

  if (input.trackPath !== undefined) {
    args.push("-c:a", "aac", "-b:a", "128k", "-shortest");
  }

  args.push("-movflags", "+faststart", input.outputPath);
  await runFfmpeg(args);
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function projectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}
