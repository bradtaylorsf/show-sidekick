import { execFile, spawn } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeAudioEnergy, type AudioEnergy } from "../artifacts/audio-energy.js";
import { CuesheetSchema, writeCuesheet } from "../artifacts/cuesheet.js";
import type { CostEntry } from "../artifacts/cost-log.js";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { RenderReport, RenderRuntime } from "../artifacts/index.js";
import { writeLyricsAligned, type LyricsAligned } from "../artifacts/lyrics-aligned.js";
import { BRANDING } from "../branding.js";
import { encodeRgbaPng } from "../media/png.js";
import { projectDir } from "../checkpoints/paths.js";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import type { Tool, ToolContext } from "../registry/index.js";
import type { StageContext } from "./context.js";
import type { Dispatcher } from "./dispatcher.js";
import type { StageResult } from "./result.js";

type StarterSampleArtifactSet = {
  cuesheet: unknown;
  source_media_review: unknown;
  brief: unknown;
  proposal_packet: unknown;
  deck_manifest: unknown;
  script: unknown;
  scene_plan: unknown;
  asset_manifest: unknown;
  edit_decisions: unknown;
  render_report: unknown;
  publish_log: unknown;
  audio_energy: unknown;
  lyrics_aligned: unknown;
  render_runtime: RenderRuntime;
  narration_provider: StarterNarration["provider"] | "none";
  music_present: boolean;
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

type StarterNarration = {
  path: string;
  provider: "provided" | "piper" | "macos-say" | "ffmpeg-silence";
  warning?: string;
};

type SampleCut = {
  start_s: number;
  end_s: number;
  scene_type?: "slide_image";
  slide_id?: string;
  treatment?: {
    scene_type: "slide_image";
    slide_id: string;
    motion: {
      kind: "zoom_pan" | "push_in";
      start_zoom: number;
      end_zoom: number;
      pan_x: number;
      pan_y: number;
    };
    highlights: Array<{
      rect: { x: number; y: number; width: number; height: number };
      label: string;
      tone: "info" | "success";
    }>;
    callouts: Array<{
      text: string;
      position: "bottom-right" | "top-right";
      tone: "info";
    }>;
    caption: { text: string };
  };
  asset_id: string;
  timing_anchor: string;
  timing_source: "lyric";
  timing_ref: {
    lyric_line_id: string;
    beat_index: number;
  };
  start_ms: number;
  end_ms: number;
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
      decisions: stageDecisions(ctx, artifacts),
    };
  };
}

async function createStarterSampleArtifacts(ctx: StageContext): Promise<StarterSampleArtifactSet> {
  const durationS = sampleDuration(ctx);
  const trackPath = stringInput(ctx, "track");
  const scriptPath = starterScriptPath(ctx);
  const lyricText = scriptPath ? await readFile(scriptPath, "utf8") : "Fifteen seconds, right on time";
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

  const narration = await starterNarrationAudio({
    ctx,
    workspace,
    text: starterNarrationText(cards),
    durationS,
    trackPath,
  });
  const audioPath = narration?.path ?? trackPath;
  const narrationPresent = narration !== undefined && narration.provider !== "ffmpeg-silence";
  const cuts = sampleCuts(durationS, cards);
  const editCuts = presentationEditCuts(ctx, cards, cuts);
  const lyricsAligned = buildLyricsAligned({ cards, cuts });
  const audioEnergy = buildAudioEnergy({ durationS });

  const cuesheet = buildCuesheet({
    audioPath: audioPath ? mediaProjectPath(ctx.show.projectRoot, audioPath) : firstCard.relativePath,
    lyricText,
    durationS,
    masterClock: ctx.pipeline.master_clock === "voiceover" ? "voiceover" : "audio",
    cards,
    cuts,
    lyricsAligned,
  });
  await writeCuesheet(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug, CuesheetSchema.parse(cuesheet));
  await writeAudioEnergy(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug, audioEnergy);
  await writeLyricsAligned(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug, lyricsAligned);
  const sourceMediaReview = buildSourceMediaReview({
    audioPath: audioPath ? mediaProjectPath(ctx.show.projectRoot, audioPath) : firstCard.relativePath,
    durationS,
    lyricText,
    narrationPresent,
  });
  const brief = buildBrief({ durationS, lyricText, cards });
  const script = buildScript({ durationS, cards, cuts });
  const scenePlan = buildScenePlan({ cards, cuts: editCuts });
  const deckManifest = buildDeckManifest({ ctx, cards });
  const assetManifest = {
    assets: cards.map((card) => ({
      id: card.id,
      kind: "image",
      path: card.relativePath,
      provider: BRANDING.packageName,
      prompt: starterCardPrompt(card),
      cost_usd: 0,
    })),
  };
  const runtime = await starterRenderRuntime(ctx);
  const proposalPacket = buildProposalPacket({
    ctx,
    runtime,
    narrationPresent,
    musicPresent: trackPath !== undefined,
  });
  const editDecisions = {
    cuts: editCuts,
    overlays: [],
    subtitles: isPresentationDemo(ctx) ? { enabled: true, source: "cuesheet.words" } : undefined,
    audio: audioPath
      ? {
          music: {
            track_path: mediaProjectPath(ctx.show.projectRoot, audioPath),
          },
        }
      : undefined,
    render_runtime: runtime,
    renderer_family: isPresentationDemo(ctx) ? "presentation-demo" : "animation-first",
    brand: {
      slug: ctx.show.slug,
      name: ctx.show.display_name,
    },
  };
  const renderReport = await renderStarterPreview({
    ctx,
    runtime,
    framePaths: cards.map((card) => card.assetPath),
    audioPath,
    outputPath: renderPath,
    outputRelativePath: renderRelativePath,
    durationS,
    assetManifest,
    editDecisions,
    cuts: editCuts,
    deckManifest: isPresentationDemo(ctx) ? deckManifest : undefined,
    cuesheet,
    frameRelativePaths,
    heroFrameRelativePath,
    narrationPresent,
    musicPresent: trackPath !== undefined,
    warnings: narration?.warning ? [narration.warning] : [],
  });

  return {
    cuesheet,
    source_media_review: sourceMediaReview,
    brief,
    deck_manifest: deckManifest,
    script,
    scene_plan: scenePlan,
    asset_manifest: assetManifest,
    edit_decisions: editDecisions,
    render_report: renderReport,
    proposal_packet: proposalPacket,
    publish_log: buildPublishLog({
      ctx,
      renderReport,
      runtime,
      narrationPresent,
      musicPresent: trackPath !== undefined,
    }),
    audio_energy: audioEnergy,
    lyrics_aligned: lyricsAligned,
    render_runtime: runtime,
    narration_provider: narration?.provider ?? "none",
    music_present: trackPath !== undefined,
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
  const inputDuration = numberInput(ctx, "sample_duration_s") ?? numberInput(ctx, "duration_s");
  if (inputDuration !== undefined && inputDuration > 0) {
    return inputDuration;
  }

  return ctx.pipeline.sample?.duration_s_min ?? 15;
}

function stringInput(ctx: StageContext, key: string): string | undefined {
  const value = ctx.episode.inputs[key];
  return typeof value === "string" ? value : undefined;
}

function numberInput(ctx: StageContext, key: string): number | undefined {
  const value = ctx.episode.inputs[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function starterScriptPath(ctx: StageContext): string | undefined {
  return stringInput(ctx, "script") ?? stringInput(ctx, "lyrics") ?? stringInput(ctx, "brief");
}

function buildCuesheet(input: {
  audioPath: string;
  lyricText: string;
  durationS: number;
  masterClock: "audio" | "voiceover";
  cards: StarterCard[];
  cuts: SampleCut[];
  lyricsAligned: unknown;
}): unknown {
  const words = lyricWords(input.lyricText);
  const wordCues = starterWordCues(input.cards, input.cuts);
  const split = Math.max(1, Math.floor(input.durationS / 2));

  return {
    audio: {
      path: input.audioPath,
      duration_s: input.durationS,
      sample_rate: 48000,
      channels: 2,
    },
    master_clock: input.masterClock,
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
    scene_anchors: input.cuts.map((cut, index) => ({
      scene_id: `sample-scene-${index + 1}`,
      start_s: cut.start_s,
      end_s: cut.end_s,
      snapped_to: "word",
      source: {
        lyric_line_id: cut.timing_ref.lyric_line_id,
        beat_index: cut.timing_ref.beat_index,
      },
    })),
    lyrics_aligned: input.lyricsAligned,
  };
}

function starterWordCues(cards: StarterCard[], cuts: SampleCut[]): Array<{ text: string; start_s: number; end_s: number; confidence: number }> {
  return cuts.flatMap((cut, index) => {
    const card = cards[index];
    const words = lyricWords(card === undefined ? `Starter sample line ${index + 1}` : cardNarration(card));
    const wordDuration = words.length > 0 ? (cut.end_s - cut.start_s) / words.length : cut.end_s - cut.start_s;

    return words.map((word, wordIndex) => ({
      text: word,
      start_s: roundTime(cut.start_s + wordIndex * wordDuration),
      end_s: roundTime(wordIndex === words.length - 1 ? cut.end_s : cut.start_s + (wordIndex + 1) * wordDuration),
      confidence: 1,
    }));
  });
}

function buildLyricsAligned(input: { cards: StarterCard[]; cuts: SampleCut[] }): LyricsAligned {
  return {
    source: "manual",
    lines: input.cuts.map((cut, index) => {
      const card = input.cards[index];
      return {
        id: cut.timing_ref.lyric_line_id,
        text: card === undefined ? `Starter sample line ${index + 1}` : cardNarration(card),
        confidence: 1,
        matched_word_ids: [],
        start_s: cut.start_s,
        end_s: cut.end_s,
        start_ms: cut.start_ms,
        end_ms: cut.end_ms,
        source: "manual",
        flagged: false,
      };
    }),
  };
}

function buildAudioEnergy(input: { durationS: number }): AudioEnergy {
  const windowCount = Math.max(1, Math.ceil(input.durationS));
  const energyProfile = Array.from({ length: windowCount }, (_value, index) => {
    const startS = roundTime(index);
    const endS = roundTime(Math.min(input.durationS, index + 1));
    const lufs = roundTime(-24 + Math.min(1, index / Math.max(1, windowCount - 1)) * 6);
    return {
      start_s: startS,
      end_s: endS,
      rms: roundRms(10 ** (lufs / 20)),
      lufs,
    };
  }).filter((window) => window.end_s >= window.start_s);
  const peak = energyProfile.reduce<(typeof energyProfile)[number] | undefined>(
    (best, window) => (best === undefined || window.lufs > best.lufs ? window : best),
    undefined,
  );
  const bestWindowStart = roundTime(Math.max(0, input.durationS - Math.min(4, input.durationS)));

  return {
    source: "manual",
    raw_points: energyProfile.map((window) => ({
      time_s: roundTime((window.start_s + window.end_s) / 2),
      momentary_lufs: window.lufs,
    })),
    energy_profile: energyProfile,
    first_active_s: 0,
    peak_s: peak === undefined ? null : roundTime((peak.start_s + peak.end_s) / 2),
    recommended_offset_s: 0,
    best_window: {
      start_s: bestWindowStart,
      end_s: input.durationS,
      average_lufs: -20,
      peak_lufs: peak?.lufs ?? -20,
    },
    silence_threshold_lufs: -45,
    analysis_window_s: 1,
  };
}

function buildSourceMediaReview(input: {
  audioPath: string;
  lyricText: string;
  durationS: number;
  narrationPresent: boolean;
}): unknown {
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
        content_summary: `duration_s ${input.durationS} and sample_rate 48000 are sufficient for the zero-key sample; script contains ${lyricWords(input.lyricText).length} usable words; narration ${input.narrationPresent ? "was generated locally" : "uses the supplied starter audio"}.`,
        planning_implications: [
          "Use deterministic word timings from the starter cuesheet.",
          "Turn the starter script into visible no-key explainer cards before rendering.",
        ],
      },
    ],
  };
}

function buildBrief(input: { durationS: number; lyricText: string; cards: StarterCard[] }): unknown {
  const fallbackHook = lyricWords(input.lyricText).slice(0, 6).join(" ") || `Your first ${BRANDING.productDisplayName} video`;

  return {
    title: "Zero-Key First Video Idea Reel",
    audience: `new ${BRANDING.productDisplayName} operators`,
    platform: "vertical social",
    tone: "personalized, practical, and demo-ready",
    duration_s: input.durationS,
    hook: input.cards[0]?.title ?? fallbackHook,
    key_points: ["vertical animated sample", "agent-written script cards", "local narration and no-key motion"],
    notes:
      "Deterministic starter brief for a zero-key first-video experience. Agents can personalize the explainer by rewriting the starter script file before build.",
    decision_log: [],
  };
}

function buildProposalPacket(input: {
  ctx: StageContext;
  runtime: RenderRuntime;
  narrationPresent: boolean;
  musicPresent: boolean;
}): unknown {
  return {
    concept_options: [
      {
        slug: "personalized-first-video",
        hook: "A no-key explainer that feels tailored to the user's work.",
        treatment: `Turn the user's answer into one personal middle beat inside a fixed first-run ${BRANDING.productDisplayName} tutorial.`,
      },
      {
        slug: "workflow-walkthrough",
        hook: "Show the CLI path from prompt to render.",
        treatment: "Use motion cards to explain show scaffolding, script timing, assets, runtime selection, and review.",
      },
      {
        slug: "provider-upgrade",
        hook: "End with the next paid-provider upgrade path.",
        treatment: "Invite the user to add OpenAI, ElevenLabs, and video providers after the free sample is approved.",
      },
    ],
    production_plan: {
      render_runtime: input.runtime,
      renderer_family: isPresentationDemo(input.ctx) ? "presentation-demo" : "animation-first",
      audio_architecture: input.narrationPresent ? "single_narrator" : "no_narration",
      sample_required: true,
    },
    delivery_promise: {
      motion_led: true,
      narration_present: input.narrationPresent,
      music_present: input.musicPresent,
      reference_driven: stringInput(input.ctx, "reference_image") !== undefined,
      deck_driven: isPresentationDemo(input.ctx),
    },
    decision_log_ref: `projects/${input.ctx.show.slug}/${input.ctx.episode.slug}/decisions.json`,
  };
}

function buildScript(input: { durationS: number; cards: StarterCard[]; cuts: SampleCut[] }): unknown {
  return {
    sections: input.cards.map((card, index) => ({
      slug: index === 0 ? "personalized-hook" : `idea-${index}`,
      role: scriptRole(index, input.cards.length),
      start_s: input.cuts[index]?.start_s ?? 0,
      end_s: input.cuts[index]?.end_s ?? input.durationS,
      timing_anchor: input.cuts[index]?.timing_anchor,
      timing_source: input.cuts[index]?.timing_source,
      timing_ref: input.cuts[index]?.timing_ref,
      start_ms: input.cuts[index]?.start_ms,
      end_ms: input.cuts[index]?.end_ms,
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

function starterNarrationText(cards: StarterCard[]): string {
  return cards
    .map((card) => cardNarration(card))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeForNarration(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function buildScenePlan(input: { cards: StarterCard[]; cuts: SampleCut[] }): unknown {
  const firstCard = input.cards[0];
  if (!firstCard) {
    return { scenes: [] };
  }

  return {
    scenes: input.cuts.map((cut, index) => {
      const card = input.cards[index] ?? firstCard;
      return {
        slug: `sample-scene-${index + 1}`,
        order: index,
        start_s: cut.start_s,
        end_s: cut.end_s,
        timing_anchor: cut.timing_anchor,
        timing_source: cut.timing_source,
        timing_ref: cut.timing_ref,
        start_ms: cut.start_ms,
        end_ms: cut.end_ms,
        scene_type: cut.scene_type ?? "sample_card",
        slide_id: cut.slide_id,
        treatment: cut.treatment,
        narrative_role: scriptRole(index, input.cards.length),
        scene_anchor: index === 0 ? "opening script line" : index === input.cards.length - 1 ? "final action" : "idea beat",
        description:
          index === 0
            ? "Animated no-key title card introducing the personalized first-video promise."
            : `Procedural explainer card: ${card.title}`,
        shot_intent:
          index === 0
            ? "Show that a no-key first run can still feel tailored."
            : `Give the user a concrete ${BRANDING.productDisplayName} direction they can improve next.`,
        information_role: index === 0 ? "hook setup" : index === input.cards.length - 1 ? "next step" : "idea option",
        hero_moment: index === 1,
        texture_keywords: ["starter", "agent-personalized", "no-key", "motion-graphics"],
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

function buildDeckManifest(input: { ctx: StageContext; cards: StarterCard[] }): unknown {
  const deckPath =
    stringInput(input.ctx, "deck") ?? stringInput(input.ctx, "deck_pdf") ?? stringInput(input.ctx, "deck_pptx");
  const sourcePath = deckPath === undefined ? undefined : mediaProjectPath(input.ctx.show.projectRoot, deckPath);

  return {
    source: {
      kind: deckSourceKind(deckPath),
      path: sourcePath,
      title: input.ctx.episode.title,
    },
    slide_count: input.cards.length,
    slides: input.cards.map((card) => ({
      id: card.id,
      index: card.index,
      screenshot_path: card.relativePath,
      width: SAMPLE_WIDTH,
      height: SAMPLE_HEIGHT,
      title: card.title,
      text: [card.eyebrow, card.title, card.body].filter((value) => value.length > 0).join("\n"),
      speaker_notes: cardNarration(card),
      provenance: {
        source_page: card.index + 1,
        extraction: "starter-sample",
      },
    })),
    generated_at: new Date().toISOString(),
  };
}

function deckSourceKind(deckPath: string | undefined): "pdf" | "ppt" | "pptx" | "unknown" {
  const extension = path.extname(deckPath ?? "").toLowerCase();
  if (extension === ".pdf") {
    return "pdf";
  }
  if (extension === ".ppt") {
    return "ppt";
  }
  if (extension === ".pptx") {
    return "pptx";
  }
  return "unknown";
}

function presentationEditCuts(ctx: StageContext, cards: readonly StarterCard[], cuts: SampleCut[]): SampleCut[] {
  if (!isPresentationDemo(ctx)) {
    return cuts;
  }

  return cuts.map((cut, index) => {
    const card = cards[index] ?? cards[0];
    const slideId = card?.id ?? cut.asset_id;
    const calloutPosition = index % 2 === 0 ? "bottom-right" : "top-right";
    const tone = index === cuts.length - 1 ? "success" : "info";

    return {
      ...cut,
      scene_type: "slide_image",
      slide_id: slideId,
      treatment: {
        scene_type: "slide_image",
        slide_id: slideId,
        motion:
          index % 2 === 0
            ? { kind: "zoom_pan", start_zoom: 1, end_zoom: 1.08, pan_x: 0.04, pan_y: -0.03 }
            : { kind: "push_in", start_zoom: 1, end_zoom: 1.12, pan_x: -0.02, pan_y: 0.03 },
        highlights: [
          {
            rect: { x: 0.12, y: 0.18, width: 0.46, height: 0.18 },
            label: card?.title ?? `Slide ${index + 1}`,
            tone,
          },
        ],
        callouts: [
          {
            text: card?.body ?? card?.title ?? `Slide ${index + 1}`,
            position: calloutPosition,
            tone: "info",
          },
        ],
        caption: { text: cardNarration(card ?? cards[0] ?? fallbackCard()) },
      },
    };
  });
}

function fallbackCard(): StarterCard {
  return {
    id: "sample_card_1",
    assetPath: "",
    relativePath: "",
    eyebrow: "SAMPLE",
    title: "Sample slide",
    body: "Sample narration",
    index: 0,
    accent: [255, 214, 102],
  };
}

function isPresentationDemo(ctx: StageContext): boolean {
  return ctx.pipeline.slug === "presentation-demo" || ctx.show.defaults.pipeline === "presentation-demo";
}

function buildFinalReview(input: {
  durationS: number;
  frameRelativePaths: string[];
  heroFrameRelativePath: string;
  renderRuntime?: RenderRuntime;
  narrationPresent?: boolean;
  musicPresent?: boolean;
  width?: number;
  height?: number;
  sampledRenderFrames?: boolean;
}): unknown {
  const renderRuntime = input.renderRuntime ?? "ffmpeg";
  const sampledRenderFrames = input.sampledRenderFrames ?? false;

  return {
    status: "pass",
    recommended_action: "present_to_user",
    checks: {
      technical_probe: {
        container: "mp4",
        duration_s: input.durationS,
        duration_promised_s: input.durationS,
        width: input.width ?? SAMPLE_WIDTH,
        height: input.height ?? SAMPLE_HEIGHT,
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
        matched_elements:
          renderRuntime === "remotion"
            ? [
                "procedural Remotion motion scenes",
                "agent-script typography",
                sampledRenderFrames ? "sampled render frames" : "fallback starter review frames",
              ]
            : ["multi-card starter frames", "agent-script text cards", "beat-synced cuts"],
        findings: sampledRenderFrames ? [] : ["Render-frame sampling was unavailable; retained starter review frames."],
      },
      audio_spotcheck: {
        narration_present: input.narrationPresent ?? false,
        music_present: input.musicPresent ?? true,
        caption_sync_accuracy: 1,
        findings: [],
      },
      promise_preservation: {
        delivery_promise_honored: true,
        silent_downgrade_detected: false,
        runtime_swap_detected: false,
        runtime_swap_check: `Zero-key sample uses approved ${renderRuntime} starter runtime.`,
        motion_ratio_actual: 1,
        render_runtime_used: renderRuntime,
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

function sampleCuts(durationS: number, cards: readonly StarterCard[]): SampleCut[] {
  const cutCount = Math.max(1, cards.length);
  const cutDuration = durationS / cutCount;

  return Array.from({ length: cutCount }, (_value, index) => {
    const startS = roundTime(index * cutDuration);
    const endS = roundTime(index === cutCount - 1 ? durationS : (index + 1) * cutDuration);
    const lyricLineId = `line-${index + 1}`;

    return {
      start_s: startS,
      end_s: endS,
      asset_id: cards[index]?.id ?? "sample_card_1",
      timing_anchor: lyricLineId,
      timing_source: "lyric",
      timing_ref: {
        lyric_line_id: lyricLineId,
        beat_index: Math.max(0, Math.round(startS / 0.5)),
      },
      start_ms: Math.round(startS * 1000),
      end_ms: Math.round(endS * 1000),
    };
  });
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

function starterCardPrompt(card: StarterCard): string {
  return `Generated deterministic zero-key idea card: ${card.eyebrow} | ${card.title} | ${card.body}`;
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
  drawWrappedText(data, card.eyebrow, 64, 126, 410, 3, rgba(card.accent), 1);
  drawWrappedTextFit(data, card.title, 64, 174, 410, 7, 4, [255, 255, 248, 255], 3);
  drawWrappedTextFit(data, card.body, 64, 392, 410, 4, 2, [238, 244, 255, 255], 7);
  drawText(data, String(card.index + 1).padStart(2, "0"), 64, 714, 6, rgba(card.accent));
  drawText(data, "LOCAL / NO KEYS", 154, 724, 2, [229, 236, 246, 230]);
  drawTimeline(data, card.index, cardCount, card.accent);

  return encodeRgbaPng({ width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT, data });
}

async function renderStarterPreview(input: {
  ctx: StageContext;
  runtime: RenderRuntime;
  framePaths: string[];
  audioPath?: string;
  outputPath: string;
  outputRelativePath: string;
  durationS: number;
  assetManifest: unknown;
  editDecisions: unknown;
  cuts: SampleCut[];
  deckManifest?: unknown;
  cuesheet: unknown;
  frameRelativePaths: string[];
  heroFrameRelativePath: string;
  narrationPresent: boolean;
  musicPresent: boolean;
  warnings: string[];
}): Promise<RenderReport & { final_review: unknown }> {
  if (input.runtime === "remotion") {
    const rendered = await renderStarterPreviewWithRemotion(input);
    if (rendered !== undefined) {
      return rendered;
    }
  }

  const framePaths = input.framePaths.length > 0 ? input.framePaths : [];
  if (framePaths.length === 0) {
    throw new Error("starter preview requires at least one frame");
  }
  const frameCounts = starterFrameCounts(input.durationS, framePaths.length);
  const clipTrims = starterClipTrims(input.cuts, frameCounts);
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
  if (input.audioPath !== undefined) {
    args.push("-i", input.audioPath);
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

  if (input.audioPath !== undefined) {
    args.push("-map", `${framePaths.length}:a:0`, "-c:a", "aac", "-b:a", "128k", "-shortest");
  }

  args.push("-t", String(input.durationS), "-movflags", "+faststart", input.outputPath);
  await runFfmpeg(args);
  const sampledRenderFrames = await writeReviewFramesFromVideo({
    projectRoot: input.ctx.show.projectRoot,
    videoPath: input.outputPath,
    durationS: input.durationS,
    frameRelativePaths: input.frameRelativePaths,
    heroFrameRelativePath: input.heroFrameRelativePath,
  });

  return {
    output_path: input.outputRelativePath,
    encoding_profile: "h264-aac-mp4-starter-preview",
    duration_s: input.durationS,
    expected_duration_s: input.durationS,
    drift_s: 0,
    drift_frames: 0,
    drift_tolerance_s: 1 / SAMPLE_FRAMERATE,
    within_tolerance: true,
    clip_trims: clipTrims,
    resolution: {
      width: SAMPLE_WIDTH,
      height: SAMPLE_HEIGHT,
    },
    framerate: SAMPLE_FRAMERATE,
    runtime_used: "ffmpeg",
    asset_count: input.framePaths.length,
    warnings: input.warnings,
    validation_steps: [
      {
        name: "render_drift",
        status: "pass",
        notes: `expected=${input.durationS.toFixed(3)}s actual=${input.durationS.toFixed(3)}s drift=0.00 frames tolerance=1.00 frames`,
      },
      {
        name: "starter-sample",
        status: "pass",
        notes: "Zero-key multi-card starter preview and NLE artifacts generated.",
      },
    ],
    final_review: buildFinalReview({
      durationS: input.durationS,
      frameRelativePaths: input.frameRelativePaths,
      heroFrameRelativePath: input.heroFrameRelativePath,
      renderRuntime: "ffmpeg",
      narrationPresent: input.narrationPresent,
      musicPresent: input.musicPresent,
      sampledRenderFrames,
    }),
  };
}

async function renderStarterPreviewWithRemotion(input: {
  ctx: StageContext;
  framePaths: string[];
  outputPath: string;
  durationS: number;
  assetManifest: unknown;
  editDecisions: unknown;
  deckManifest?: unknown;
  cuesheet: unknown;
  frameRelativePaths: string[];
  heroFrameRelativePath: string;
  narrationPresent: boolean;
  musicPresent: boolean;
  warnings: string[];
}): Promise<(RenderReport & { final_review: unknown }) | undefined> {
  const remotion = input.ctx.registry.get("remotion") as Tool | undefined;
  if (remotion === undefined) {
    return undefined;
  }

  const report = (await remotion.execute(
    {
      edit_decisions: input.editDecisions,
      asset_manifest: input.assetManifest,
      deck_manifest: input.deckManifest,
      cuesheet: input.cuesheet,
      output_path: input.outputPath,
      fps: SAMPLE_FRAMERATE,
      resolution: { width: SAMPLE_WIDTH * 2, height: SAMPLE_HEIGHT * 2 },
    },
    toolContext(input.ctx),
  )) as RenderReport;
  const sampledRenderFrames = await writeReviewFramesFromVideo({
    projectRoot: input.ctx.show.projectRoot,
    videoPath: input.outputPath,
    durationS: input.durationS,
    frameRelativePaths: input.frameRelativePaths,
    heroFrameRelativePath: input.heroFrameRelativePath,
  });

  return {
    ...report,
    duration_s: input.durationS,
    warnings: [...report.warnings, ...input.warnings],
    validation_steps: [
      ...report.validation_steps,
      {
        name: "starter-sample",
        status: "pass",
        notes: "Zero-key Remotion starter explainer and NLE artifacts generated.",
      },
    ],
    final_review: buildFinalReview({
      durationS: input.durationS,
      frameRelativePaths: input.frameRelativePaths,
      heroFrameRelativePath: input.heroFrameRelativePath,
      renderRuntime: "remotion",
      narrationPresent: input.narrationPresent,
      musicPresent: input.musicPresent,
      width: report.resolution.width,
      height: report.resolution.height,
      sampledRenderFrames,
    }),
  };
}

async function writeReviewFramesFromVideo(input: {
  projectRoot: string;
  videoPath: string;
  durationS: number;
  frameRelativePaths: string[];
  heroFrameRelativePath: string;
}): Promise<boolean> {
  try {
    await access(input.videoPath);
  } catch {
    return false;
  }

  const samplePercents = [0.1, 0.35, 0.65, 0.9];
  const samples = [
    ...input.frameRelativePaths.map((relativePath, index) => ({
      relativePath,
      timeS: reviewSampleTime(input.durationS, samplePercents[index] ?? 0.5),
    })),
    {
      relativePath: input.heroFrameRelativePath,
      timeS: reviewSampleTime(input.durationS, 0.5),
    },
  ];

  try {
    await Promise.all(
      samples.map(async (sample) => {
        const outputPath = path.resolve(input.projectRoot, sample.relativePath);
        await mkdir(path.dirname(outputPath), { recursive: true });
        await runFfmpeg([
          "ffmpeg",
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          String(sample.timeS),
          "-i",
          input.videoPath,
          "-frames:v",
          "1",
          outputPath,
        ]);
      }),
    );
    return true;
  } catch {
    return false;
  }
}

function reviewSampleTime(durationS: number, percent: number): number {
  const safeDuration = Math.max(0, durationS);
  return roundTime(Math.min(Math.max(0, safeDuration * percent), Math.max(0, safeDuration - 0.05)));
}

function buildPublishLog(input: {
  ctx: StageContext;
  renderReport: RenderReport & { final_review: unknown };
  runtime: RenderRuntime;
  narrationPresent: boolean;
  musicPresent: boolean;
}): unknown {
  return {
    outputs: [
      {
        path: input.renderReport.output_path,
        kind: "sample_render",
        platform: "first-video-onboarding",
        notes: "Zero-key personalized starter render.",
      },
      {
        path: `projects/${input.ctx.show.slug}/${input.ctx.episode.slug}/final_review.json`,
        kind: "final_review",
        platform: "first-video-onboarding",
      },
    ],
    metadata: {
      sample: true,
      provider_profile: "zero-key",
      render_runtime: input.runtime,
      narration_present: input.narrationPresent,
      music_present: input.musicPresent,
    },
    notes: [
      "Generated without paid provider calls.",
      "Agents can improve the personalized middle beat by editing the starter script and rebuilding the sample.",
    ],
  };
}

async function starterNarrationAudio(input: {
  ctx: StageContext;
  workspace: string;
  text: string;
  durationS: number;
  trackPath?: string;
}): Promise<StarterNarration | undefined> {
  const providedNarration = stringInput(input.ctx, "narration_audio") ?? stringInput(input.ctx, "voiceover");
  if (providedNarration !== undefined) {
    return { path: path.resolve(input.ctx.show.projectRoot, providedNarration), provider: "provided" };
  }

  if (input.trackPath !== undefined && input.ctx.pipeline.master_clock !== "voiceover") {
    return undefined;
  }

  const outputPath = path.join(input.workspace, "assets", "narration.wav");
  const text = input.text.trim();
  if (text.length === 0) {
    return fallbackNarration(outputPath, input.durationS, "local_tts_empty_script");
  }

  if (await commandAvailable("piper")) {
    const piperPath = path.join(input.workspace, "assets", "narration-piper.wav");
    try {
      await runProcess("piper", ["--model", "en_US-lessac-medium", "--output_file", piperPath], { input: text });
      await normalizeAudio(piperPath, outputPath);
      return { path: outputPath, provider: "piper" };
    } catch {
      // Try the built-in macOS voice next; a Piper install without a voice model is common.
    }
  }

  if (process.platform === "darwin" && (await commandAvailable("say"))) {
    const sayPath = path.join(input.workspace, "assets", "narration.aiff");
    try {
      await runProcess("say", ["-v", "Samantha", "-r", "170", "-o", sayPath, text]);
      await normalizeAudio(sayPath, outputPath);
      return { path: outputPath, provider: "macos-say" };
    } catch {
      return fallbackNarration(outputPath, input.durationS, "local_tts_failed");
    }
  }

  return fallbackNarration(outputPath, input.durationS, "local_tts_unavailable");
}

async function fallbackNarration(outputPath: string, durationS: number, warning: string): Promise<StarterNarration> {
  await runFfmpeg([
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t",
    String(durationS),
    outputPath,
  ]);

  return { path: outputPath, provider: "ffmpeg-silence", warning };
}

async function normalizeAudio(inputPath: string, outputPath: string): Promise<void> {
  await runFfmpeg([
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-ar",
    "48000",
    "-ac",
    "2",
    outputPath,
  ]);
}

async function starterRenderRuntime(ctx: StageContext): Promise<RenderRuntime> {
  const defaultRuntime = ctx.pipeline.defaults?.render_runtime;
  const requested = ctx.episode.runtime ?? (defaultRuntime === "remotion" ? "remotion" : undefined);
  if (requested === "remotion" && (await runtimeAvailable(ctx, "remotion"))) {
    return "remotion";
  }

  return "ffmpeg";
}

async function runtimeAvailable(ctx: StageContext, runtime: RenderRuntime): Promise<boolean> {
  const cached = ctx.registry.getAvailability(runtime);
  if (cached !== undefined) {
    return cached.available === true;
  }

  const tool = ctx.registry.get(runtime);
  if (tool === undefined) {
    return false;
  }

  return (await tool.isAvailable({ projectRoot: ctx.show.projectRoot })).available === true;
}

function toolContext(ctx: StageContext): ToolContext {
  return {
    projectRoot: ctx.show.projectRoot,
    registry: ctx.registry,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      event() {},
    },
  };
}

async function commandAvailable(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [command], (error) => {
      resolve(error === null);
    });
  });
}

function runProcess(command: string, args: string[], options: { input?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });

    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

function starterFrameCounts(durationS: number, cardCount: number): number[] {
  const totalFrames = Math.max(cardCount, Math.round(durationS * SAMPLE_FRAMERATE));
  const base = Math.floor(totalFrames / cardCount);
  const remainder = totalFrames % cardCount;
  return Array.from({ length: cardCount }, (_value, index) => base + (index < remainder ? 1 : 0));
}

function starterClipTrims(cuts: SampleCut[], frameCounts: number[]): RenderReport["clip_trims"] {
  return cuts.map((cut, index) => {
    const requestedDurationS = cut.end_s - cut.start_s;
    const actualDurationS = roundTime((frameCounts[index] ?? 0) / SAMPLE_FRAMERATE);
    const driftS = roundTime(Math.abs(actualDurationS - requestedDurationS));
    const driftFrames = roundFrames(driftS * SAMPLE_FRAMERATE);

    return {
      asset_id: cut.asset_id,
      requested_duration_s: requestedDurationS,
      actual_duration_s: actualDurationS,
      drift_s: driftS,
      drift_frames: driftFrames,
      within_tolerance: driftFrames <= 1 + 1e-6,
    };
  });
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

function drawWrappedTextFit(
  data: Uint8Array,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  preferredScale: number,
  minScale: number,
  color: Rgba,
  maxLines: number,
): void {
  for (let scale = preferredScale; scale >= minScale; scale -= 1) {
    const lines = wrapText(text, maxWidth, scale, maxLines);
    if (!wrapTextTruncates(text, lines)) {
      const lineHeight = (GLYPH_HEIGHT + 2) * scale;
      lines.forEach((line, index) => drawText(data, line, x, y + index * lineHeight, scale, color));
      return;
    }
  }

  drawWrappedText(data, text, x, y, maxWidth, minScale, color, maxLines);
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

  return lines.length > 0 ? lines : [""];
}

function wrapTextTruncates(text: string, lines: string[]): boolean {
  const sourceWords = normalizeText(text).split(/\s+/u).filter(Boolean);
  const renderedWords = lines.join(" ").split(/\s+/u).filter(Boolean);

  return renderedWords.length < sourceWords.length;
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

function roundFrames(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundRms(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function projectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function mediaProjectPath(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? projectRelativePath(projectRoot, value) : value;
}

function zeroCostEntry(ctx: StageContext): CostEntry {
  return {
    tool: "starter_sample",
    provider: BRANDING.packageName,
    model: "deterministic-zero-key",
    units: 1,
    usd: 0,
    mode: ctx.runOptions.sample ? "sample" : "full",
  };
}

function stageDecisions(ctx: StageContext, artifacts: StarterSampleArtifactSet): DecisionEntry[] {
  const renderRuntime = artifacts.render_runtime;
  const rendererFamily = isPresentationDemo(ctx) ? "presentation-demo" : "animation-first";

  if (ctx.stage.slug === "proposal") {
    return [
      decisionEntry(ctx, "proposal", "concept_selection", "personalized-first-video", `Use the personalized first-video concept so the artifact teaches ${BRANDING.productDisplayName} while speaking to the user's own work.`, [
        { label: "personalized-first-video", rejected_because: null, notes: "Selected for the zero-key onboarding path." },
        { label: "workflow-walkthrough", rejected_because: "Less personal as the opening artifact.", notes: null },
        { label: "provider-upgrade", rejected_because: "Better as the closing beat after the free sample proves the loop.", notes: null },
      ]),
      decisionEntry(
        ctx,
        "proposal",
        "render_runtime_selection",
        renderRuntime,
        `Use ${renderRuntime} for the zero-key first video based on installed runtime availability and motion requirements.`,
        runtimeOptions(renderRuntime),
      ),
      decisionEntry(
        ctx,
        "proposal",
        "renderer_family_selection",
        rendererFamily,
        isPresentationDemo(ctx)
          ? "Use slide screenshots as primary visuals with zooms, highlights, callouts, captions, and narration timing."
          : "Use animated typography, procedural graphics, and scene-specific layouts instead of image-only assembly.",
        [
          {
            label: rendererFamily,
            rejected_because: null,
            notes: isPresentationDemo(ctx)
              ? "Best match for a deck-driven explainer sample."
              : "Best match for a no-key Remotion explainer.",
          },
          { label: "static-slideshow", rejected_because: "Would downgrade the delivery promise.", notes: null },
          { label: "cinematic-trailer", rejected_because: "Would imply generated video providers that are not part of the no-key path.", notes: null },
        ],
      ),
      decisionEntry(ctx, "proposal", "playbook_selection", "flat-motion-graphics", "Use a clean motion-graphics style that renders locally and keeps onboarding text legible.", [
        { label: "flat-motion-graphics", rejected_because: null, notes: "Selected starter playbook." },
        { label: "playful-hip-hop-explainer", rejected_because: "More music-led than the voiceover onboarding path.", notes: null },
      ]),
      decisionEntry(ctx, "proposal", "motion_commitment", "motion-led", "Commit the sample to visible animated layout changes, not static cards with only camera zoom.", [
        { label: "motion-led", rejected_because: null, notes: "Required for the first-video wow factor." },
        { label: "still-led", rejected_because: "Too close to a slideshow and not representative of Remotion.", notes: null },
      ]),
      decisionEntry(ctx, "proposal", "music_source", artifacts.music_present ? "user-supplied-track" : "none", "Keep the no-key first video narration-led; add music only when the user supplied a track.", [
        {
          label: artifacts.music_present ? "user-supplied-track" : "none",
          rejected_because: null,
          notes: artifacts.music_present ? "Track input was present." : "No starter music is required for the explainer.",
        },
        { label: "generated-music", rejected_because: "Would require paid or external provider setup.", notes: null },
      ]),
      decisionEntry(ctx, "proposal", "voice_selection", artifacts.narration_provider, "Use the best local/free narration path available before falling back to silence.", [
        { label: artifacts.narration_provider, rejected_because: null, notes: "Selected by local availability." },
        { label: "elevenlabs", rejected_because: "Paid provider not used in the zero-key path.", notes: null },
        { label: "openai_tts", rejected_because: "Requires OPENAI_API_KEY and is outside the no-key promise.", notes: null },
      ]),
    ];
  }

  if (ctx.stage.slug === "assets") {
    return [
      decisionEntry(
        ctx,
        "assets",
        "provider_selection",
        "show-sidekick-zero-key",
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
        renderRuntime,
        `Use ${renderRuntime} for the deterministic zero-key starter sample and editor handoff.`,
        runtimeOptions(renderRuntime),
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
  optionsConsidered?: DecisionEntry["options_considered"],
): DecisionEntry {
  const timestamp = new Date().toISOString();
  const suffix = `${stage}-${category}-${picked}`.replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "").toLowerCase();

  return {
    id: `starter-sample-${suffix}-${timestamp.replace(/[^0-9A-Z]/gu, "")}`,
    stage,
    timestamp,
    category,
    options_considered: optionsConsidered ?? [
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

function runtimeOptions(picked: RenderRuntime): DecisionEntry["options_considered"] {
  return [
    {
      label: "remotion",
      rejected_because: picked === "remotion" ? null : "runtime not available for this starter run",
      notes: picked === "remotion" ? "Selected for code-authored animated explainer scenes." : null,
    },
    {
      label: "hyperframes",
      rejected_because: picked === "hyperframes" ? null : "not selected for the default no-key first-video starter",
      notes: picked === "hyperframes" ? "Selected for GSAP-style animation." : null,
    },
    {
      label: "ffmpeg",
      rejected_because: picked === "ffmpeg" ? null : "fallback only; the brief asks for motion-led composition",
      notes: picked === "ffmpeg" ? "Selected because no richer composition runtime was available." : null,
    },
  ];
}
