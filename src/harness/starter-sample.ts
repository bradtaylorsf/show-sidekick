import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CostEntry } from "../artifacts/cost-log.js";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import { encodeRgbaPng } from "../media/png.js";
import { projectDir } from "../checkpoints/paths.js";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import type { StageContext } from "./context.js";
import type { Dispatcher } from "./dispatcher.js";
import type { StageResult } from "./result.js";

type StarterSampleArtifactSet = {
  cuesheet: unknown;
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
      cost_entries: [zeroCostEntry(ctx)],
      decisions: stageDecisions(ctx),
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
  const renderPath = path.join(workspace, "renders", "sample-preview.mp4");
  const assetRelativePath = projectRelativePath(ctx.show.projectRoot, assetPath);
  const renderRelativePath = projectRelativePath(ctx.show.projectRoot, renderPath);

  await mkdir(path.dirname(assetPath), { recursive: true });
  await mkdir(path.dirname(renderPath), { recursive: true });
  const image = starterFramePng();
  await writeFile(assetPath, image);
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
  };

  return {
    cuesheet,
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

function zeroCostEntry(ctx: StageContext): CostEntry {
  return {
    tool: "starter_sample",
    provider: "predit",
    model: "deterministic-zero-key",
    units: 1,
    usd: 0,
    mode: ctx.runOptions.sample ? "sample" : "full",
  };
}

function stageDecisions(ctx: StageContext): DecisionEntry[] {
  if (ctx.stage.slug === "assets") {
    return [
      decisionEntry(
        ctx,
        "assets",
        "provider_selection",
        "predit-zero-key",
        "Use deterministic local starter assets so the zero-key demo lane can run without provider credentials.",
      ),
    ];
  }

  if (ctx.stage.slug === "edit" || ctx.stage.slug === "compose") {
    return [
      decisionEntry(
        ctx,
        ctx.stage.slug,
        "render_runtime_selection",
        "ffmpeg",
        "Use ffmpeg for the deterministic starter sample rough cut and editor handoff.",
      ),
    ];
  }

  return [];
}

function decisionEntry(
  ctx: StageContext,
  stage: string,
  category: DecisionEntry["category"],
  picked: string,
  reason: string,
): DecisionEntry {
  const timestamp = new Date().toISOString();
  const suffix = `${stage}-${category}-${picked}`.replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "").toLowerCase();

  return {
    id: `starter-sample-${suffix}-${timestamp.replace(/[^0-9A-Z]/gu, "")}`,
    stage,
    timestamp,
    category,
    options_considered: [
      { label: picked, rejected_because: null, notes: "Selected for the zero-key starter sample." },
      { label: "paid-demo", rejected_because: "The zero-key demo lane must run without provider credentials.", notes: null },
    ],
    picked,
    reason,
    confidence: 0.86,
    user_visible: true,
    supersedes: null,
  };
}
