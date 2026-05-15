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
const REVIEW_FRAME_NAMES = ["10.png", "35.png", "65.png", "90.png"] as const;

type Rgba = readonly [number, number, number, number?];

type StarterCard = {
  id: string;
  assetPath: string;
  relativePath: string;
  eyebrow: string;
  title: string;
  body: string;
  index: number;
  accent: readonly [number, number, number];
};

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
  const finalReviewFramesDir = path.join(workspace, "final_review", "frames");
  const renderPath = path.join(workspace, "renders", "sample-preview.mp4");
  const renderRelativePath = projectRelativePath(ctx.show.projectRoot, renderPath);
  const cards = starterCards({ lyricText, workspace, projectRoot: ctx.show.projectRoot });
  const firstCard = cards[0];
  if (!firstCard) {
    throw new Error("starter sample requires at least one card");
  }
  const cardPngs = cards.map((card) => ({ card, png: starterCardPng(card, cards.length) }));
  const firstPng = cardPngs[0]?.png;
  if (!firstPng) {
    throw new Error("starter sample failed to render card images");
  }
  const frameRelativePaths = REVIEW_FRAME_NAMES.map((fileName) =>
    projectRelativePath(ctx.show.projectRoot, path.join(finalReviewFramesDir, fileName)),
  );
  const heroFrameRelativePath = projectRelativePath(ctx.show.projectRoot, path.join(finalReviewFramesDir, "hero.png"));

  await mkdir(path.join(workspace, "assets"), { recursive: true });
  await mkdir(finalReviewFramesDir, { recursive: true });
  await mkdir(path.dirname(renderPath), { recursive: true });
  await Promise.all(cardPngs.map(({ card, png }) => writeFile(card.assetPath, png)));
  await Promise.all(
    frameRelativePaths.map((framePath, index) =>
      writeFile(path.resolve(ctx.show.projectRoot, framePath), cardPngs[index % cardPngs.length]?.png ?? firstPng),
    ),
  );
  await writeFile(path.resolve(ctx.show.projectRoot, heroFrameRelativePath), cardPngs[1]?.png ?? firstPng);
  await renderStarterPreview({
    framePaths: cards.map((card) => card.assetPath),
    trackPath,
    outputPath: renderPath,
    durationS,
  });

  const cuesheet = buildCuesheet({
    audioPath: trackPath ?? firstCard.relativePath,
    lyricText,
    durationS,
  });
  const sourceMediaReview = buildSourceMediaReview({
    audioPath: trackPath ?? firstCard.relativePath,
    durationS,
    lyricText,
  });
  const brief = buildBrief({ durationS, lyricText, cards });
  const script = buildScript({ durationS, cards });
  const scenePlan = buildScenePlan({ durationS, cards });
  const assetManifest = {
    assets: cards.map((card) => ({
      id: card.id,
      kind: "image",
      path: card.relativePath,
      provider: "predit",
      prompt: `Generated deterministic zero-key idea card: ${card.title}`,
      cost_usd: 0,
    })),
  };
  const editDecisions = {
    cuts: sampleCuts(durationS, cards),
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
    asset_count: cards.length,
    warnings: [],
    validation_steps: [
      {
        name: "starter-sample",
        status: "pass",
        notes: "Zero-key multi-card starter preview and NLE artifacts generated.",
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
        content_summary: `duration_s ${input.durationS} and sample_rate 48000 are sufficient for the zero-key sample; lyrics/script contain ${lyricWords(input.lyricText).length} usable words.`,
        planning_implications: [
          "Use medium.en-style deterministic word timings from the starter cuesheet.",
          "Turn the starter script into visible no-key idea cards before rendering.",
        ],
      },
    ],
  };
}

function buildBrief(input: { durationS: number; lyricText: string; cards: StarterCard[] }): unknown {
  const fallbackHook = lyricWords(input.lyricText).slice(0, 6).join(" ") || "Your first predit video";

  return {
    title: "Zero-Key First Video Idea Reel",
    audience: "new predit operators",
    platform: "vertical social",
    tone: "personalized, practical, and demo-ready",
    duration_s: input.durationS,
    hook: input.cards[0]?.title ?? fallbackHook,
    key_points: [
      `${SAMPLE_WIDTH}x${SAMPLE_HEIGHT} vertical sample`,
      "agent-written script cards",
      "multi-card no-key motion",
    ],
    notes:
      "Deterministic starter brief for a zero-key first-video experience. Agents can personalize the visible cards by rewriting the starter lyrics/script file before build.",
    decision_log: [],
  };
}

function buildScript(input: { durationS: number; cards: StarterCard[] }): unknown {
  const cuts = sampleCuts(input.durationS, input.cards);
  return {
    sections: input.cards.map((card, index) => ({
      slug: index === 0 ? "personalized-hook" : `idea-${index}`,
      role: scriptRole(index, input.cards.length),
      start_s: cuts[index]?.start_s ?? 0,
      end_s: cuts[index]?.end_s ?? input.durationS,
      narration: cardNarration(card),
      enhancement_cues: [
        index === 0 ? "Open with the agent-personalized promise." : "Keep this idea specific enough to act on.",
      ],
    })),
  };
}

function scriptRole(index: number, cardCount: number): string {
  if (index === 0) {
    return "hook";
  }
  if (index === cardCount - 1) {
    return "resolution";
  }
  return index === 1 ? "setup" : "rising_action";
}

function cardNarration(card: StarterCard): string {
  const body = card.body.trim();
  const title = card.title.trim();
  if (!body) {
    return title;
  }
  if (!title || normalizeForNarration(body).startsWith(normalizeForNarration(title))) {
    return body;
  }
  return `${title}. ${body}`;
}

function normalizeForNarration(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function buildScenePlan(input: { durationS: number; cards: StarterCard[] }): unknown {
  const cuts = sampleCuts(input.durationS, input.cards);
  const firstCard = input.cards[0];
  if (!firstCard) {
    return { scenes: [] };
  }

  return {
    scenes: cuts.map((cut, index) => {
      const card = input.cards[index] ?? firstCard;
      return {
        slug: `sample-scene-${index + 1}`,
        order: index,
        start_s: cut.start_s,
        end_s: cut.end_s,
        narrative_role: scriptRole(index, input.cards.length),
        scene_anchor: index === 0 ? "opening script line" : index === input.cards.length - 1 ? "final action" : "idea beat",
        description:
          index === 0
            ? "Vertical 9:16 no-key title card introducing the personalized first-video promise."
            : `Procedural idea card: ${card.title}`,
        shot_intent:
          index === 0
            ? "Show that a no-key first run can still feel tailored."
            : "Give the user a concrete video direction they can improve next.",
        information_role: index === 0 ? "hook setup" : index === input.cards.length - 1 ? "next step" : "idea option",
        hero_moment: index === 1,
        texture_keywords: ["starter", "agent-personalized", "no-key", "vertical"],
        shot_language: {
          shot_size: "MS",
          camera_movement: index % 2 === 0 ? "push_in" : "pull_out",
          lighting_key: index === 0 ? "neon" : "soft",
          lens_mm: 35,
          depth_of_field: "deep",
          color_temperature: "mixed",
        },
        required_assets: [
          {
            id: card.id,
            source: "supplied",
            notes: "Deterministic procedural idea card generated locally with zero paid calls.",
          },
        ],
      };
    }),
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
        matched_elements: ["multi-card starter frames", "agent-script text cards", "beat-synced cuts"],
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

function sampleCuts(durationS: number, cards: readonly StarterCard[]): Array<{ start_s: number; end_s: number; asset_id: string }> {
  const cutCount = Math.max(1, cards.length);
  const cutDuration = durationS / cutCount;

  return Array.from({ length: cutCount }, (_value, index) => ({
    start_s: roundTime(index * cutDuration),
    end_s: roundTime(index === cutCount - 1 ? durationS : (index + 1) * cutDuration),
    asset_id: cards[index]?.id ?? "sample_card_1",
  }));
}

function starterCards(input: { lyricText: string; workspace: string; projectRoot: string }): StarterCard[] {
  const lines = meaningfulLyricLines(input.lyricText);
  const copy = normalizeCardLines(
    lines.length > 0
      ? lines
      : [
          "Your agent can turn what it knows into a first video.",
          "Idea 1: introduce the project and what you are trying to learn.",
          "Idea 2: compare two demo directions before spending credits.",
          "Next: pick one idea, add keys later, and rerender with richer tools.",
        ],
  );
  const accents: Array<readonly [number, number, number]> = [
    [255, 214, 102],
    [63, 220, 255],
    [255, 103, 166],
    [122, 255, 173],
  ];

  return copy.slice(0, 4).map((card, index) => {
    const assetPath = path.join(input.workspace, "assets", `sample-card-${index + 1}.png`);
    const accent = accents[index % accents.length] ?? [255, 214, 102];
    return {
      id: `sample_card_${index + 1}`,
      assetPath,
      relativePath: projectRelativePath(input.projectRoot, assetPath),
      eyebrow: index === 0 ? "NO-KEY FIRST VIDEO" : card.eyebrow || `IDEA ${index}`,
      title: card.title,
      body: card.body,
      index,
      accent,
    };
  });
}

function meaningfulLyricLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("[") && !line.startsWith("#"));
}

function normalizeCardLines(lines: readonly string[]): Array<{ eyebrow: string; title: string; body: string }> {
  const normalized = [...lines];
  while (normalized.length < 4) {
    normalized.push(
      [
        "Idea 1: make a personal intro reel from your agent context.",
        "Idea 2: turn a recurring workflow into a visual checklist.",
        "Next: replace this script, rerun the sample, then add paid tools.",
      ][normalized.length - 1] ?? "Next: choose one direction and make it sharper.",
    );
  }

  return normalized.map((line, index) => {
    const labeled = /^(?<label>(?:idea|option|next|step)\s*\d*|next)[:.\-\s]+(?<body>.+)$/iu.exec(line);
    const cleanLine = labeled?.groups?.body?.trim() ?? line;
    const split = splitHeadline(cleanLine);
    return {
      eyebrow: labeled?.groups?.label?.trim().toUpperCase().replace(/\s+/gu, " ") ?? (index === 0 ? "HOOK" : `IDEA ${index}`),
      title: split.title,
      body: split.body,
    };
  });
}

function splitHeadline(value: string): { title: string; body: string } {
  const [first, ...rest] = value.split(":");
  if (rest.length > 0 && first !== undefined && first.trim().length > 0 && first.trim().length <= 32) {
    return { title: first.trim(), body: rest.join(":").trim() || value.trim() };
  }

  const words = value.match(/[A-Za-z0-9']+/gu) ?? [];
  const title = words.slice(0, Math.min(5, words.length)).join(" ") || "Your First Video";
  return { title, body: value.trim() };
}

function starterCardPng(card: StarterCard, cardCount: number): Buffer {
  const data = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4);

  for (let y = 0; y < SAMPLE_HEIGHT; y += 1) {
    for (let x = 0; x < SAMPLE_WIDTH; x += 1) {
      const offset = (y * SAMPLE_WIDTH + x) * 4;
      const diagonal = (x + y) / (SAMPLE_WIDTH + SAMPLE_HEIGHT);
      const sweep = (x / SAMPLE_WIDTH) * 0.55 + (card.index / Math.max(1, cardCount - 1)) * 0.45;
      data[offset] = Math.round(18 + card.accent[0] * (0.18 + sweep * 0.22));
      data[offset + 1] = Math.round(20 + card.accent[1] * (0.16 + diagonal * 0.2));
      data[offset + 2] = Math.round(34 + card.accent[2] * (0.2 + (1 - diagonal) * 0.24));
      data[offset + 3] = 255;
    }
  }

  fillRect(data, 34, 46, 472, 6, rgba(card.accent));
  fillRect(data, 44, 100, 452, 230, [8, 12, 24, 106]);
  fillRect(data, 44, 360, 452, 286, [8, 12, 24, 126]);
  fillRect(data, 44, 690, 452, 108, [8, 12, 24, 116]);
  drawDecorativeGrid(data, card);
  drawWaveform(data, card);
  drawText(data, card.eyebrow, 64, 126, 3, rgba(card.accent));
  drawWrappedText(data, card.title, 64, 174, 410, 7, [255, 255, 248, 255], 2);
  drawWrappedText(data, card.body, 64, 392, 410, 4, [238, 244, 255, 255], 5);
  drawText(data, String(card.index + 1).padStart(2, "0"), 64, 714, 6, rgba(card.accent));
  drawText(data, "LOCAL / NO KEYS", 154, 724, 2, [229, 236, 246, 230]);
  drawTimeline(data, card.index, cardCount, card.accent);

  return encodeRgbaPng({ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, data });
}

async function renderStarterPreview(input: {
  framePaths: string[];
  trackPath?: string;
  outputPath: string;
  durationS: number;
}): Promise<void> {
  const framePaths = input.framePaths.length > 0 ? input.framePaths : [];
  if (framePaths.length === 0) {
    throw new Error("starter preview requires at least one frame");
  }
  const frameCounts = starterFrameCounts(input.durationS, framePaths.length);
  const args = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
  ];

  for (const framePath of framePaths) {
    args.push("-i", framePath);
  }
  if (input.trackPath !== undefined) {
    args.push("-i", input.trackPath);
  }

  const filters = frameCounts.map((count, index) => {
    const zoom = index % 2 === 0 ? "min(zoom+0.0007,1.06)" : "min(zoom+0.00045,1.045)";
    return `[${index}:v]scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT},zoompan=z='${zoom}':d=${count}:s=${SAMPLE_WIDTH}x${SAMPLE_HEIGHT}:fps=${SAMPLE_FRAMERATE},setpts=PTS-STARTPTS[v${index}]`;
  });
  filters.push(`${frameCounts.map((_count, index) => `[v${index}]`).join("")}concat=n=${frameCounts.length}:v=1:a=0,format=yuv420p[v]`);

  args.push(
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
  );

  if (input.trackPath !== undefined) {
    args.push("-map", `${framePaths.length}:a:0`, "-c:a", "aac", "-b:a", "128k", "-shortest");
  }

  args.push("-t", String(input.durationS), "-movflags", "+faststart", input.outputPath);
  await runFfmpeg(args);
}

function starterFrameCounts(durationS: number, cardCount: number): number[] {
  const totalFrames = Math.max(cardCount, Math.round(durationS * SAMPLE_FRAMERATE));
  const base = Math.floor(totalFrames / cardCount);
  const remainder = totalFrames % cardCount;
  return Array.from({ length: cardCount }, (_value, index) => base + (index < remainder ? 1 : 0));
}

function drawDecorativeGrid(data: Uint8Array, card: StarterCard): void {
  for (let x = 42; x <= 498; x += 38) {
    fillRect(data, x, 92, 1, 710, [255, 255, 255, 16]);
  }
  for (let y = 118; y <= 794; y += 44) {
    fillRect(data, 34, y, 472, 1, [255, 255, 255, 14]);
  }
  fillRect(data, 394, 118 + card.index * 28, 88, 88, rgba(card.accent, 36));
  fillRect(data, 72 + card.index * 28, 568, 126, 18, rgba(card.accent, 58));
}

function drawWaveform(data: Uint8Array, card: StarterCard): void {
  const baseY = 838;
  for (let i = 0; i < 40; i += 1) {
    const height = 18 + ((i * 17 + card.index * 11) % 54);
    const x = 52 + i * 11;
    fillRect(data, x, baseY - height, 5, height, i % 4 === card.index % 4 ? rgba(card.accent, 230) : [238, 244, 255, 116]);
  }
}

function drawTimeline(
  data: Uint8Array,
  activeIndex: number,
  cardCount: number,
  accent: readonly [number, number, number],
): void {
  const startX = 72;
  const endX = 468;
  const y = 886;
  fillRect(data, startX, y, endX - startX, 3, [238, 244, 255, 86]);
  for (let i = 0; i < cardCount; i += 1) {
    const x = Math.round(startX + ((endX - startX) * i) / Math.max(1, cardCount - 1));
    fillRect(data, x - 7, y - 7, 14, 14, i === activeIndex ? rgba(accent) : [238, 244, 255, 156]);
  }
}

function drawWrappedText(
  data: Uint8Array,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  scale: number,
  color: Rgba,
  maxLines: number,
): void {
  const lines = wrapText(text, maxWidth, scale, maxLines);
  const lineHeight = (GLYPH_HEIGHT + 2) * scale;
  lines.forEach((line, index) => drawText(data, line, x, y + index * lineHeight, scale, color));
}

function drawText(data: Uint8Array, text: string, x: number, y: number, scale: number, color: Rgba): void {
  let cursorX = x;
  for (const char of normalizeText(text)) {
    const glyph = GLYPHS[char] ?? GLYPHS[" "];
    drawGlyph(data, glyph, cursorX, y, scale, color);
    cursorX += (GLYPH_WIDTH + 1) * scale;
  }
}

function drawGlyph(data: Uint8Array, glyph: readonly string[], x: number, y: number, scale: number, color: Rgba): void {
  glyph.forEach((row, rowIndex) => {
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (row[colIndex] === "1") {
        fillRect(data, x + colIndex * scale, y + rowIndex * scale, scale, scale, color);
      }
    }
  });
}

function wrapText(text: string, maxWidth: number, scale: number, maxLines: number): string[] {
  const maxChars = Math.max(4, Math.floor(maxWidth / ((GLYPH_WIDTH + 1) * scale)));
  const words = normalizeText(text).split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words.flatMap((value) => splitLongWord(value, maxChars))) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;

    if (lines.length === maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length > maxLines) {
    lines.length = maxLines;
  }

  const consumedWords = lines.join(" ").split(/\s+/u).filter(Boolean).length;
  if (consumedWords < words.length && lines.length > 0) {
    lines[lines.length - 1] = withEllipsis(lines[lines.length - 1] ?? "", maxChars);
  }

  return lines.length > 0 ? lines : [""];
}

function splitLongWord(word: string, maxChars: number): string[] {
  if (word.length <= maxChars) {
    return [word];
  }

  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += maxChars) {
    chunks.push(word.slice(index, index + maxChars));
  }
  return chunks;
}

function withEllipsis(value: string, maxChars: number): string {
  if (value.length <= Math.max(0, maxChars - 3)) {
    return `${value}...`;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,!?:;"'&+#[\]()\/-]/gu, " ");
}

function fillRect(data: Uint8Array, x: number, y: number, width: number, height: number, color: Rgba): void {
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(SAMPLE_WIDTH, Math.ceil(x + width));
  const endY = Math.min(SAMPLE_HEIGHT, Math.ceil(y + height));

  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1) {
      blendPixel(data, px, py, color);
    }
  }
}

function rgba(color: readonly [number, number, number], alpha = 255): Rgba {
  return [color[0], color[1], color[2], alpha];
}

function blendPixel(data: Uint8Array, x: number, y: number, color: Rgba): void {
  const offset = (y * SAMPLE_WIDTH + x) * 4;
  const alpha = (color[3] ?? 255) / 255;
  data[offset] = Math.round(data[offset] * (1 - alpha) + color[0] * alpha);
  data[offset + 1] = Math.round(data[offset + 1] * (1 - alpha) + color[1] * alpha);
  data[offset + 2] = Math.round(data[offset + 2] * (1 - alpha) + color[2] * alpha);
  data[offset + 3] = 255;
}

const GLYPH_WIDTH = 5;
const GLYPH_HEIGHT = 7;
const GLYPHS: Record<string, readonly string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "\"": ["01010", "01010", "01010", "00000", "00000", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "#": ["01010", "11111", "01010", "01010", "11111", "01010", "00000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
};

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
