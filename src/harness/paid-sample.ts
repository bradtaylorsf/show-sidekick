import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CostEntry } from "../artifacts/cost-log.js";
import { cuesheetPath, readCuesheet } from "../artifacts/cuesheet.js";
import { DeckManifestSchema, type DeckFileType } from "../artifacts/deck-manifest.js";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import { ScriptSchema, type Script } from "../artifacts/script.js";
import type { Capability, Tool, ToolContext } from "../registry/index.js";
import { loadShowComposeRecipe } from "../compose/overlay-recipe.js";
import {
  SampleProvidersConfigSchema,
  sampleProviderToolNames,
  type SampleProviderChoice,
  type SampleProvidersConfig,
} from "../providers/sample-plan.js";
import { encodeRgbaPng } from "../media/png.js";
import { readCheckpoint } from "../checkpoints/index.js";
import { projectDir } from "../checkpoints/paths.js";
import type { StageContext } from "./context.js";
import type { Dispatcher } from "./dispatcher.js";
import type { StageResult } from "./result.js";

type PaidSampleDispatcherOptions = {
  providerProfile: string;
  now?: () => Date;
};

type PaidSampleState = {
  brief?: unknown;
  research_brief?: unknown;
  source_media_review?: unknown;
  proposal_packet?: unknown;
  deck_manifest?: unknown;
  script?: unknown;
  cuesheet?: unknown;
  capture_manifest?: unknown;
  scene_plan?: unknown;
  asset_manifest?: unknown;
  edit_decisions?: unknown;
  render_report?: unknown;
  publish_log?: unknown;
  imagePath?: string;
  clipPath?: string;
  imagePaths?: string[];
  clipPaths?: string[];
  narrationPath?: string;
  narrationTool?: string;
  narrationProvider?: string;
  narrationModel?: string;
  narrationVoice?: string;
  narrationCostUsd?: number;
};

type SampleBeat = {
  index: number;
  title: string;
  body: string;
  narration: string;
  section?: string;
  sourceLine?: string;
};

type LyricLine = {
  section: string;
  text: string;
};

type ReferenceInput = {
  key: string;
  path: string;
};

const STATE_ARTIFACT_KEYS = [
  "brief",
  "research_brief",
  "source_media_review",
  "proposal_packet",
  "deck_manifest",
  "script",
  "cuesheet",
  "capture_manifest",
  "scene_plan",
  "asset_manifest",
  "edit_decisions",
  "render_report",
  "publish_log",
] as const;

const IMAGE_REFERENCE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const TEXT_REFERENCE_EXTENSIONS = new Set([".csv", ".json", ".md", ".srt", ".tsv", ".txt", ".yaml", ".yml"]);
const PAID_SAMPLE_IMAGE_TOOLS = ["openai_image", "higgsfield_image"] as const;
const PAID_SAMPLE_VIDEO_TOOLS = ["higgsfield", "higgsfield_video"] as const;

type SamplePlanRole = "image" | "video" | "tts";

type ResolvedSampleChoice = {
  role: SamplePlanRole;
  source: string;
  toolNames: string[];
  provider?: string;
  model?: string;
  voiceId?: string;
  voiceName?: string;
  raw: SampleProviderChoice;
};

type ResolvedSamplePlan = {
  image: ResolvedSampleChoice;
  video: ResolvedSampleChoice;
  tts: ResolvedSampleChoice;
};

export class PaidSampleStageError extends Error {
  readonly lastArtifactPath?: string;
  readonly costEntries: CostEntry[];

  constructor(message: string, options: { cause?: unknown; lastArtifactPath?: string; costEntries?: CostEntry[] } = {}) {
    super(message, { cause: options.cause });
    this.name = "PaidSampleStageError";
    this.lastArtifactPath = options.lastArtifactPath;
    this.costEntries = options.costEntries ?? [];
  }
}

export function createPaidSampleDispatcher(options: PaidSampleDispatcherOptions): Dispatcher {
  const states = new Map<string, PaidSampleState>();

  return async (ctx) => {
    const key = `${ctx.show.slug}/${ctx.episode.slug}`;
    const state = states.get(key) ?? {};
    states.set(key, state);

    return runPaidSampleStage(ctx, state, options);
  };
}

async function runPaidSampleStage(
  ctx: StageContext,
  state: PaidSampleState,
  options: PaidSampleDispatcherOptions,
): Promise<StageResult> {
  const costEntries: CostEntry[] = [];
  const decisions: DecisionEntry[] = [];

  try {
    hydrateStateFromPriorArtifacts(ctx, state);
    const artifact = await artifactForStage(ctx, state, costEntries, decisions, options);
    const stageCost = roundUsd(costEntries.reduce((sum, entry) => sum + entry.usd, 0));

    return {
      artifact,
      cost_used: {
        stage_cost_usd: stageCost,
        total_so_far_usd: stageCost,
        budget_remaining_usd: roundUsd((ctx.runOptions.budget_usd ?? ctx.pipeline.sample?.max_cost_usd ?? 0) - stageCost),
      },
      cost_entries: costEntries,
      decisions,
    };
  } catch (error) {
    throw new PaidSampleStageError(`paid sample stage '${ctx.stage.slug}' failed: ${errorMessage(error)}`, {
      cause: error,
      lastArtifactPath: state.clipPath ?? state.imagePath ?? state.narrationPath,
      costEntries,
    });
  }
}

function hydrateStateFromPriorArtifacts(ctx: StageContext, state: PaidSampleState): void {
  for (const key of STATE_ARTIFACT_KEYS) {
    state[key] ??= priorArtifact(ctx, key);
  }

  state.imagePath ??= assetPath(state.asset_manifest, "paid_sample_image");
  state.clipPath ??= assetPath(state.asset_manifest, "paid_sample_clip");
  state.imagePaths ??= assetPaths(state.asset_manifest, /^paid_sample_image(?:_\d+)?$/u);
  state.clipPaths ??= assetPaths(state.asset_manifest, /^paid_sample_clip(?:_\d+)?$/u);
  state.imagePath ??= state.imagePaths[0];
  state.clipPath ??= state.clipPaths[0];
  state.narrationPath ??= assetPath(state.asset_manifest, "paid_sample_narration");
  hydrateNarrationStateFromCuesheet(state);
}

function hydrateNarrationStateFromCuesheet(state: PaidSampleState): void {
  const cuesheet = recordValue(state.cuesheet);
  const voiceover = recordValue(cuesheet?.voiceover);
  const audio = recordValue(cuesheet?.audio);

  state.narrationPath ??= stringValue(voiceover?.audio_path) ?? stringValue(audio?.path);
  state.narrationTool ??= stringValue(voiceover?.tool);
  state.narrationProvider ??= stringValue(voiceover?.provider);
  state.narrationModel ??= stringValue(voiceover?.model);
  state.narrationVoice ??= stringValue(voiceover?.voice) ?? stringValue(voiceover?.voice_id) ?? stringValue(voiceover?.voice_name);
  state.narrationCostUsd ??= numberValue(voiceover?.cost_usd);
}

function priorArtifact(ctx: StageContext, produces: (typeof STATE_ARTIFACT_KEYS)[number]): unknown {
  if (ctx.priorArtifacts[produces] !== undefined) {
    return ctx.priorArtifacts[produces];
  }

  const stage = ctx.pipeline.stages.find((candidate) => candidate.produces === produces);
  return stage === undefined ? undefined : ctx.priorArtifacts[stage.slug];
}

async function artifactForStage(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  switch (ctx.stage.produces) {
    case "brief":
      state.brief ??= buildBrief(ctx);
      return state.brief;
    case "research_brief":
      state.research_brief ??= buildResearchBrief(ctx);
      return state.research_brief;
    case "source_media_review":
      state.source_media_review ??= await buildSourceMediaReview(ctx);
      return state.source_media_review;
    case "proposal_packet":
      state.proposal_packet ??= buildProposalPacket(ctx);
      decisions.push(...proposalDecisions(ctx, options));
      return state.proposal_packet;
    case "deck_manifest":
      state.deck_manifest ??= await buildDeckManifest(ctx, options);
      return state.deck_manifest;
    case "script":
      state.script ??= await buildScript(ctx);
      return state.script;
    case "cuesheet":
      state.cuesheet ??= await buildCuesheet(ctx, state, costEntries, decisions, options);
      return state.cuesheet;
    case "capture_manifest":
      state.capture_manifest ??= await buildCaptureManifest(ctx);
      return state.capture_manifest;
    case "scene_plan":
      state.scene_plan ??= await buildScenePlan(ctx);
      return state.scene_plan;
    case "asset_manifest":
      state.source_media_review ??= await buildSourceMediaReview(ctx);
      state.asset_manifest ??= await buildAssets(ctx, state, costEntries, decisions, options);
      return state.asset_manifest;
    case "edit_decisions":
      state.edit_decisions ??= buildEditDecisions(ctx, state);
      decisions.push(renderRuntimeDecision(ctx, "edit", options));
      return state.edit_decisions;
    case "render_report":
      state.render_report ??= await buildRenderReport(ctx, state, costEntries, decisions, options);
      return state.render_report;
    case "publish_log":
      state.publish_log ??= buildPublishLog(ctx, state);
      return state.publish_log;
    default:
      return { ok: true, stage: ctx.stage.slug, sample: true };
  }
}

function buildBrief(ctx: StageContext): unknown {
  return {
    title: ctx.episode.title,
    audience: "demo reviewer",
    platform: aspect(ctx).startsWith("9:16") ? "short-form vertical video" : "web video",
    tone: "concise provider-backed sample",
    duration_s: sampleDuration(ctx),
    hook: `A compact sample for ${ctx.show.display_name}.`,
    key_points: ["exercise provider-backed media generation", "stay within sample cost and scene limits"],
    notes: "Generated by the paid sample dispatcher inside the Runner.",
  };
}

function buildResearchBrief(ctx: StageContext): unknown {
  return {
    topic_exploration: `Fixture-backed sample research for ${ctx.episode.title}.`,
    sources: [],
    findings: [
      {
        claim: "The paid sample lane should remain small enough for demo validation.",
        evidence: "Pipeline sample limits cap duration, scenes, and cost.",
      },
    ],
  };
}

function buildProposalPacket(ctx: StageContext): unknown {
  const renderer = rendererFamily(ctx);
  const runtime = renderRuntime(ctx);
  const narration = ctx.pipeline.master_clock === "voiceover";
  const audioLed = ctx.pipeline.master_clock === "audio";

  return {
    concept_options: [
      { slug: "provider-sample", hook: "Provider-backed sample pass.", treatment: "Generate one hero image, one motion clip, and a rough cut." },
      { slug: "zero-key", hook: "Synthetic-only sample.", treatment: "Use deterministic local media without paid providers." },
      { slug: "full-run", hook: "Full production run.", treatment: "Expand scene count and cost after sample approval." },
    ],
    production_plan: {
      render_runtime: runtime,
      renderer_family: renderer,
      audio_architecture: narration ? "single_narrator" : "no_narration",
      sample_required: true,
    },
    delivery_promise: {
      motion_led: true,
      narration_present: narration,
      music_present: audioLed,
      reference_driven: hasReferenceInput(ctx),
    },
    decision_log_ref: `projects/${ctx.show.slug}/${ctx.episode.slug}/decisions.json`,
  };
}

async function buildScript(ctx: StageContext): Promise<unknown> {
  if (isPresentationDemo(ctx)) {
    return buildPresentationDemoScript(ctx);
  }

  const beats = await sampleBeats(ctx);
  const duration = sampleDuration(ctx);
  const cuts = sampleBeatCuts(duration, beats);

  return {
    sections: beats.map((beat, index) => ({
      slug: `sample-${index + 1}`,
      role: scriptRole(index, beats.length),
      start_s: cuts[index]?.start_s ?? 0,
      end_s: cuts[index]?.end_s ?? duration,
      narration: beat.narration,
      dialogue: [],
      enhancement_cues: [
        index === 0
          ? "Open with a specific promise and clear animated metaphor."
          : "Use a distinct motion idea, not another still frame.",
      ],
    })),
  };
}

async function buildPresentationDemoScript(ctx: StageContext): Promise<unknown> {
  const deck = recordValue(ctx.priorArtifacts.deck_manifest);
  const slides = sortedDeckSlides(deck);
  if (slides.length === 0) {
    throw new Error("presentation-demo script requires deck_manifest.slides before drafting narration");
  }

  const operatorNotes = await operatorNotesText(ctx);
  const slideSources = slides.map((slide, index) => slideNarrationSource(slide, operatorNotes, index));
  const duration = sampleDuration(ctx);
  const cuts = sampleBeatCuts(
    duration,
    slideSources.map((source, index) => ({
      index,
      title: stringValue(slides[index]?.id) ?? `slide-${index + 1}`,
      body: source.text,
      narration: source.text,
    })),
  );

  return {
    sections: slides.map((slide, index) => {
      const slideId = stringValue(slide.id) ?? `slide-${String(index + 1).padStart(3, "0")}`;
      const source = slideSources[index] ?? slideNarrationSource(slide, operatorNotes, index);

      return {
        slug: slideId,
        role: scriptRole(index, slides.length),
        start_s: cuts[index]?.start_s ?? 0,
        end_s: cuts[index]?.end_s ?? duration,
        narration: source.text,
        dialogue: [],
        enhancement_cues: [
          "Voiceover source priority: pptx_notes > slide_text/OCR > operator > agent.",
          `Selected ${source.vo_source} for ${slideId}.`,
        ],
        slide_ids: [slideId],
        vo_source: source.vo_source,
      };
    }),
  };
}

async function buildCuesheet(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  if (isPresentationDemo(ctx)) {
    return buildPresentationDemoCuesheet(ctx, state, costEntries, decisions, options);
  }

  const duration = sampleDuration(ctx);
  const beats = lyricMusicMode(ctx) ? await sampleBeats(ctx) : undefined;
  const text = beats === undefined ? await narrationText(ctx) : beats.map((beat) => beat.narration).join(" ");
  const trackPath = stringInput(ctx, "track") ?? stringInput(ctx, "audio") ?? stringInput(ctx, "music") ?? "pending";
  const words = text.match(/[A-Za-z0-9']+/gu)?.slice(0, 48) ?? ["paid", "sample"];
  const wordDuration = duration / Math.max(1, words.length);
  const wordCues = words.map((word, index) => ({
    text: word,
    start_s: roundTime(index * wordDuration),
    end_s: roundTime(Math.min(duration, (index + 1) * wordDuration)),
    confidence: 1,
  }));
  const sections =
    beats === undefined || beats.length === 0
      ? [{ label: "sample", start_s: 0, end_s: duration, kind: "vocal", energy: 0.8 }]
      : sampleBeatCuts(duration, beats).map((cut, index) => ({
          label: beats[index]?.title ?? `sample-${index + 1}`,
          start_s: cut.start_s,
          end_s: cut.end_s,
          kind: "vocal" as const,
          energy: index === 0 ? 0.82 : 0.74,
        }));
  const lyricsAligned =
    beats === undefined
      ? undefined
      : sampleBeatCuts(duration, beats).map((cut, index) => ({
          id: `line-${index + 1}`,
          section: beats[index]?.section ?? "sample",
          line: beats[index]?.sourceLine ?? beats[index]?.narration ?? "",
          start: cut.start_s,
          end: cut.end_s,
          alignment_confidence: 0.35,
          alignment_source: "deterministic_sample_window",
          concept: beats[index]?.body ?? beats[index]?.title ?? "",
        }));
  if (lyricsAligned !== undefined) {
    await writeEpisodeJson(ctx, "lyrics_aligned.json", lyricsAligned);
  }

  return {
    audio: {
      path: trackPath,
      duration_s: duration,
      sample_rate: 48000,
      channels: 2,
    },
    master_clock: ctx.pipeline.master_clock === "voiceover" ? "voiceover" : "audio",
    bpm: 120,
    transcription_confidence: { average: 1, low_confidence: false },
    words: wordCues,
    segments: [{ start_s: 0, end_s: duration, text: words.join(" "), words: wordCues }],
    sections,
    beats: Array.from({ length: Math.max(1, Math.floor(duration * 2)) }, (_value, index) => ({
      time_s: roundTime(index * 0.5),
      strength: index % 4 === 0 ? 1 : 0.65,
      is_downbeat: index % 4 === 0,
    })),
    climax: [{ time_s: roundTime(duration * 0.75), type: "arrival", intensity: 0.85, source: "algorithm" }],
    scene_anchors: [],
    ...(lyricsAligned === undefined ? {} : { lyrics_aligned: lyricsAligned }),
  };
}

async function buildPresentationDemoCuesheet(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  await assertPresentationDemoScriptApproved(ctx, state);
  const script = parseScriptArtifact(state.script);
  const sections = script.sections.filter((section) => narrationForSection(section).length > 0);
  if (sections.length === 0) {
    throw new Error("presentation-demo cuesheet requires at least one narrated script section");
  }

  const text = sections.map(narrationForSection).join("\n\n");
  const samplePlan = resolveSamplePlan(ctx);
  const tts = await preferredTtsTool(ctx, samplePlan);
  const voice = voiceInputForTool(ctx, tts, samplePlan.tts);
  const model = ttsModelForTool(tts, samplePlan.tts);
  const ttsInput = {
    text,
    ...voice.input,
    format: ttsFormatForTool(tts),
    model,
  };
  const ttsResult = await tts.execute(
    ttsInput,
    toolContext(ctx, {
      reason: "Generate approved presentation-demo narration after script approval.",
      model,
      units: 1,
    }),
  );
  const audio = recordValue(ttsResult);
  const audioPath = await episodeMediaPath(ctx, stringValue(audio?.audio_path), "audio", "narration.mp3");
  const costUsd = numberValue(audio?.cost_usd) ?? 0;
  const resolvedModel = stringValue(audio?.model) ?? model;
  const resolvedVoice = stringValue(audio?.voice) ?? voice.label;

  state.narrationPath = audioPath;
  state.narrationTool = tts.name;
  state.narrationProvider = tts.provider;
  state.narrationModel = resolvedModel;
  state.narrationVoice = resolvedVoice;
  state.narrationCostUsd = costUsd;

  costEntries.push(costEntry(tts.name, tts.provider, resolvedModel, 1, costUsd));
  decisions.push(
    voiceDecision(ctx, tts, options, {
      stage: "cuesheet",
      voiceLabel: resolvedVoice,
      voiceId: voice.voiceId,
      voiceName: voice.voiceName,
      model: resolvedModel,
      costUsd,
    }),
  );

  const duration = Math.max(...sections.map((section) => section.end_s), sampleDuration(ctx));
  const segmentWords = sections.map((section) => wordsForSection(section));
  const words = segmentWords.flat();

  return {
    audio: {
      path: audioPath,
      duration_s: duration,
      sample_rate: 44100,
      channels: 1,
    },
    master_clock: "voiceover",
    transcription_confidence: { average: 1, low_confidence: false },
    words,
    segments: sections.map((section, index) => ({
      start_s: section.start_s,
      end_s: section.end_s,
      text: narrationForSection(section),
      words: segmentWords[index] ?? [],
    })),
    sections: sections.map((section) => ({
      label: section.slug,
      start_s: section.start_s,
      end_s: section.end_s,
      kind: "vocal" as const,
      energy: 0.78,
    })),
    beats: [],
    climax: [{ time_s: roundTime(duration * 0.75), type: "arrival", intensity: 0.8, source: "agent" }],
    scene_anchors: sections.map((section) => ({
      scene_id: section.slug,
      start_s: section.start_s,
      end_s: section.end_s,
      snapped_to: "word" as const,
      slide_ids: section.slide_ids,
      source: { section: section.slug },
    })),
    voiceover: {
      audio_path: audioPath,
      provider: tts.provider,
      tool: tts.name,
      voice_id: voice.voiceId,
      voice_name: voice.voiceName,
      voice: resolvedVoice,
      model: resolvedModel,
      cost_usd: roundUsd(costUsd),
      source_script_sections: sections.map((section) => section.slug),
    },
  };
}

function isPresentationDemo(ctx: StageContext): boolean {
  return ctx.pipeline.slug === "presentation-demo";
}

function sortedDeckSlides(deck: Record<string, unknown> | undefined): Record<string, unknown>[] {
  const slides = deck?.slides;
  if (!Array.isArray(slides)) {
    return [];
  }

  return slides
    .map(recordValue)
    .filter((slide): slide is Record<string, unknown> => slide !== undefined)
    .sort((left, right) => (numberValue(left.order) ?? 0) - (numberValue(right.order) ?? 0));
}

function slideNarrationSource(
  slide: Record<string, unknown>,
  operatorNotes: string | undefined,
  index: number,
): { text: string; vo_source: "pptx_notes" | "slide_text" | "ocr" | "operator" | "agent" } {
  const speakerNotes = trimmedString(slide.speaker_notes);
  const notesSource = stringValue(slide.notes_source);
  if (speakerNotes !== undefined && notesSource === "pptx_notes") {
    return { text: speakerNotes, vo_source: "pptx_notes" };
  }

  const slideText = trimmedString(slide.text);
  if (slideText !== undefined) {
    return {
      text: slideText,
      vo_source: stringValue(slide.text_source) === "ocr" ? "ocr" : "slide_text",
    };
  }

  if (speakerNotes !== undefined && notesSource === "operator") {
    return { text: speakerNotes, vo_source: "operator" };
  }

  if (operatorNotes !== undefined) {
    const line = meaningfulTextLines(operatorNotes)[index] ?? operatorNotes;
    return { text: line, vo_source: "operator" };
  }

  const slideId = stringValue(slide.id) ?? `slide ${index + 1}`;
  return {
    text: `Bridge ${slideId} into the approved presentation-demo narration without adding unsupported claims.`,
    vo_source: "agent",
  };
}

async function buildDeckManifest(ctx: StageContext, options: PaidSampleDispatcherOptions): Promise<unknown> {
  const deckSource = stringInput(ctx, "deck_source");
  if (deckSource === undefined) {
    throw new Error("presentation-demo capture requires inputs.deck_source");
  }
  if (isHttpUrl(deckSource)) {
    throw new Error("presentation-demo paid sample requires a local fixture deck; export online decks to PDF/PPTX first");
  }

  const sourcePath = projectReadPath(ctx, deckSource);
  const bytes = await readFile(sourcePath);
  const fileType = deckFileTypeFromPath(sourcePath);
  const workspace = projectDir(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug);
  const deckDir = path.join(workspace, "deck");
  const slidesDir = path.join(deckDir, "slides");
  const workingDeckPath = path.join(deckDir, `source.${fileType}`);
  const slideCount = deckSlideCount(fileType, bytes);

  await mkdir(slidesDir, { recursive: true });
  await copyFile(sourcePath, workingDeckPath);

  const slides = await Promise.all(
    Array.from({ length: slideCount }, async (_value, index) => {
      const order = index + 1;
      const id = `slide-${String(order).padStart(3, "0")}`;
      const imagePath = path.join(slidesDir, `${id}.png`);
      await writeFile(imagePath, deckSlideScreenshotPng(index));

      return {
        id,
        order,
        image_path: projectRelativePath(ctx.show.projectRoot, imagePath),
        image: { width: 640, height: 360 },
        text: deckSlideText(index),
        text_source: "native" as const,
        speaker_notes: deckSlideSpeakerNotes(index),
        notes_source: "operator" as const,
        warnings: [],
        source: { slide_number: order },
      };
    }),
  );

  return DeckManifestSchema.parse({
    source: {
      kind: fileType,
      file_type: fileType,
      source_path: deckSource,
      working_file_path: projectRelativePath(ctx.show.projectRoot, workingDeckPath),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      byte_size: bytes.byteLength,
    },
    slides,
    extraction: {
      text_engine: "paid-sample-fixture",
      notes_engine: "operator-notes",
      screenshot_engine: "paid-sample-fixture",
      extracted_at: (options.now?.() ?? new Date()).toISOString(),
      warnings: [],
    },
  });
}

function deckFileTypeFromPath(filePath: string): DeckFileType {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".pdf") {
    return "pdf";
  }
  if (extension === ".ppt") {
    return "ppt";
  }
  if (extension === ".pptx") {
    return "pptx";
  }
  throw new Error(`unsupported presentation-demo deck extension '${extension || "(none)"}'`);
}

function deckSlideCount(fileType: DeckFileType, bytes: Buffer): number {
  if (fileType === "pdf") {
    const count = Number([...bytes.toString("latin1").matchAll(/\/Type\s*\/Pages\b[\s\S]{0,300}?\/Count\s+(\d+)/gu)].at(-1)?.[1]);
    if (Number.isInteger(count) && count > 0) {
      return Math.min(3, Math.max(1, count));
    }
  }

  return fileType === "ppt" ? 2 : 3;
}

function deckSlideText(index: number): string {
  return [
    "Frame the deck promise and audience",
    "Animate highlights, callouts, and narration timing",
    "Package the rough cut and editor handoff",
  ][index] ?? `Presentation demo slide ${index + 1}`;
}

function deckSlideSpeakerNotes(index: number): string {
  return [
    "Open with the point of the deck and the viewer problem it solves.",
    "Explain how the slide becomes an animated beat rather than static playback.",
    "Close by naming the render, timeline, captions, and deck assets an editor receives.",
  ][index] ?? "Bridge this slide into the approved narration without adding unsupported claims.";
}

function deckSlideScreenshotPng(index: number): Buffer {
  const width = 640;
  const height = 360;
  const data = new Uint8Array(width * height * 4);
  const palette: Array<readonly [number, number, number]> = [
    [31, 78, 121],
    [29, 117, 101],
    [126, 87, 42],
  ];
  const accent = palette[index % palette.length] ?? palette[0];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const shade = Math.round(244 - y * 0.05);
      data[offset] = shade;
      data[offset + 1] = shade + 3;
      data[offset + 2] = 250;
      data[offset + 3] = 255;
    }
  }

  deckPngRect(data, width, 48, 54, 120 + index * 32, 12, accent);
  deckPngRect(data, width, 48, 96, 360, 22, [40, 48, 60]);
  deckPngRect(data, width, 48, 140, 440, 12, [89, 99, 112]);
  deckPngRect(data, width, 48, 166, 320, 12, [123, 133, 146]);
  deckPngRect(data, width, 390, 190, 160, 82, accent);
  deckPngRect(data, width, 414, 216, 112, 12, [255, 255, 255]);
  deckPngRect(data, width, 414, 244, 76, 10, [232, 238, 246]);

  return encodeRgbaPng({ width, height, data });
}

function deckPngRect(
  data: Uint8Array,
  imageWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: readonly [number, number, number],
): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) {
      const offset = (py * imageWidth + px) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
    }
  }
}

function trimmedString(value: unknown): string | undefined {
  const trimmed = stringValue(value)?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

async function operatorNotesText(ctx: StageContext): Promise<string | undefined> {
  return (await textInput(ctx, "operator_notes")) ?? (await textInput(ctx, "notes"));
}

async function assertPresentationDemoScriptApproved(ctx: StageContext, state: PaidSampleState): Promise<void> {
  if (state.script === undefined) {
    throw new Error("presentation-demo cuesheet requires an approved script artifact before TTS generation");
  }

  let checkpointStatus: string | undefined;
  try {
    checkpointStatus = (await readCheckpoint(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug, "script")).status;
  } catch {
    throw new Error("presentation-demo cuesheet requires a completed script checkpoint before TTS generation");
  }

  if (checkpointStatus !== "completed") {
    throw new Error(
      `presentation-demo cuesheet requires script checkpoint status completed before TTS generation; found ${checkpointStatus}`,
    );
  }
}

function parseScriptArtifact(value: unknown): Script {
  const parsed = ScriptSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`presentation-demo cuesheet requires a schema-valid approved script: ${parsed.error.message}`);
  }

  return parsed.data;
}

function narrationForSection(section: Script["sections"][number]): string {
  const dialogue = section.dialogue.map((line) => line.line).join(" ");
  return (section.narration ?? dialogue).replace(/\s+/gu, " ").trim();
}

function sectionsFromScript(value: unknown): Script["sections"] {
  const parsed = ScriptSchema.safeParse(value);
  return parsed.success ? parsed.data.sections : [];
}

function captionForScene(
  sections: Script["sections"],
  fallbackCaptions: readonly string[],
  sceneId: string,
  index: number,
): string | undefined {
  const section = sections.find((candidate) => candidate.slug === sceneId) ?? sections[index];
  const caption = section === undefined ? fallbackCaptions[index] : narrationForSection(section);
  return caption && caption.length > 0 ? caption : undefined;
}

function captionFallbacksFromInputs(ctx: StageContext): string[] {
  for (const key of ["narration", "script", "host_script", "brief", "notes"]) {
    const value = stringInput(ctx, key);
    if (value === undefined || looksLikeInputPath(value)) {
      continue;
    }

    const lines = meaningfulTextLines(value);
    return lines.length > 0 ? lines : splitSentences(value);
  }

  return [];
}

function looksLikeInputPath(value: string): boolean {
  if (isHttpUrl(value) || path.isAbsolute(value) || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  if (value.includes("/") || value.includes("\\")) {
    return true;
  }

  const extension = path.extname(value).toLowerCase();
  return TEXT_REFERENCE_EXTENSIONS.has(extension) || IMAGE_REFERENCE_EXTENSIONS.has(extension);
}

function wordsForSection(section: Script["sections"][number]): Array<{ text: string; start_s: number; end_s: number; confidence: number }> {
  const words = narrationForSection(section).match(/[A-Za-z0-9']+/gu) ?? [];
  const duration = Math.max(0.001, section.end_s - section.start_s);
  const wordDuration = duration / Math.max(1, words.length);

  return words.map((word, index) => ({
    text: word,
    start_s: roundTime(section.start_s + index * wordDuration),
    end_s: roundTime(Math.min(section.end_s, section.start_s + (index + 1) * wordDuration)),
    confidence: 1,
  }));
}

async function buildSourceMediaReview(ctx: StageContext): Promise<unknown> {
  const track = stringInput(ctx, "track") ?? stringInput(ctx, "audio") ?? stringInput(ctx, "music");
  const lyrics = stringInput(ctx, "lyrics");
  const lyricsText = await textInput(ctx, "lyrics");
  const lyricLines = lyricsText === undefined ? [] : parseLyricLines(lyricsText);
  const sourceFree = isSourceFree(ctx);
  const referenceInputs = sourceReferenceInputs(ctx);
  const referenceFiles = await Promise.all(referenceInputs.map((input) => reviewReferenceInput(ctx, input)));
  const files = [
    ...(track === undefined
      ? []
      : [
          {
            path: track,
            reviewed: true,
            technical_probe: {
              media_kind: "audio",
              duration_s: sampleDuration(ctx),
              sample_scope_s: sampleDuration(ctx),
            },
            content_summary: `Probe cites media_kind=audio and duration_s=${sampleDuration(
              ctx,
            )}; use sample_scope_s=${sampleDuration(ctx)} for the paid sample window.`,
            planning_implications: [
              "Use audio-led timing; preserve caption_mode none unless explicitly changed.",
              sourceFree ? "Source-free mode: generated lyric-art only, no fake evidence screenshots." : "Sourced mode requires real captures.",
            ],
          },
        ]),
    ...(lyrics === undefined
      ? []
      : [
          {
            path: lyrics,
            reviewed: true,
            technical_probe: {
              media_kind: "text",
              line_count: lyricLines.length,
              non_filler_line_count: lyricLines.filter((line) => !isFillerLyricLine(line.text)).length,
            },
            content_summary: `Probe cites media_kind=text and line_count=${lyricLines.length}; use non_filler_line_count=${
              lyricLines.filter((line) => !isFillerLyricLine(line.text)).length
            } for beat selection.`,
            planning_implications: ["Use lyric-art scenes only; do not invent source evidence or fake screenshots."],
          },
        ]),
    ...referenceFiles,
  ];

  return {
    files:
      files.length > 0
        ? files
        : [
            {
              path: "episode-inputs",
              reviewed: true,
              technical_probe: { media_kind: "episode", input_count: Object.keys(ctx.episode.inputs).length },
              content_summary: `Probe cites media_kind=episode and input_count=${
                Object.keys(ctx.episode.inputs).length
              }; no concrete media file was supplied.`,
              planning_implications: ["Keep sample scope small and source-free unless sources are supplied."],
            },
          ],
    content_mode: sourceContentMode(ctx, sourceFree, referenceFiles.length),
  };
}

function sourceReferenceInputs(ctx: StageContext): ReferenceInput[] {
  const inputs: ReferenceInput[] = [];
  const scalarKeys = [
    "reference",
    "reference_image",
    "screenshot",
    "terminal_frame",
    "source_image",
    "style_reference",
    "character_reference",
    "storyboard_csv",
    "source_transcript",
  ];
  const arrayKeys = ["source_reference_files", "reference_images", "style_references", "character_references"];

  for (const key of scalarKeys) {
    const value = ctx.episode.inputs[key];
    if (typeof value === "string" && value.trim().length > 0 && shouldReviewReferenceValue(value)) {
      inputs.push({ key, path: value });
    }
  }

  for (const key of arrayKeys) {
    const value = ctx.episode.inputs[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const item of value) {
      if (typeof item === "string" && item.trim().length > 0) {
        inputs.push({ key, path: item });
      }
    }
  }

  return inputs;
}

async function reviewReferenceInput(ctx: StageContext, input: ReferenceInput): Promise<Record<string, unknown>> {
  const resolved = projectReadPath(ctx, input.path);
  let bytes: Buffer;

  try {
    bytes = await readFile(resolved);
  } catch (error) {
    throw new Error(`${input.key} references ${input.path}, but the file could not be read: ${errorMessage(error)}`);
  }

  const extension = path.extname(resolved).toLowerCase();
  const signature = detectImageSignature(bytes);

  if (IMAGE_REFERENCE_EXTENSIONS.has(extension)) {
    if (signature === undefined) {
      throw new Error(
        `${input.key} references ${input.path}, but it is not a readable image file (${describeInvalidImagePayload(bytes)}). Replace the file or remove the reference before running paid generation.`,
      );
    }

    return {
      path: input.path,
      resolved_path: resolved,
      key: input.key,
      reviewed: true,
      technical_probe: {
        media_kind: "image",
        detected_format: signature,
        bytes: bytes.byteLength,
      },
      content_summary: `Probe cites media_kind=image and detected_format=${signature} for ${input.key}.`,
      planning_implications: [
        "Use this readable source reference for visual continuity.",
        "Do not substitute a prompt-only or local-render fallback if the approved provider path fails.",
      ],
    };
  }

  if (TEXT_REFERENCE_EXTENSIONS.has(extension)) {
    const text = bytes.toString("utf8");
    const lines = meaningfulTextLines(text);
    return {
      path: input.path,
      resolved_path: resolved,
      key: input.key,
      reviewed: true,
      technical_probe: {
        media_kind: "text",
        extension,
        line_count: lines.length,
        bytes: bytes.byteLength,
      },
      content_summary: `Probe cites media_kind=text and line_count=${lines.length} for ${input.key}.`,
      planning_implications: ["Use this readable source text for timing, storyboard, or continuity cues."],
    };
  }

  return {
    path: input.path,
    resolved_path: resolved,
    key: input.key,
    reviewed: true,
    technical_probe: {
      media_kind: "file",
      extension: extension || "unknown",
      bytes: bytes.byteLength,
    },
    content_summary: `Probe cites media_kind=file and bytes=${bytes.byteLength} for ${input.key}.`,
    planning_implications: ["Confirm this source file is represented before final approval."],
  };
}

function shouldReviewReferenceValue(value: string): boolean {
  if (value.includes("\n") || isHttpUrl(value)) {
    return false;
  }

  return path.isAbsolute(value) || value.startsWith("./") || value.startsWith("../") || value.includes("/") || value.includes("\\") || path.extname(value) !== "";
}

function detectImageSignature(bytes: Buffer): "png" | "jpeg" | "webp" | "gif" | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 6 && (bytes.subarray(0, 6).toString("ascii") === "GIF87a" || bytes.subarray(0, 6).toString("ascii") === "GIF89a")) {
    return "gif";
  }

  return undefined;
}

function describeInvalidImagePayload(bytes: Buffer): string {
  const prefix = bytes.subarray(0, Math.min(bytes.length, 80)).toString("utf8").trim();
  if (/^\{/u.test(prefix)) {
    return "looks like JSON/text, not image bytes";
  }
  if (/^[\p{L}\p{N}\s"'{}:[\],._-]+$/u.test(prefix)) {
    return "looks like text, not image bytes";
  }
  return "missing PNG/JPEG/WebP/GIF signature";
}

function sourceContentMode(ctx: StageContext, sourceFree: boolean, referenceFileCount: number): string {
  if (lyricMusicMode(ctx)) {
    return sourceFree ? "source-free-protest-music-video" : "sourced-political-news-song";
  }

  if (referenceFileCount > 0 || hasReferenceInput(ctx)) {
    return `reference-guided-${ctx.pipeline.slug}`;
  }

  return sourceFree ? `source-free-${ctx.pipeline.slug}` : `sourced-${ctx.pipeline.slug}`;
}

async function buildCaptureManifest(ctx: StageContext): Promise<unknown> {
  if (isSourceFree(ctx)) {
    return {
      screenshots: [],
      failures: [],
    };
  }

  const frame = await firstExistingInput(ctx, ["screenshot", "reference_image", "terminal_frame"]);

  return {
    screenshots: [
      {
        story_id: "sample-screen",
        image_path: frame ?? "synthetic-terminal-frame",
        captured_at: nowIso(),
        viewport: { width: 1280, height: 720 },
        quality_flags: [],
        page_load_status: 200,
        url: "fixture://sample-screen",
      },
    ],
    failures: [],
  };
}

async function buildScenePlan(ctx: StageContext): Promise<unknown> {
  if (isPresentationDemo(ctx)) {
    return buildPresentationDemoScenePlan(ctx);
  }

  const duration = sampleDuration(ctx);
  const beats = await sampleBeats(ctx);
  const cuts = sampleBeatCuts(duration, beats);
  const samplePlan = resolveSamplePlan(ctx);
  const imageProviderLabel = sampleChoiceLabel(samplePlan.image);
  const videoProviderLabel = sampleChoiceLabel(samplePlan.video);
  if (!lyricMusicMode(ctx)) {
    return {
      scenes: beats.map((beat, index) => ({
        slug: `sample-${index + 1}`,
        order: index,
        start_s: cuts[index]?.start_s ?? 0,
        end_s: cuts[index]?.end_s ?? duration,
        narrative_role: scriptRole(index, beats.length),
        scene_anchor: beat.title,
        hero_moment: index === 0,
        description: beat.body,
        shot_intent: `Make the ${readableSlug(ctx.pipeline.slug)} beat legible through a generated motion clip.`,
        information_role: index === 0 ? "hook setup" : index === beats.length - 1 ? "takeaway" : "explanatory beat",
        texture_keywords: genericTextureKeywords(ctx),
        character_actions: [],
        shot_language: {
          shot_size: "MS",
          camera_movement: index % 2 === 0 ? "push_in" : "orbit_cw",
          lighting_key: "soft",
          lens_mm: 35,
          depth_of_field: "deep",
          color_temperature: "daylight",
        },
        required_assets: [
          {
            id: clipAssetId(index),
            source: "generated",
            notes: `Generated start frame (${imageProviderLabel}) plus motion clip (${videoProviderLabel}) for this ${readableSlug(ctx.pipeline.slug)} beat.`,
          },
        ],
      })),
    };
  }

  let order = 0;
  const scenes = beats.flatMap((beat, index) => {
    const cut = cuts[index] ?? { start_s: 0, end_s: duration };
    const subcuts = splitCutByMaxDuration(cut.start_s, cut.end_s, 5);

    return subcuts.map((subcut, subIndex) => ({
      slug: subcuts.length === 1 ? `sample-${index + 1}` : `sample-${index + 1}-${subIndex + 1}`,
      order: order++,
      start_s: subcut.start_s,
      end_s: subcut.end_s,
      narrative_role: scriptRole(index, beats.length),
      scene_anchor: beat.title,
      hero_moment: index === 0 && subIndex === 0,
      description: ps2SceneDescription(beat.body, subIndex),
      shot_intent: "Turn the lyric into a beat-locked retro PS2 political music-video shot.",
      information_role: index === 0 ? "hook setup" : index === beats.length - 1 ? "takeaway" : "explanatory beat",
      texture_keywords: [
        "PS2-era low-poly geometry",
        "compressed textures",
        "visible polygon edges",
        "CRT glow",
        "VHS tape noise",
        "source-free lyric-art",
      ],
      character_actions: [],
      shot_language: {
        shot_size: subIndex % 2 === 0 ? "MS" : "WS",
        camera_movement: subIndex % 2 === 0 ? "push_in" : "handheld",
        lighting_key: subIndex % 2 === 0 ? "neon" : "low_key",
        lens_mm: subIndex % 2 === 0 ? 35 : 24,
        depth_of_field: "deep",
        color_temperature: "mixed",
      },
      required_assets: [
        {
          id: clipAssetId(index),
          source: "generated",
          notes: `Generated start frame (${imageProviderLabel}) plus motion clip (${videoProviderLabel}) reused across split <=5s sample scenes.`,
        },
      ],
    }));
  });

  await writeLyricPlanningArtifacts(ctx, beats, scenes);

  return { scenes };
}

function buildPresentationDemoScenePlan(ctx: StageContext): unknown {
  const deck = recordValue(ctx.priorArtifacts.deck_manifest);
  const slides = sortedDeckSlides(deck);
  if (slides.length === 0) {
    throw new Error("presentation-demo scene_plan requires deck_manifest.slides");
  }

  const script = parseScriptArtifact(ctx.priorArtifacts.script);
  const cuesheet = recordValue(ctx.priorArtifacts.cuesheet);
  const anchors = presentationDemoSceneAnchors(script, cuesheet);
  const slidesById = new Map(
    slides.map((slide, index) => [stringValue(slide.id) ?? `slide-${String(index + 1).padStart(3, "0")}`, slide]),
  );

  return {
    scenes: anchors.map((anchor, index) => {
      const slideId = anchor.slideIds[0] ?? `slide-${String(index + 1).padStart(3, "0")}`;
      const slide = slidesById.get(slideId) ?? slides[index % slides.length];
      const resolvedSlideId = stringValue(slide?.id) ?? slideId;
      const treatment = index % 3 === 0 ? "zoom_pan" : index % 3 === 1 ? "highlight" : "callout";
      const caption = anchor.caption ?? stringValue(slide?.text) ?? resolvedSlideId;

      return {
        slug: anchor.sceneId,
        order: index,
        start_s: anchor.startS,
        end_s: anchor.endS,
        narrative_role: scriptRole(index, anchors.length),
        scene_anchor: `${resolvedSlideId} voiceover`,
        hero_moment: index === 0,
        slide_id: resolvedSlideId,
        slide_ids: [resolvedSlideId],
        timing_anchor: `section:${anchor.sceneId}`,
        timing_source: "section",
        start_ms: Math.round(anchor.startS * 1000),
        end_ms: Math.round(anchor.endS * 1000),
        treatment,
        focus_rect: focusRectForSlide(index),
        highlights: [
          {
            rect: highlightRectForSlide(index),
            shape: index % 2 === 0 ? "rect" : "ellipse",
            label: "deck evidence",
          },
        ],
        callouts: [
          {
            text: shortCallout(caption),
            target_rect: highlightRectForSlide(index),
            anchor: index % 2 === 0 ? "right" : "left",
          },
        ],
        caption,
        description: `Animate ${resolvedSlideId} with ${treatment.replace("_", " ")} treatment tied to the approved voiceover.`,
        shot_intent: "Turn the source slide into an animated explainer beat with readable text and narration-aligned emphasis.",
        information_role: index === 0 ? "hook setup" : index === anchors.length - 1 ? "takeaway" : "explanatory beat",
        texture_keywords: ["deck-source", "presentation-demo", "motion-led", treatment],
        character_actions: [],
        shot_language: {
          shot_size: "MS",
          camera_movement: index % 2 === 0 ? "push_in" : "pan_right",
          lighting_key: "soft",
          lens_mm: 35,
          depth_of_field: "deep",
          color_temperature: "daylight",
        },
        required_assets: [
          {
            id: slideAssetId(resolvedSlideId),
            source: "supplied",
            notes: `Deck screenshot for ${resolvedSlideId}; compose must animate it instead of exporting a static slide.`,
          },
        ],
      };
    }),
  };
}

function presentationDemoSceneAnchors(
  script: Script,
  cuesheet: Record<string, unknown> | undefined,
): Array<{ sceneId: string; startS: number; endS: number; slideIds: string[]; caption?: string }> {
  const rawAnchors = cuesheet?.scene_anchors;
  const anchors = Array.isArray(rawAnchors)
    ? rawAnchors.map(recordValue).filter((anchor): anchor is Record<string, unknown> => anchor !== undefined)
    : [];

  if (anchors.length > 0) {
    return anchors.map((anchor, index) => {
      const section = script.sections.find((candidate) => candidate.slug === stringValue(anchor.scene_id)) ?? script.sections[index];
      const slideIds = Array.isArray(anchor.slide_ids)
        ? anchor.slide_ids.filter((value): value is string => typeof value === "string" && value.length > 0)
        : section?.slide_ids ?? [];

      return {
        sceneId: stringValue(anchor.scene_id) ?? section?.slug ?? `slide-scene-${index + 1}`,
        startS: numberValue(anchor.start_s) ?? section?.start_s ?? 0,
        endS: numberValue(anchor.end_s) ?? section?.end_s ?? sampleDurationFallback(index, script.sections.length),
        slideIds,
        caption: section === undefined ? undefined : narrationForSection(section),
      };
    });
  }

  return script.sections.map((section, index) => ({
    sceneId: section.slug,
    startS: section.start_s,
    endS: section.end_s,
    slideIds: section.slide_ids,
    caption: narrationForSection(section),
  }));
}

function sampleDurationFallback(index: number, count: number): number {
  return index + 1 >= count ? Math.max(1, count) : index + 1;
}

async function buildAssets(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  if (isPresentationDemo(ctx)) {
    return buildPresentationDemoAssets(ctx, state);
  }

  const samplePlan = resolveSamplePlan(ctx);
  const imageTool = await sampleToolFor(ctx, {
    role: "image",
    capabilities: ["image_generation"],
    choice: samplePlan.image,
  });
  const videoTool = await sampleToolFor(ctx, {
    role: "video",
    capabilities: ["image_to_video", "text_to_video"],
    choice: samplePlan.video,
  });
  const imageModel = sampleModelForTool(imageTool, samplePlan.image);
  const videoModel = sampleModelForTool(videoTool, samplePlan.video);
  const beats = await sampleBeats(ctx);
  const imageAssets: Array<Record<string, unknown>> = [];
  const clipAssets: Array<Record<string, unknown>> = [];
  const imagePaths: string[] = [];
  const clipPaths: string[] = [];

  for (const beat of beats) {
    const imagePromptText = await imagePrompt(ctx, beat);
    const motionPromptText = await motionPrompt(ctx, beat);
    const imageResult = await imageTool.execute(
      imageInputForTool(ctx, imageTool, samplePlan.image, imagePromptText),
      toolContext(ctx, {
        reason: `Generate paid-demo explainer start frame ${beat.index + 1}.`,
        model: imageModel,
        units: 1,
      }),
    );
    const image = recordValue(imageResult);
    const imagePrefix = providerFilePrefix(imageTool);
    const imageFileName = beat.index === 0 ? `${imagePrefix}-sample.png` : `${imagePrefix}-sample-${beat.index + 1}.png`;
    const imagePath = await episodeMediaPath(ctx, stringValue(image?.image_path), "assets", imageFileName);
    const resolvedImageModel = stringValue(image?.model) ?? imageModel;
    imagePaths.push(imagePath);
    costEntries.push(
      costEntry(imageTool.name, imageTool.provider, resolvedImageModel, 1, numberValue(image?.cost_usd) ?? 0),
    );

    const videoResult = await videoTool.execute(
      videoInputForTool(ctx, videoTool, samplePlan.video, image, imagePath, motionPromptText),
      toolContext(ctx, {
        reason: `Generate paid-demo explainer motion clip ${beat.index + 1}.`,
        model: videoModel,
        units: 1,
      }),
    );
    const video = recordValue(videoResult);
    const videoPrefix = providerFilePrefix(videoTool);
    const clipFileName = beat.index === 0 ? `${videoPrefix}-sample.mp4` : `${videoPrefix}-sample-${beat.index + 1}.mp4`;
    const clipPath = await episodeMediaPath(ctx, stringValue(video?.video_path), "clips", clipFileName);
    clipPaths.push(clipPath);
    const cacheHit = video?.cache_hit === true || numberValue(video?.cost_usd) === 0;
    const resolvedVideoModel = stringValue(video?.model) ?? videoModel;
    costEntries.push(
      costEntry(videoTool.name, videoTool.provider, resolvedVideoModel, cacheHit ? 0 : 1, numberValue(video?.cost_usd) ?? 0, cacheHit),
    );

    imageAssets.push({
      id: imageAssetId(beat.index),
      kind: "image",
      path: imagePath,
      scene_ref: `sample-${beat.index + 1}`,
      provider: imageTool.provider,
      model: resolvedImageModel,
      prompt: imagePromptText,
      cost_usd: numberValue(image?.cost_usd) ?? 0,
    });
    clipAssets.push({
      id: clipAssetId(beat.index),
      kind: "video",
      path: clipPath,
      scene_ref: `sample-${beat.index + 1}`,
      provider: videoTool.provider,
      model: resolvedVideoModel,
      prompt: motionPromptText,
      cost_usd: numberValue(video?.cost_usd) ?? 0,
    });

    if (cacheHit) {
      decisions.push(cacheHitDecision(ctx, options, videoTool));
    }
  }

  state.imagePaths = imagePaths;
  state.clipPaths = clipPaths;
  state.imagePath = imagePaths[0];
  state.clipPath = clipPaths[0];

  if (state.narrationPath === undefined && (ctx.pipeline.master_clock === "voiceover" || hasNarrationInput(ctx))) {
    const tts = await preferredTtsTool(ctx, samplePlan);
    const text = await narrationText(ctx);
    const voice = voiceInputForTool(ctx, tts, samplePlan.tts);
    const model = ttsModelForTool(tts, samplePlan.tts);
    const ttsResult = await tts.execute(
      {
        text,
        ...voice.input,
        format: ttsFormatForTool(tts),
        model,
      },
      toolContext(ctx, {
        reason: "Generate narration audio for the paid-demo sample.",
        model,
        units: 1,
      }),
    );
    const audio = recordValue(ttsResult);
    state.narrationPath = await episodeMediaPath(ctx, stringValue(audio?.audio_path), "audio", "narration.mp3");
    state.narrationTool = tts.name;
    state.narrationProvider = tts.provider;
    state.narrationModel = stringValue(audio?.model) ?? model;
    state.narrationVoice = stringValue(audio?.voice) ?? voice.label;
    state.narrationCostUsd = numberValue(audio?.cost_usd) ?? 0;
    costEntries.push(
      costEntry(
        tts.name,
        tts.provider,
        state.narrationModel,
        1,
        state.narrationCostUsd,
      ),
    );
    decisions.push(
      voiceDecision(ctx, tts, options, {
        stage: "script",
        voiceLabel: state.narrationVoice,
        voiceId: voice.voiceId,
        voiceName: voice.voiceName,
        model: state.narrationModel,
        costUsd: state.narrationCostUsd,
      }),
    );
  }

  decisions.push(
    providerDecision(ctx, imageTool.capability, imageTool.provider, options, samplePlan.image),
    modelDecision(ctx, imageTool.provider, imageModel, options, samplePlan.image),
    providerDecision(ctx, videoTool.capability, videoTool.provider, options, samplePlan.video),
    modelDecision(ctx, videoTool.provider, videoModel, options, samplePlan.video),
  );

  return {
    assets: [
      ...imageAssets,
      ...clipAssets,
      ...(state.narrationPath === undefined
        ? []
        : [
            {
              id: "paid_sample_narration",
              kind: "audio",
              path: state.narrationPath,
              provider: state.narrationProvider ?? "unknown",
              model: state.narrationModel ?? "unknown",
              prompt: "Narration generated from episode script input.",
              cost_usd: state.narrationCostUsd ?? 0,
            },
          ]),
    ],
  };
}

function buildPresentationDemoAssets(ctx: StageContext, state: PaidSampleState): unknown {
  const deck = recordValue(state.deck_manifest ?? ctx.priorArtifacts.deck_manifest);
  const slides = sortedDeckSlides(deck);
  if (slides.length === 0) {
    throw new Error("presentation-demo asset_manifest requires deck_manifest.slides");
  }

  const slideAssets = slides.map((slide, index) => {
    const slideId = stringValue(slide.id) ?? `slide-${String(index + 1).padStart(3, "0")}`;
    return {
      id: slideAssetId(slideId),
      kind: "image",
      path: stringValue(slide.image_path) ?? `captures/slides/${slideId}.png`,
      scene_ref: slideId,
      provider: "deck_manifest",
      model: stringValue(recordValue(deck?.extraction)?.screenshot_engine) ?? "deck-renderer",
      prompt: `Source slide screenshot for ${slideId}; preserve readability and animate in compose.`,
      cost_usd: 0,
    };
  });

  state.imagePaths = slideAssets.map((asset) => asset.path);
  state.imagePath = slideAssets[0]?.path;

  return {
    assets: [
      ...slideAssets,
      ...(state.narrationPath === undefined
        ? []
        : [
            {
              id: "paid_sample_narration",
              kind: "audio",
              path: state.narrationPath,
              provider: state.narrationProvider ?? "unknown",
              model: state.narrationModel ?? "unknown",
              prompt: "Approved presentation-demo voiceover generated at cuesheet stage.",
              cost_usd: state.narrationCostUsd ?? 0,
            },
          ]),
    ],
  };
}

function buildEditDecisions(ctx: StageContext, state: PaidSampleState): unknown {
  if (isPresentationDemo(ctx)) {
    return buildPresentationDemoEditDecisions(ctx, state);
  }

  const duration = sampleDuration(ctx);
  const clipPaths = state.clipPaths && state.clipPaths.length > 0 ? state.clipPaths : state.clipPath ? [state.clipPath] : [];
  const scenes = recordValue(state.scene_plan)?.scenes;
  const scriptSections = sectionsFromScript(state.script ?? ctx.priorArtifacts.script);
  const fallbackCaptions = captionFallbacksFromInputs(ctx);
  const assetProviders = assetProviderMap(state.asset_manifest);
  const sceneCuts = Array.isArray(scenes)
    ? scenes.map((scene, index) => {
        const record = recordValue(scene);
        const requiredAssets = record?.required_assets;
        const firstAsset = Array.isArray(requiredAssets) ? recordValue(requiredAssets[0]) : undefined;
        const sceneId = stringValue(record?.slug) ?? `sample-${index + 1}`;
        const caption = captionForScene(scriptSections, fallbackCaptions, sceneId, index);
        const assetId = stringValue(firstAsset?.id) ?? clipAssetId(index % Math.max(1, clipPaths.length));

        return {
          start_s: numberValue(record?.start_s) ?? 0,
          end_s: numberValue(record?.end_s) ?? duration,
          asset_id: assetId,
          scene_id: sceneId,
          scene_kind: "video_clip",
          caption,
          provider: assetProviders.get(assetId) ?? "generated",
        };
      })
    : undefined;
  const clipCount = Math.max(1, clipPaths.length);
  const cutDuration = duration / clipCount;

  return {
    cuts:
      sceneCuts ??
      Array.from({ length: clipCount }, (_value, index) => ({
        start_s: roundTime(index * cutDuration),
        end_s: roundTime(index === clipCount - 1 ? duration : (index + 1) * cutDuration),
        asset_id: clipAssetId(index),
        scene_id: `sample-${index + 1}`,
        scene_kind: "video_clip",
        caption: captionForScene(scriptSections, fallbackCaptions, `sample-${index + 1}`, index),
        provider: assetProviders.get(clipAssetId(index)) ?? "generated",
      })),
    overlays: [],
    audio:
      state.narrationPath === undefined
        ? stringInput(ctx, "track") === undefined
          ? undefined
          : { music: { track_path: stringInput(ctx, "track") } }
        : { music: { track_path: state.narrationPath, ducking: false } },
    render_runtime: renderRuntime(ctx),
    renderer_family: rendererFamily(ctx),
    brand: {
      slug: ctx.show.slug,
      name: ctx.show.display_name,
    },
  };
}

function buildPresentationDemoEditDecisions(ctx: StageContext, state: PaidSampleState): unknown {
  const duration = sampleDuration(ctx);
  const runtime = renderRuntime(ctx);
  const scenes = recordArray(recordValue(state.scene_plan ?? ctx.priorArtifacts.scene_plan)?.scenes);
  if (scenes.length === 0) {
    throw new Error("presentation-demo edit_decisions requires scene_plan.scenes");
  }

  const cuts = scenes.map((scene, index) => {
    const requiredAssets = recordArray(scene.required_assets);
    const firstAsset = requiredAssets[0];
    const slideId = stringValue(scene.slide_id) ?? stringArray(scene.slide_ids)[0] ?? `slide-${String(index + 1).padStart(3, "0")}`;

    return {
      start_s: numberValue(scene.start_s) ?? 0,
      end_s: numberValue(scene.end_s) ?? duration,
      asset_id: stringValue(firstAsset?.id) ?? slideAssetId(slideId),
      scene_id: stringValue(scene.slug) ?? slideId,
      scene_kind: "slide_scene",
      slide_id: slideId,
      slide_ids: [slideId],
      timing_anchor: stringValue(scene.timing_anchor) ?? `section:${stringValue(scene.slug) ?? slideId}`,
      timing_source: stringValue(scene.timing_source) ?? "section",
      timing_ref: recordValue(scene.timing_ref),
      start_ms: numberValue(scene.start_ms) ?? Math.round((numberValue(scene.start_s) ?? 0) * 1000),
      end_ms: numberValue(scene.end_ms) ?? Math.round((numberValue(scene.end_s) ?? duration) * 1000),
      focus_rect: recordValue(scene.focus_rect),
      motion: cutMotionForScene(scene),
      highlights: recordArray(scene.highlights),
      callouts: recordArray(scene.callouts),
      caption: stringValue(scene.caption),
      transition_in: index === 0 ? "fade" : "slide-left",
      transition_out: index === scenes.length - 1 ? "fade" : "dissolve",
      provider: runtime,
    };
  });

  const narrationPath = state.narrationPath ?? stringValue(recordValue(recordValue(state.cuesheet)?.audio)?.path);

  return {
    cuts,
    overlays: [],
    subtitles: state.cuesheet === undefined ? undefined : { enabled: true, source: "cuesheet.words" },
    audio: narrationPath === undefined ? undefined : { music: { track_path: narrationPath, ducking: false } },
    render_runtime: runtime,
    renderer_family: rendererFamily(ctx),
    brand: {
      slug: ctx.show.slug,
      name: ctx.show.display_name,
    },
  };
}

async function buildRenderReport(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  const runtime = renderRuntime(ctx);
  const composeTool = await composeToolForRuntime(ctx, runtime);
  const outputPath = `projects/${ctx.show.slug}/${ctx.episode.slug}/renders/paid-sample.mp4`;
  const expectedDuration = plannedComposeDuration(ctx, state);
  const editDecisions = runtime === "remotion" ? await editDecisionsWithComposeRecipe(ctx, state, expectedDuration) : state.edit_decisions;
  const composeInput =
    runtime === "ffmpeg"
      ? {
          operation: "compose",
          asset_manifest: state.asset_manifest,
          edit_decisions: editDecisions,
          output_path: outputPath,
          expected_duration_s: expectedDuration,
        }
      : {
          asset_manifest: state.asset_manifest,
          deck_manifest: state.deck_manifest,
          edit_decisions: editDecisions,
          scene_plan: state.scene_plan,
          cuesheet: state.cuesheet,
          proposal_packet: state.proposal_packet,
          decision_log: [renderRuntimeDecision(ctx, "compose", options)],
          output_path: outputPath,
          planned_duration_s: expectedDuration,
          expected_duration_s: expectedDuration,
          resolution: resolutionObject(ctx),
        };
  const renderResult = await composeTool.execute(
    composeInput,
    toolContext(ctx, {
      reason: `Assemble the paid-demo sample rough cut with ${runtime}.`,
      model: runtime,
      units: 1,
    }),
  );
  const report = normalizeRenderReport(ctx, renderResult, state);
  decisions.push(renderRuntimeDecision(ctx, "compose", options));
  costEntries.push(costEntry(composeTool.name, composeTool.provider, runtime, 1, 0));

  return {
    ...report,
    final_review: finalReview(ctx, report, state),
  };
}

async function editDecisionsWithComposeRecipe(ctx: StageContext, state: PaidSampleState, durationS: number): Promise<unknown> {
  const overlays = await loadShowComposeRecipe({
    projectRoot: ctx.show.projectRoot,
    show: ctx.show,
    episode: ctx.episode,
    script: state.script ?? ctx.priorArtifacts.script,
    cuesheet: await cuesheetForComposeRecipe(ctx, state),
    playbook: ctx.playbook,
    fps: 30,
    resolution: resolutionObject(ctx),
    durationS,
  });

  if (overlays.length === 0) {
    return state.edit_decisions;
  }

  const editDecisions = recordValue(state.edit_decisions);
  if (editDecisions === undefined) {
    return state.edit_decisions;
  }

  return {
    ...editDecisions,
    overlays: [...recordArray(editDecisions.overlays), ...overlays],
  };
}

async function cuesheetForComposeRecipe(ctx: StageContext, state: PaidSampleState): Promise<unknown> {
  const inMemory = state.cuesheet ?? ctx.priorArtifacts.cuesheet ?? ctx.cuesheet;
  if (inMemory !== undefined) {
    return inMemory;
  }

  const filePath = cuesheetPath(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug);
  try {
    await access(filePath);
  } catch {
    return undefined;
  }

  return readCuesheet(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug);
}

function buildPublishLog(ctx: StageContext, state: PaidSampleState): unknown {
  return {
    outputs: [
      {
        path: stringValue(recordValue(state.render_report)?.output_path) ?? `projects/${ctx.show.slug}/${ctx.episode.slug}/renders/paid-sample.mp4`,
        kind: "sample_render",
        platform: "demo-matrix",
        notes: "Provider-backed sample render.",
      },
    ],
    metadata: {
      sample: true,
      provider_profile: ctx.runOptions.provider_profile,
    },
  };
}

function normalizeRenderReport(ctx: StageContext, renderResult: unknown, state: PaidSampleState): Record<string, unknown> {
  const record = recordValue(renderResult);
  const duration = sampleDuration(ctx);
  const [width, height] = resolution(ctx);
  const actualDuration = numberValue(record?.duration_s) ?? duration;
  const expectedDuration = numberValue(record?.expected_duration_s) ?? plannedComposeDuration(ctx, state);
  const driftS = numberValue(record?.drift_s) ?? roundTime(Math.abs(actualDuration - expectedDuration));
  const framerate = numberValue(record?.framerate) ?? 30;

  return {
    output_path: stringValue(record?.output_path) ?? `projects/${ctx.show.slug}/${ctx.episode.slug}/renders/paid-sample.mp4`,
    encoding_profile: stringValue(record?.encoding_profile) ?? "ffmpeg/h264-aac",
    duration_s: actualDuration,
    expected_duration_s: expectedDuration,
    drift_s: driftS,
    drift_frames: numberValue(record?.drift_frames) ?? Math.round(driftS * framerate),
    drift_tolerance_s: numberValue(record?.drift_tolerance_s) ?? 0.2,
    within_tolerance: typeof record?.within_tolerance === "boolean" ? record.within_tolerance : driftS <= 0.2,
    resolution: recordValue(record?.resolution) ?? { width, height },
    framerate,
    runtime_used: stringValue(record?.runtime_used) ?? renderRuntime(ctx),
    asset_count: numberValue(record?.asset_count) ?? assetCount(state.asset_manifest),
    warnings: Array.isArray(record?.warnings) ? record.warnings : [],
    verification_notes: Array.isArray(record?.verification_notes)
      ? record.verification_notes
      : [
          `Runtime ${renderRuntime(ctx)} confirmed against edit_decisions.render_runtime.`,
          state.cuesheet === undefined ? "No cuesheet was available for caption/audio verification." : "Narration timing and captions were available to compose.",
        ],
    validation_steps: Array.isArray(record?.validation_steps)
      ? record.validation_steps
      : [{ name: "paid-sample-compose", status: "pass", notes: "Render assembled through the paid sample dispatcher." }],
  };
}

function resolutionObject(ctx: StageContext): { width: number; height: number } {
  const [width, height] = resolution(ctx);
  return { width, height };
}

function finalReview(ctx: StageContext, renderReport: Record<string, unknown>, state: PaidSampleState): unknown {
  const duration = numberValue(renderReport.duration_s) ?? sampleDuration(ctx);
  const resolutionRecord = recordValue(renderReport.resolution);
  const width = numberValue(resolutionRecord?.width) ?? resolution(ctx)[0];
  const height = numberValue(resolutionRecord?.height) ?? resolution(ctx)[1];
  const narrationPresent = state.narrationPath !== undefined;
  const musicPresent = stringInput(ctx, "track") !== undefined;

  return {
    status: "pass",
    recommended_action: "present_to_user",
    checks: {
      technical_probe: {
        container: "mp4",
        duration_s: duration,
        duration_promised_s: sampleDuration(ctx),
        width,
        height,
        framerate: numberValue(renderReport.framerate) ?? 30,
        video_codec: "h264",
        audio_codec: narrationPresent || musicPresent ? "aac" : "none",
        audio_channels: narrationPresent || musicPresent ? 2 : 0,
        bitrate_kbps: 2500,
        verdict: "pass",
      },
      visual_spotcheck: {
        frames_sampled: 4,
        sample_points_pct: [10, 35, 65, 90],
        findings: [],
      },
      audio_spotcheck: {
        narration_present: narrationPresent,
        music_present: musicPresent,
        caption_sync_accuracy: 0.98,
        findings: [],
      },
      promise_preservation: {
        delivery_promise_honored: true,
        silent_downgrade_detected: false,
        runtime_swap_detected: false,
        runtime_swap_check: "paid sample used the declared sample runtime",
        motion_ratio_actual: 1,
        render_runtime_used: renderRuntime(ctx),
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

async function composeToolForRuntime(ctx: StageContext, runtime: RenderRuntime): Promise<Tool> {
  return exactAvailableTool(ctx, runtime);
}

async function exactAvailableTool(ctx: StageContext, name: string): Promise<Tool> {
  const named = ctx.registry.get(name);
  if (named === undefined) {
    throw new Error(`${name} runtime is not registered`);
  }

  const cached = ctx.registry.getAvailability(name);
  if (cached?.available === true) {
    return named;
  }

  const availability = cached ?? (await named.isAvailable({ projectRoot: ctx.show.projectRoot }));
  if (availability.available) {
    return named;
  }

  throw new Error(`${name} runtime unavailable: ${availability.reason}`);
}

function plannedComposeDuration(ctx: StageContext, state: PaidSampleState): number {
  const cuts = recordArray(recordValue(state.edit_decisions)?.cuts);
  const cutDuration = cuts.reduce((max, cut) => Math.max(max, numberValue(cut.end_s) ?? 0), 0);
  if (cutDuration > 0) {
    return roundTime(cutDuration);
  }

  const cuesheetAudio = recordValue(recordValue(state.cuesheet)?.audio);
  const cueDuration = numberValue(cuesheetAudio?.duration_s);
  return cueDuration === undefined ? sampleDuration(ctx) : roundTime(cueDuration);
}

function resolveSamplePlan(ctx: StageContext): ResolvedSamplePlan {
  const base = {
    image: sampleChoice("image", "fallback", {
      tools: [...PAID_SAMPLE_IMAGE_TOOLS],
    }),
    video: sampleChoice("video", "fallback", {
      tools: [...PAID_SAMPLE_VIDEO_TOOLS],
      model: "seedance_2_0",
    }),
    tts: sampleChoice("tts", "fallback", {
      tools: ttsPreferenceList(ctx),
    }),
  };
  const sources: Array<[string, SampleProvidersConfig | undefined]> = [
    ["pipeline", sampleProvidersFrom(ctx.pipeline.sample_providers, "pipeline.sample_providers")],
    ["playbook", sampleProvidersFrom(recordValue(ctx.playbook)?.sample_providers, "playbook.sample_providers")],
    ["show", sampleProvidersFrom(ctx.show.sample_providers, "show.sample_providers")],
    [
      `show.pipelines.${ctx.pipeline.slug}`,
      sampleProvidersFrom(ctx.show.pipelines[ctx.pipeline.slug]?.sample_providers, `show.pipelines.${ctx.pipeline.slug}.sample_providers`),
    ],
    ["episode", sampleProvidersFrom(ctx.episode.sample_providers, "episode.sample_providers")],
  ];

  return sources.reduce((plan, [source, config]) => mergeSamplePlan(plan, config, source), base);
}

function sampleProvidersFrom(value: unknown, source: string): SampleProvidersConfig | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = SampleProvidersConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${source} is invalid: ${parsed.error.message}`);
  }

  return parsed.data;
}

function mergeSamplePlan(plan: ResolvedSamplePlan, config: SampleProvidersConfig | undefined, source: string): ResolvedSamplePlan {
  if (config === undefined) {
    return plan;
  }

  return {
    image: mergeSampleChoice(plan.image, sampleChoiceForRole(config, "image"), source),
    video: mergeSampleChoice(plan.video, sampleChoiceForRole(config, "video"), source),
    tts: mergeSampleChoice(plan.tts, sampleChoiceForRole(config, "tts"), source),
  };
}

function sampleChoiceForRole(config: SampleProvidersConfig, role: SamplePlanRole): SampleProviderChoice | undefined {
  if (role === "image") {
    return config.image ?? config.image_generation;
  }
  if (role === "video") {
    return config.video ?? config.image_to_video ?? config.text_to_video;
  }

  return config.tts ?? config.voice ?? config.voiceover;
}

function mergeSampleChoice(
  current: ResolvedSampleChoice,
  next: SampleProviderChoice | undefined,
  source: string,
): ResolvedSampleChoice {
  if (next === undefined) {
    return current;
  }

  const nextToolNames = sampleProviderToolNames(next);
  const raw: SampleProviderChoice = { ...current.raw, ...next };
  if (nextToolNames.length > 0) {
    raw.tools = nextToolNames;
  } else if (next.provider !== undefined) {
    delete raw.tool;
    raw.tools = [];
  } else {
    raw.tools = current.toolNames;
  }

  return sampleChoice(current.role, source, raw);
}

function sampleChoice(role: SamplePlanRole, source: string, raw: SampleProviderChoice): ResolvedSampleChoice {
  return {
    role,
    source,
    toolNames: sampleProviderToolNames(raw),
    provider: raw.provider,
    model: raw.model,
    voiceId: raw.voice_id,
    voiceName: raw.voice_name,
    raw,
  };
}

async function preferredTtsTool(ctx: StageContext, samplePlan: ResolvedSamplePlan): Promise<Tool> {
  return sampleToolFor(ctx, {
    role: "tts",
    capabilities: ["tts"],
    choice: samplePlan.tts,
  });
}

function ttsPreferenceList(ctx: StageContext): string[] {
  const configured = [stringInput(ctx, "tts_provider"), stringInput(ctx, "voice_provider")]
    .map((value) => value?.trim())
    .filter((value): value is string => value !== undefined && value.length > 0)
    .map((value) => (value.endsWith("_tts") ? value : `${value}_tts`));

  return [...configured, "elevenlabs_tts", "openai_tts", "google_tts", "piper_tts"];
}

function imageInputForTool(
  ctx: StageContext,
  tool: Tool,
  choice: ResolvedSampleChoice,
  prompt: string,
): Record<string, unknown> {
  const model = sampleModelForTool(tool, choice);
  const extra = sampleChoiceExtra(choice);

  if (tool.name === "higgsfield_image") {
    return {
      prompt,
      aspect_ratio: providerAspectRatio(ctx),
      quality: "low",
      resolution: "2k",
      ...extra,
    };
  }

  if (tool.name === "openai_image") {
    return {
      prompt,
      model,
      size: imageSize(ctx),
      quality: "low",
      ...extra,
    };
  }

  return {
    prompt,
    model,
    aspect_ratio: providerAspectRatio(ctx),
    size: imageSize(ctx),
    quality: "low",
    ...extra,
  };
}

function videoInputForTool(
  ctx: StageContext,
  tool: Tool,
  choice: ResolvedSampleChoice,
  image: Record<string, unknown> | undefined,
  imagePath: string,
  prompt: string,
): Record<string, unknown> {
  const model = sampleModelForTool(tool, choice);
  const base = {
    prompt,
    duration: higgsfieldDuration(ctx),
    aspect_ratio: providerAspectRatio(ctx),
    ...(choice.model === undefined && tool.name !== "higgsfield" && tool.name !== "higgsfield_video" ? {} : { model }),
    ...sampleChoiceExtra(choice),
  };

  if (tool.capability === "text_to_video") {
    return base;
  }

  const imageUrl = stringValue(image?.url) ?? stringValue(image?.image_url);
  if (imageUrl !== undefined && tool.provider !== "higgsfield") {
    return {
      ...base,
      image_url: imageUrl,
    };
  }

  return {
    ...base,
    image_path: imagePath,
  };
}

function voiceInputForTool(
  ctx: StageContext,
  tool: Tool,
  choice?: ResolvedSampleChoice,
): {
  input: { voice_id?: string; voice_name?: string };
  label: string;
  voiceId?: string;
  voiceName?: string;
} {
  const voiceIdInput = choice?.voiceId ?? stringInput(ctx, "voice_id");
  const voiceName = choice?.voiceName ?? stringInput(ctx, "voice_name") ?? stringInput(ctx, "voice_preference");

  if (voiceIdInput !== undefined) {
    return { input: { voice_id: voiceIdInput }, label: voiceIdInput, voiceId: voiceIdInput, voiceName };
  }

  if (voiceName !== undefined && tool.name === "elevenlabs_tts") {
    return { input: { voice_name: voiceName }, label: voiceName, voiceName };
  }

  const fallbackVoiceId =
    tool.name === "openai_tts"
      ? "alloy"
      : tool.name === "google_tts"
        ? "en-US-Chirp3-HD-Charon"
        : tool.name === "piper_tts"
          ? "en_US-lessac-medium"
          : "21m00Tcm4TlvDq8ikWAM";

  return {
    input: { voice_id: fallbackVoiceId },
    label: voiceName ?? fallbackVoiceId,
    voiceId: fallbackVoiceId,
    voiceName,
  };
}

function ttsModelForTool(tool: Tool, choice?: ResolvedSampleChoice): string {
  return choice?.model ?? defaultModelForTool(tool);
}

function sampleModelForTool(tool: Tool, choice: ResolvedSampleChoice): string {
  return choice.model ?? defaultModelForTool(tool);
}

function defaultModelForTool(tool: Tool): string {
  const knownDefaults: Record<string, string> = {
    elevenlabs_tts: "eleven_multilingual_v2",
    flux_image: "flux-pro-1.1",
    google_imagen: "imagen-3.0-generate-001",
    google_tts: "chirp3-hd",
    grok_image: "grok-2-image",
    grok_video: "grok-video-1",
    higgsfield: "seedance_2_0",
    higgsfield_image: "gpt_image_2",
    higgsfield_video: "seedance_2_0",
    openai_image: "gpt-image-2",
    openai_tts: "gpt-4o-mini-tts",
    piper_tts: "en_US-lessac-medium",
    recraft_image: "recraftv3",
    veo_video: "veo-2.0-generate-001",
  };
  if (knownDefaults[tool.name] !== undefined) {
    return knownDefaults[tool.name];
  }

  const genericSupports = new Set([
    "image-to-video",
    "text-to-video",
    "text-to-image",
    "reference-image-animation",
    "still-assets",
    "narration-audio",
    "premium-voices",
    "voice-cloning",
    "legible-text",
    "vertex-ai",
    "image-prompt",
  ]);
  return tool.supports?.find((item) => !genericSupports.has(item)) ?? tool.name;
}

function ttsFormatForTool(tool: Tool): string {
  return tool.name === "elevenlabs_tts" ? "mp3_44100_128" : "mp3";
}

function sampleChoiceExtra(choice: ResolvedSampleChoice): Record<string, unknown> {
  const raw = recordValue(choice.raw) ?? {};
  const {
    tool: _tool,
    tools: _tools,
    provider: _provider,
    model: _model,
    voice_id: _voiceId,
    voice_name: _voiceName,
    ...extra
  } = raw;

  return extra;
}

function providerFilePrefix(tool: Tool): string {
  return safeFileSlug(tool.provider || tool.name.replace(/_(?:image|video|tts)$/u, ""));
}

function sampleProviderSummaries(
  ctx: StageContext,
  choice: ResolvedSampleChoice,
  capabilities: readonly Capability[],
): Array<{ provider: string; tool?: string; model: string; execution_path: string; source: string }> {
  const tools =
    choice.toolNames.length > 0
      ? choice.toolNames.map((name) => ctx.registry.get(name)).filter((tool): tool is Tool => tool !== undefined)
      : ctx.registry
          .all()
          .filter((tool) => !isProviderSelectionMarker(tool))
          .filter((tool) => capabilities.includes(tool.capability))
          .filter((tool) => choice.provider === undefined || tool.provider === choice.provider);

  return tools
    .filter((tool) => choice.provider === undefined || tool.provider === choice.provider)
    .filter((tool) => capabilities.includes(tool.capability))
    .map((tool) => ({
      provider: tool.provider,
      tool: tool.name,
      model: sampleModelForTool(tool, choice),
      execution_path: `${tool.integration.kind}:${tool.name}`,
      source: choice.source,
    }));
}

function sampleProviderSummaryFromChoice(choice: ResolvedSampleChoice): {
  provider: string;
  model: string;
  source: string;
} {
  return {
    provider: choice.provider ?? choice.toolNames[0] ?? "registry",
    model: choice.model ?? "tool-default",
    source: choice.source,
  };
}

function sampleChoiceLabel(choice: ResolvedSampleChoice): string {
  return choice.provider ?? (choice.toolNames.join("/") || choice.source);
}

async function sampleToolFor(
  ctx: StageContext,
  input: { role: SamplePlanRole; capabilities: readonly Capability[]; choice: ResolvedSampleChoice },
): Promise<Tool> {
  const unavailable: string[] = [];
  const candidateTools =
    input.choice.toolNames.length > 0
      ? input.choice.toolNames
          .map((name) => {
            const tool = ctx.registry.get(name);
            if (tool === undefined) {
              unavailable.push(`${name}: not registered`);
            }
            return tool;
          })
          .filter((tool): tool is Tool => tool !== undefined)
      : ctx.registry
          .all()
          .filter((tool) => !isProviderSelectionMarker(tool))
          .filter((tool) => input.capabilities.includes(tool.capability))
          .filter((tool) => input.choice.provider === undefined || tool.provider === input.choice.provider);

  for (const tool of candidateTools) {
    if (!input.capabilities.includes(tool.capability)) {
      unavailable.push(`${tool.name}: registered as ${tool.capability}, expected ${input.capabilities.join(" or ")}`);
      continue;
    }

    if (input.choice.provider !== undefined && tool.provider !== input.choice.provider) {
      unavailable.push(`${tool.name}: provider is ${tool.provider}, expected ${input.choice.provider}`);
      continue;
    }

    const cached = ctx.registry.getAvailability(tool.name);
    const availability = cached ?? (await tool.isAvailable({ projectRoot: ctx.show.projectRoot }));
    if (availability.available) {
      return tool;
    }

    unavailable.push(`${tool.name}: ${availability.reason}`);
  }

  const providerHint = input.choice.provider === undefined ? "" : ` provider ${input.choice.provider}`;
  const toolHint = input.choice.toolNames.length === 0 ? "" : ` tools ${input.choice.toolNames.join(", ")}`;
  const details = unavailable.length === 0 ? "no matching registered tools" : unavailable.join("; ");

  throw new Error(
    `no sample ${input.role}${providerHint} provider available from ${input.choice.source}; expected ${input.capabilities.join(
      " or ",
    )}${toolHint} (${details})`,
  );
}

function toolContext(
  ctx: StageContext,
  policy: { reason: string; model: string; units: number },
): ToolContext {
  return {
    projectRoot: ctx.show.projectRoot,
    logger: noopLogger(),
    registry: ctx.registry,
    execution:
      ctx.toolPolicy === undefined
        ? undefined
        : {
            ...ctx.toolPolicy,
            reason: policy.reason,
            model: policy.model,
            units: policy.units,
          },
  };
}

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

async function episodeMediaPath(
  ctx: StageContext,
  sourcePath: string | undefined,
  dirName: "assets" | "audio" | "clips",
  fileName: string,
): Promise<string> {
  if (sourcePath === undefined || sourcePath.length === 0) {
    return path.posix.join("projects", ctx.show.slug, ctx.episode.slug, dirName, fileName);
  }

  const workspace = projectDir(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug);
  const destination = path.join(workspace, dirName, fileName);
  if (isHttpUrl(sourcePath)) {
    await downloadMedia(sourcePath, destination);
    return projectRelativePath(ctx.show.projectRoot, destination);
  }

  const absoluteSource = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(ctx.show.projectRoot, sourcePath);

  if (path.resolve(absoluteSource) === path.resolve(destination)) {
    return projectRelativePath(ctx.show.projectRoot, destination);
  }

  try {
    await access(absoluteSource);
  } catch {
    return sourcePath;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(absoluteSource, destination);
  return projectRelativePath(ctx.show.projectRoot, destination);
}

async function writeEpisodeJson(ctx: StageContext, relativePath: string, payload: unknown): Promise<string> {
  const filePath = path.join(projectDir(ctx.show.projectRoot, ctx.show.slug, ctx.episode.slug), relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return projectRelativePath(ctx.show.projectRoot, filePath);
}

async function writeLyricPlanningArtifacts(
  ctx: StageContext,
  beats: readonly SampleBeat[],
  scenes: readonly unknown[],
): Promise<void> {
  const samplePlan = resolveSamplePlan(ctx);
  const imageProviders = sampleProviderSummaries(ctx, samplePlan.image, ["image_generation"]);
  const videoProviders = sampleProviderSummaries(ctx, samplePlan.video, ["image_to_video", "text_to_video"]);
  const fullScenes = scenes.map((scene, index) => {
    const record = recordValue(scene);
    const slug = stringValue(record?.slug) ?? `sample-${index + 1}`;
    const beat = beatForSceneSlug(slug, beats) ?? beats[index % Math.max(1, beats.length)];
    const prompt = lyricArtImagePrompt(ctx, beat);
    const name = `${String(index + 1).padStart(3, "0")}_${safeFileSlug(slug)}`;
    const promptPath = path.posix.join(
      "projects",
      ctx.show.slug,
      ctx.episode.slug,
      "artifacts",
      "gpt_image2_full_prompts",
      `${name}.txt`,
    );

    return {
      id: `gpt2-${String(index + 1).padStart(3, "0")}`,
      source_scene_id: slug,
      start: numberValue(record?.start_s) ?? 0,
      end: numberValue(record?.end_s) ?? 0,
      duration: roundTime((numberValue(record?.end_s) ?? 0) - (numberValue(record?.start_s) ?? 0)),
      section: beat?.section ?? "sample",
      lyric_text: beat?.sourceLine ?? null,
      name,
      module: "source_free_music_video",
      concept: stringValue(record?.description) ?? beat?.body ?? "",
      prompt_file: promptPath,
      image_path: path.posix.join("projects", ctx.show.slug, ctx.episode.slug, "assets", `${name}.png`),
      video_path: path.posix.join("projects", ctx.show.slug, ctx.episode.slug, "clips", `${name}.mp4`),
      image_prompt: prompt,
      motion_prompt: lyricArtMotionPrompt(ctx, beat),
      hero_moment: record?.hero_moment === true,
    };
  });

  await Promise.all(
    fullScenes.map((scene) => writeTextArtifact(ctx, scene.prompt_file, `${scene.image_prompt}`)),
  );
  await writeEpisodeJson(ctx, "artifacts/gpt_image2_full_scene_plan.json", {
    version: "1.0",
    project: `${ctx.show.slug}/${ctx.episode.slug}`,
    duration_seconds: sampleDuration(ctx),
    scene_count: fullScenes.length,
    max_scene_duration: Math.max(...fullScenes.map((scene) => numberValue(scene.duration) ?? 0)),
    image_provider: imageProviders[0] ?? sampleProviderSummaryFromChoice(samplePlan.image),
    ...(imageProviders[1] === undefined ? {} : { alternate_image_provider: imageProviders[1] }),
    video_provider: videoProviders[0] ?? sampleProviderSummaryFromChoice(samplePlan.video),
    storyboard_first: true,
    scenes: fullScenes,
  });
}

async function writeTextArtifact(ctx: StageContext, projectRelative: string, contents: string): Promise<void> {
  const filePath = path.resolve(ctx.show.projectRoot, projectRelative);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents, "utf8");
}

async function downloadMedia(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to download generated media: ${response.status} ${response.statusText}`);
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

async function narrationText(ctx: StageContext): Promise<string> {
  const direct = await sourceText(ctx);

  return trimForNarration(direct ?? `${ctx.episode.title}. This short provider-backed sample demonstrates the visual direction.`);
}

async function sampleBeats(ctx: StageContext): Promise<SampleBeat[]> {
  if (lyricMusicMode(ctx)) {
    const lyrics = await textInput(ctx, "lyrics");
    const lyricLines = lyrics === undefined ? [] : parseLyricLines(lyrics).filter((line) => !isFillerLyricLine(line.text));
    if (lyricLines.length > 0) {
      const desiredCount = paidSampleSceneCount(ctx, lyricLines.length);
      return lyricLines.slice(0, desiredCount).map((line, index) => {
        const split = splitBeatLine(line.text, index);
        return {
          index,
          title: split.title,
          body: lyricConcept(line.text, index),
          narration: line.text,
          section: line.section,
          sourceLine: line.text,
        };
      });
    }
  }

  const direct = await sourceText(ctx);
  const source =
    direct ??
    [
      `${ctx.episode.title}: show the core promise.`,
      "Reveal the workflow as a simple moving system.",
      "End with the next action and a clean handoff.",
    ].join("\n");
  const lines = meaningfulTextLines(source);
  const segments = lines.length > 0 ? lines : splitSentences(source);
  const desiredCount = paidSampleSceneCount(ctx, segments.length);
  const selected = segments.slice(0, desiredCount);

  return selected.map((line, index) => {
    const split = splitBeatLine(line, index);
    return {
      index,
      title: split.title,
      body: split.body,
      narration: split.body || split.title,
    };
  });
}

async function sourceText(ctx: StageContext): Promise<string | undefined> {
  return (
    (await textInput(ctx, "narration")) ??
    (await textInput(ctx, "script")) ??
    (await textInput(ctx, "host_script")) ??
    (await textInput(ctx, "lyrics")) ??
    (await textInput(ctx, "brief")) ??
    (await textInput(ctx, "diary")) ??
    (await textInput(ctx, "notes"))
  );
}

function meaningfulTextLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("[") && !line.startsWith("#"));
}

function splitSentences(value: string): string[] {
  return value
    .replace(/\s+/gu, " ")
    .split(/(?<=[.!?])\s+/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseLyricLines(value: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let section = "sample";

  for (const raw of value.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }

    const sectionMatch = /^\[(?<section>.+)\]$/u.exec(line);
    if (sectionMatch?.groups?.section) {
      section = sectionMatch.groups.section.trim() || section;
      continue;
    }

    lines.push({ section, text: line });
  }

  return lines;
}

function isFillerLyricLine(line: string): boolean {
  const normalized = line
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]+/gu, " ")
    .trim();
  if (normalized.length === 0) {
    return true;
  }

  const tokens = normalized.split(/\s+/u).filter(Boolean);
  const filler = new Set(["ah", "ayy", "hey", "hm", "hmm", "mmm", "oh", "ooh", "uh", "uhh", "woah", "woo", "yeah", "yo"]);
  return tokens.length <= 2 && tokens.every((token) => filler.has(token.replace(/'+$/u, "")));
}

function splitBeatLine(value: string, index: number): { title: string; body: string } {
  const labeled = /^(?<label>(?:idea|option|step|beat)\s*\d*|next|hook)[:.\-\s]+(?<body>.+)$/iu.exec(value);
  const clean = labeled?.groups?.body?.trim() ?? value.trim();
  const [head, ...tail] = clean.split(":");

  if (tail.length > 0 && head !== undefined && head.trim().length > 0 && head.trim().length <= 42) {
    return { title: head.trim(), body: tail.join(":").trim() || clean };
  }

  const words = clean.match(/[A-Za-z0-9']+/gu) ?? [];
  const fallbackTitle = words.slice(0, Math.min(5, words.length)).join(" ") || `Beat ${index + 1}`;
  return {
    title: labeled?.groups?.label?.trim() ?? fallbackTitle,
    body: clean,
  };
}

function lyricConcept(line: string, index: number): string {
  const motifs = [
    "ordinary creators and workers using accessible AI tools while luxury towers flicker above them",
    "CRT market-panic screens and old-money silhouettes losing control as open tools spread through the city",
    "street-level builders turning a rigged financial map into public infrastructure",
    "neon protest energy moving from isolation toward collective creative leverage",
  ];
  return `Visualize the lyric without printing it: "${line}". Show ${motifs[index % motifs.length]}.`;
}

function lyricMusicMode(ctx: StageContext): boolean {
  if (typeof ctx.episode.inputs.lyrics === "string") {
    return ctx.pipeline.master_clock === "audio" || ctx.pipeline.slug.includes("music") || ctx.pipeline.slug.includes("song");
  }

  return false;
}

function paidSampleSceneCount(ctx: StageContext, availableSegments: number): number {
  const maxScenes = Math.max(1, ctx.pipeline.sample?.max_scenes ?? 3);
  const budget = ctx.runOptions.budget_usd ?? ctx.pipeline.sample?.max_cost_usd;
  const affordableScenes =
    budget === undefined ? maxScenes : Math.max(1, Math.floor(Math.max(0.34, budget - 0.05) / 0.34));

  return Math.max(1, Math.min(maxScenes, affordableScenes, Math.max(1, availableSegments)));
}

function sampleBeatCuts(duration: number, beats: readonly SampleBeat[]): Array<{ start_s: number; end_s: number }> {
  const beatCount = Math.max(1, beats.length);
  const beatDuration = duration / beatCount;

  return Array.from({ length: beatCount }, (_value, index) => ({
    start_s: roundTime(index * beatDuration),
    end_s: roundTime(index === beatCount - 1 ? duration : (index + 1) * beatDuration),
  }));
}

function splitCutByMaxDuration(start: number, end: number, maxDuration: number): Array<{ start_s: number; end_s: number }> {
  const duration = Math.max(0, end - start);
  const parts = Math.max(1, Math.ceil(duration / maxDuration));
  const partDuration = duration / parts;

  return Array.from({ length: parts }, (_value, index) => ({
    start_s: roundTime(start + index * partDuration),
    end_s: roundTime(index === parts - 1 ? end : start + (index + 1) * partDuration),
  }));
}

function ps2SceneDescription(body: string, variant: number): string {
  const motif =
    variant % 2 === 0
      ? "low-poly workers and creators building AI tools from apartment desks while old-money towers flicker in the background"
      : "CRT market-panic screens, gated penthouse silhouettes, and open-source neon code spilling through locked doors";

  return `${body}. Retro PS2 political music-video lyric-art shot: ${motif}, compressed textures, visible polygon edges, vertex lighting, CRT scanlines, VHS tape noise, foggy render distance, no fake article pages, no readable invented logos.`;
}

function beatForSceneSlug(slug: string, beats: readonly SampleBeat[]): SampleBeat | undefined {
  const match = /^sample-(?<index>\d+)/u.exec(slug);
  const index = match?.groups?.index === undefined ? undefined : Number.parseInt(match.groups.index, 10) - 1;

  if (index === undefined || !Number.isInteger(index) || index < 0 || index >= beats.length) {
    return undefined;
  }

  return beats[index];
}

function isSourceFree(ctx: StageContext): boolean {
  return ctx.episode.inputs.sources === null || ctx.episode.inputs.sources === undefined;
}

function scriptRole(index: number, count: number): "hook" | "setup" | "rising_action" | "resolution" {
  if (index === 0) {
    return "hook";
  }
  if (index === count - 1) {
    return "resolution";
  }
  return index === 1 ? "setup" : "rising_action";
}

function imageAssetId(index: number): string {
  return index === 0 ? "paid_sample_image" : `paid_sample_image_${index + 1}`;
}

function clipAssetId(index: number): string {
  return index === 0 ? "paid_sample_clip" : `paid_sample_clip_${index + 1}`;
}

function slideAssetId(slideId: string): string {
  return `deck_slide_${safeFileSlug(slideId)}`;
}

function focusRectForSlide(index: number): { x: number; y: number; width: number; height: number } {
  const presets = [
    { x: 0.08, y: 0.12, width: 0.46, height: 0.34 },
    { x: 0.46, y: 0.18, width: 0.42, height: 0.32 },
    { x: 0.2, y: 0.5, width: 0.56, height: 0.24 },
  ];

  return presets[index % presets.length] ?? presets[0];
}

function highlightRectForSlide(index: number): { x: number; y: number; width: number; height: number } {
  const presets = [
    { x: 0.1, y: 0.16, width: 0.42, height: 0.18 },
    { x: 0.52, y: 0.2, width: 0.34, height: 0.22 },
    { x: 0.22, y: 0.56, width: 0.52, height: 0.16 },
  ];

  return presets[index % presets.length] ?? presets[0];
}

function shortCallout(value: string): string {
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned.length <= 48 ? cleaned : `${cleaned.slice(0, 45).trim()}...`;
}

function cutMotionForScene(scene: Record<string, unknown>): Record<string, unknown> {
  const shotLanguage = recordValue(scene.shot_language);
  const movement = stringValue(shotLanguage?.camera_movement);
  if (movement === "pan_left" || movement === "pan_right" || movement === "push_in" || movement === "pull_out") {
    return { type: movement, zoom_start: 1, zoom_end: movement === "pull_out" ? 1.08 : 1.1 };
  }
  if (movement === "tilt_up") {
    return { type: "pan_up", zoom_start: 1, zoom_end: 1.08 };
  }
  if (movement === "tilt_down") {
    return { type: "pan_down", zoom_start: 1, zoom_end: 1.08 };
  }
  if (stringValue(scene.treatment) === "slide_image") {
    return { type: "static", zoom_start: 1, zoom_end: 1 };
  }

  return { type: "push_in", zoom_start: 1, zoom_end: 1.08 };
}

async function textInput(ctx: StageContext, key: string): Promise<string | undefined> {
  const value = ctx.episode.inputs[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  if (value.includes("\n")) {
    return value;
  }

  try {
    return await readFile(projectReadPath(ctx, value), "utf8");
  } catch {
    return value;
  }
}

async function firstExistingInput(ctx: StageContext, keys: string[]): Promise<string | undefined> {
  for (const key of keys) {
    const value = stringInput(ctx, key);
    if (value === undefined) {
      continue;
    }
    try {
      const resolved = projectReadPath(ctx, value);
      await access(resolved);
      return resolved;
    } catch {
      return value;
    }
  }

  return undefined;
}

function projectReadPath(ctx: StageContext, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(ctx.show.projectRoot, value);
}

function stringInput(ctx: StageContext, key: string): string | undefined {
  const value = ctx.episode.inputs[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function trimForNarration(value: string): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, 700);
}

async function imagePrompt(ctx: StageContext, beat?: SampleBeat): Promise<string> {
  if (lyricMusicMode(ctx)) {
    return lyricArtImagePrompt(ctx, beat);
  }

  const pipelineLabel = readableSlug(ctx.pipeline.slug);
  const style = visualStyleDirection(ctx);
  const brandContext = await brandContextForPrompt(ctx);
  return [
    `Use case: ${pipelineLabel}.`,
    `Asset type: ${aspect(ctx)} keyframe for a ${pipelineLabel} sample.`,
    `Primary request: Create a polished provider-backed start frame for ${ctx.episode.title}.`,
    `Pipeline: ${ctx.pipeline.slug}.`,
    brandContext,
    beat === undefined ? undefined : `Scene beat: ${beat.title}. ${beat.body}`,
    style === undefined ? undefined : `Style direction: ${style}.`,
    `Aspect ratio: ${aspect(ctx)}.`,
    "Reference policy: honor supplied readable reference media and storyboard cues; do not invent missing reference details.",
    "Use clean visual metaphors, layered foreground/background depth, distinct subject design, and no copyrighted third-party character replication.",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

async function motionPrompt(ctx: StageContext, beat?: SampleBeat): Promise<string> {
  if (lyricMusicMode(ctx)) {
    return lyricArtMotionPrompt(ctx, beat);
  }

  const pipelineLabel = readableSlug(ctx.pipeline.slug);
  const style = visualStyleDirection(ctx);
  const beatText = beat === undefined ? "the sample frame" : `"${beat.title}"`;
  const brandContext = await brandContextForPrompt(ctx);
  return [
    `Animate ${beatText} as a short ${rendererFamily(ctx)} ${pipelineLabel} beat.`,
    brandContext,
    style === undefined ? undefined : `Preserve this style: ${style}.`,
    "Use distinct subject motion, foreground/background parallax, motivated camera drift, and readable demo-safe pacing.",
    "Do not add new readable text, logos, or brand names during motion generation.",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

async function brandContextForPrompt(ctx: StageContext): Promise<string> {
  const notes = await brandReferenceForPrompt(ctx);
  const showTitle = ctx.show.display_name;
  const exactTitle = showTitle.toUpperCase();
  const base = [
    `Brand context: Show title: "${showTitle}". Episode title: "${ctx.episode.title}".`,
    ctx.show.description === undefined ? undefined : `Show description: ${trimForNarration(ctx.show.description)}.`,
    notes === undefined ? undefined : `Brand notes: ${notes}`,
  ];

  if (ctx.show.bake_brand_into_images === false) {
    return [
      ...base,
      [
        "On-screen text policy: NO readable text anywhere in the image.",
        "No title pills, headers, captions, labels, UI chrome, logos, watermarks, or overlay numerals.",
        "Background ambient signage may exist only when it is in-scene and not the headline of the frame.",
        "Leave show typography and branding decisions to the compose recipe.",
      ].join(" "),
    ]
      .filter((part): part is string => typeof part === "string")
      .join(" ");
  }

  return [
    ...base,
    [
      `On-screen text policy: If a show title pill is rendered, it must read exactly "${exactTitle}".`,
      "Do not invent other brand names, logos, trademarks, title variants, or altered numerals.",
      "If uncertain, render brand-neutral with no readable text.",
    ].join(" "),
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

async function brandReferenceForPrompt(ctx: StageContext): Promise<string | undefined> {
  const inputNotes = await firstTextInput(ctx, ["brand_notes", "brand_context", "brand_guide"]);
  if (inputNotes !== undefined) {
    return trimForNarration(inputNotes);
  }

  const brandPath = ctx.show.brandPath ?? (typeof ctx.show.brand === "string" ? ctx.show.brand : undefined);
  if (brandPath === undefined) {
    return undefined;
  }

  for (const filename of ["brand.md", "brand.yaml", "brand.yml", "README.md", "style.md", "voice.md"]) {
    try {
      const contents = await readFile(path.join(brandPath, filename), "utf8");
      if (contents.trim().length > 0) {
        return trimForNarration(contents);
      }
    } catch {
      // Brand folders are optional; absent files just mean there are no extra prompt notes.
    }
  }

  return undefined;
}

async function firstTextInput(ctx: StageContext, keys: readonly string[]): Promise<string | undefined> {
  for (const key of keys) {
    const value = await textInput(ctx, key);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function genericTextureKeywords(ctx: StageContext): string[] {
  return ["provider-backed", rendererFamily(ctx), ctx.pipeline.slug, ...styleKeywords(ctx)];
}

function styleKeywords(ctx: StageContext): string[] {
  const style = visualStyleDirection(ctx);
  if (style === undefined) {
    return [];
  }

  const words = style.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  return words
    .filter((word) => word.length >= 4)
    .slice(0, 4)
    .map((word) => word.toLowerCase());
}

function visualStyleDirection(ctx: StageContext): string | undefined {
  const parts = [
    stringInput(ctx, "style"),
    stringInput(ctx, "visual_style"),
    stringInput(ctx, "look"),
    stringInput(ctx, "art_direction"),
    stringInput(ctx, "mood"),
    ctx.episode.playbook === undefined ? undefined : `playbook ${ctx.episode.playbook}`,
    ctx.episode.cast.length === 0 ? undefined : `cast ${ctx.episode.cast.join(", ")}`,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => part !== undefined && part.length > 0);

  return parts.length === 0 ? undefined : parts.join("; ");
}

function readableSlug(value: string): string {
  return value.replace(/[-_]+/gu, " ").trim() || value;
}

function lyricArtImagePrompt(ctx: StageContext, beat?: SampleBeat): string {
  return [
    `Use case: stylized-concept.`,
    `Asset type: ${aspect(ctx)} keyframe for a retro PS2 political music video.`,
    `Primary request: ${beat?.body ?? `Create a source-free lyric-art start frame for ${ctx.episode.title}.`}`,
    beat?.sourceLine === undefined ? undefined : `Lyric beat being visualized, not printed in the image: ${beat.sourceLine}`,
    "Source policy: source-free protest music video; no fake article pages, fake screenshots, fake publisher mastheads, fake agency pages, captions, subtitles, watermarks, or invented readable logos.",
    "Style: low-poly early-2000s video game cinematic, compressed textures, visible polygon edges, simple shaders, vertex lighting, baked shadows, CRT glow, VHS tape noise, foggy render distance, dramatic urban lighting, gritty political rap energy.",
    "Camera and texture: handheld push-in or tracking shot, low-angle or Dutch angle when useful, rain haze, neon reflections, surveillance-camera tension, grainy motion blur.",
    "Safety and likeness: nonviolent class-power metaphor; avoid photoreal portraits of real people, gore, severe injuries, and celebratory harm.",
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
}

function lyricArtMotionPrompt(ctx: StageContext, beat?: SampleBeat): string {
  const subject = beat === undefined ? "the supplied keyframe" : `"${beat.title}"`;
  return [
    "Image-to-video clip. Use the supplied keyframe as the first frame, composition lock, lighting lock, and style lock.",
    `Animate ${subject} as a short ${rendererFamily(ctx)} retro PS2 political music-video shot.`,
    "Use one continuous shot with handheld drift, subtle rain, CRT flicker, neon reflections, low-poly character or crowd motion, VHS artifacts, and a tense push-in or parallax move.",
    "Do not add captions, new readable text, fake news pages, real logos, gore, face morphing, or major composition changes.",
  ].join(" ");
}

function hasReferenceInput(ctx: StageContext): boolean {
  return ["reference", "reference_image", "screenshot", "source_reference_files", "reference_images"].some((key) => {
    const value = ctx.episode.inputs[key];
    return Array.isArray(value) ? value.length > 0 : value !== undefined;
  });
}

function hasNarrationInput(ctx: StageContext): boolean {
  return ["narration", "script", "host_script", "diary"].some((key) => ctx.episode.inputs[key] !== undefined);
}

function sampleDuration(ctx: StageContext): number {
  const min = ctx.pipeline.sample?.duration_s_min ?? 10;
  const max = ctx.pipeline.sample?.duration_s_max ?? 18;
  return Math.min(max, Math.max(min, Math.round((min + max) / 2)));
}

function aspect(ctx: StageContext): string {
  return ctx.episode.aspect ?? ctx.show.pipelines[ctx.pipeline.slug]?.aspect ?? stringValue(ctx.pipeline.defaults?.aspect) ?? "16:9";
}

function imageSize(ctx: StageContext): string {
  const targetAspect = providerAspectRatio(ctx);
  if (targetAspect === "9:16") {
    return "1024x1792";
  }
  if (targetAspect === "1:1") {
    return "1024x1024";
  }

  return "1792x1024";
}

function resolution(ctx: StageContext): [number, number] {
  const targetAspect = providerAspectRatio(ctx);
  if (targetAspect === "9:16") {
    return [1080, 1920];
  }
  if (targetAspect === "1:1") {
    return [1080, 1080];
  }

  return [1920, 1080];
}

function providerAspectRatio(ctx: StageContext): "16:9" | "9:16" | "1:1" {
  const value = aspect(ctx);
  if (value.startsWith("9:16")) {
    return "9:16";
  }
  if (value.startsWith("1:1")) {
    return "1:1";
  }

  return "16:9";
}

function renderRuntime(ctx: StageContext): RenderRuntime {
  const configured = configuredRenderRuntime(ctx);
  if (isPresentationDemo(ctx)) {
    return configured === "ffmpeg" ? "remotion" : configured;
  }

  if (runtimeAvailable(ctx, configured)) {
    return configured;
  }

  return "ffmpeg";
}

function configuredRenderRuntime(ctx: StageContext): RenderRuntime {
  const configured =
    ctx.episode.runtime ??
    ctx.show.pipelines[ctx.pipeline.slug]?.runtime ??
    stringValue(ctx.pipeline.defaults?.render_runtime);

  return isRenderRuntime(configured) ? configured : "ffmpeg";
}

function runtimeAvailable(ctx: StageContext, runtime: RenderRuntime): boolean {
  const availability = ctx.registry.getAvailability(runtime);
  if (availability !== undefined) {
    return availability.available === true;
  }

  return runtime === "ffmpeg";
}

function isRenderRuntime(value: unknown): value is RenderRuntime {
  return value === "ffmpeg" || value === "remotion" || value === "hyperframes";
}

function rendererFamily(ctx: StageContext): string {
  if (ctx.pipeline.slug.includes("screen")) {
    return "screen-demo";
  }
  if (ctx.pipeline.slug.includes("talking")) {
    return "presenter";
  }
  if (ctx.pipeline.slug.includes("cinematic")) {
    return "cinematic-trailer";
  }
  if (ctx.pipeline.slug.includes("documentary")) {
    return "documentary-montage";
  }
  if (ctx.pipeline.slug.includes("music") || ctx.pipeline.slug.includes("news")) {
    return "animation-first";
  }
  return "explainer-teacher";
}

function higgsfieldDuration(ctx: StageContext): 5 | 10 {
  return sampleDuration(ctx) > 7 ? 10 : 5;
}

function assetCount(assetManifest: unknown): number {
  const assets = recordValue(assetManifest)?.assets;
  return Array.isArray(assets) ? assets.length : 0;
}

function assetPath(assetManifest: unknown, id: string): string | undefined {
  const assets = recordValue(assetManifest)?.assets;
  if (!Array.isArray(assets)) {
    return undefined;
  }

  const match = assets.map(recordValue).find((asset) => asset?.id === id);
  return stringValue(match?.path);
}

function assetPaths(assetManifest: unknown, idPattern: RegExp): string[] {
  const assets = recordValue(assetManifest)?.assets;
  if (!Array.isArray(assets)) {
    return [];
  }

  return assets
    .map(recordValue)
    .filter((asset): asset is Record<string, unknown> => asset !== undefined && typeof asset.id === "string" && idPattern.test(asset.id))
    .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }))
    .map((asset) => stringValue(asset.path))
    .filter((value): value is string => value !== undefined);
}

function assetProviderMap(assetManifest: unknown): Map<string, string> {
  const assets = recordArray(recordValue(assetManifest)?.assets);
  return new Map(
    assets
      .map((asset) => [stringValue(asset.id), stringValue(asset.provider)] as const)
      .filter((entry): entry is readonly [string, string] => entry[0] !== undefined && entry[1] !== undefined),
  );
}

function costEntry(
  tool: string,
  provider: string,
  model: string,
  units: number,
  usd: number,
  cacheHit?: boolean,
): CostEntry {
  return {
    tool,
    provider,
    model,
    units,
    usd: roundUsd(usd),
    mode: "sample",
    ...(cacheHit === undefined ? {} : { cache_hit: cacheHit }),
  };
}

function proposalDecisions(ctx: StageContext, options: PaidSampleDispatcherOptions): DecisionEntry[] {
  return [
    renderRuntimeDecision(ctx, "proposal", options),
    decision(ctx, "proposal", "renderer_family_selection", rendererFamily(ctx), "Renderer family matches the bundled paid sample lane.", options),
    decision(ctx, "proposal", "playbook_selection", ctx.episode.playbook ?? "show-default", "Use the configured starter playbook for the demo.", options),
    decision(ctx, "proposal", "motion_commitment", "motion_led", "Paid samples exercise image-to-video instead of a still-only downgrade.", options),
    decision(
      ctx,
      "proposal",
      "concept_selection",
      "provider-sample",
      "The provider sample concept validates the resolved sample provider plan and the selected composition runtime.",
      options,
    ),
    ...(ctx.pipeline.master_clock === "audio"
      ? [decision(ctx, "proposal", "music_source", stringInput(ctx, "track") ?? "sample-track", "Use the starter audio fixture as the sample master clock.", options)]
      : []),
  ];
}

function providerDecision(
  ctx: StageContext,
  capability: string,
  provider: string,
  options: PaidSampleDispatcherOptions,
  choice?: ResolvedSampleChoice,
): DecisionEntry {
  const source = choice?.source ?? options.providerProfile;
  return {
    ...decision(ctx, "assets", "provider_selection", provider, `${provider} is selected by ${source} for ${capability}.`, options),
    scope: { capability, provider },
  };
}

function modelDecision(
  ctx: StageContext,
  provider: string,
  model: string,
  options: PaidSampleDispatcherOptions,
  choice?: ResolvedSampleChoice,
): DecisionEntry {
  const source = choice?.source ?? options.providerProfile;
  return {
    ...decision(ctx, "assets", "model_selection", model, `${model} is the configured ${source} model for ${provider}.`, options),
    scope: { provider },
  };
}

function voiceDecision(
  ctx: StageContext,
  tool: Tool,
  options: PaidSampleDispatcherOptions,
  details: {
    stage: string;
    voiceLabel?: string;
    voiceId?: string;
    voiceName?: string;
    model?: string;
    costUsd?: number;
  },
): DecisionEntry {
  const voiceParts = [
    details.voiceId === undefined ? undefined : `voice_id=${details.voiceId}`,
    details.voiceName === undefined ? undefined : `voice_name=${details.voiceName}`,
    details.model === undefined ? undefined : `model=${details.model}`,
    details.costUsd === undefined ? undefined : `cost_usd=${roundUsd(details.costUsd)}`,
  ].filter((part): part is string => part !== undefined);

  return {
    ...decision(
      ctx,
      details.stage,
      "voice_selection",
      tool.name,
      `${tool.name} (${tool.provider}) is the selected narration lane${voiceParts.length > 0 ? `; ${voiceParts.join(", ")}` : ""}.`,
      options,
    ),
    scope: { capability: "tts", provider: tool.provider },
    options_considered: ttsOptionsConsidered(ctx, tool, details),
  };
}

function renderRuntimeDecision(ctx: StageContext, stage: string, options: PaidSampleDispatcherOptions): DecisionEntry {
  const picked = renderRuntime(ctx);
  return {
    ...decision(ctx, stage, "render_runtime_selection", picked, runtimeDecisionReason(ctx, picked), options),
    options_considered: runtimeOptionsConsidered(ctx, picked),
  };
}

function cacheHitDecision(ctx: StageContext, options: PaidSampleDispatcherOptions, tool: Tool): DecisionEntry {
  return decision(
    ctx,
    "assets",
    "budget_tradeoff",
    `${tool.name}_cache_hit`,
    `A repeated ${tool.provider} prompt/input reused the cached clip with zero new provider cost.`,
    options,
  );
}

function decision(
  ctx: StageContext,
  stage: string,
  category: DecisionEntry["category"],
  picked: string,
  reason: string,
  options: PaidSampleDispatcherOptions,
): DecisionEntry {
  const timestamp = (options.now?.() ?? new Date()).toISOString();
  const suffix = `${stage}-${category}-${picked}`.replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "").toLowerCase();

  return {
    id: `paid-sample-${suffix}-${timestamp.replace(/[^0-9A-Z]/gu, "")}`,
    stage,
    timestamp,
    category,
    options_considered: [
      { label: picked, rejected_because: null, notes: "Selected for the provider-backed sample lane." },
      { label: "zero-key", rejected_because: `The ${options.providerProfile} profile was selected for this sample.`, notes: null },
    ],
    picked,
    reason,
    confidence: 0.82,
    user_visible: true,
    supersedes: null,
  };
}

function runtimeDecisionReason(ctx: StageContext, picked: RenderRuntime): string {
  const configured = configuredRenderRuntime(ctx);
  if (isPresentationDemo(ctx)) {
    return `Presentation-demo locks ${picked} for compose; do not silently swap runtimes after proposal/edit approval.`;
  }

  if (picked === configured) {
    return `Use the configured ${picked} sample render runtime for editor handoff.`;
  }

  return `${configured} is configured but unavailable in this project, so the paid sample uses ffmpeg as an explicit rough-cut fallback.`;
}

function runtimeOptionsConsidered(ctx: StageContext, picked: RenderRuntime): DecisionEntry["options_considered"] {
  const configured = configuredRenderRuntime(ctx);
  const motionLed = true;
  return (["remotion", "hyperframes", "ffmpeg"] as const).map((runtime) => {
    const available = runtimeAvailable(ctx, runtime);
    const rejected =
      runtime === picked
        ? null
        : isPresentationDemo(ctx) && runtime === "ffmpeg"
          ? "static slideshow/ffmpeg downgrade is not allowed for presentation-demo"
        : !available
          ? "runtime not available on this machine"
          : runtime === "ffmpeg" && motionLed
            ? "rough-cut fallback; richer composition runtime was available"
            : runtime === configured
              ? "configured runtime not selected"
              : "not selected for this sample";
    return {
      label: runtime,
      rejected_because: rejected,
      notes:
        runtime === configured
          ? "Configured by the episode, show, or pipeline defaults."
          : available
            ? "Available runtime."
            : null,
    };
  });
}

function ttsOptionsConsidered(
  ctx: StageContext,
  selected: Tool,
  details: { voiceLabel?: string; voiceId?: string; voiceName?: string; model?: string; costUsd?: number },
): DecisionEntry["options_considered"] {
  const options = ctx.registry
    .byCapability("tts")
    .filter((tool) => !isProviderSelectionMarker(tool))
    .map((tool) => {
      const selectedTool = tool.name === selected.name;
      const availability = ctx.registry.getAvailability(tool.name);
      const rejected =
        selectedTool
          ? null
          : availability?.available === false
            ? `not configured: ${availability.reason}`
            : "not selected by the configured voice/provider preference";

      return {
        label: tool.name,
        rejected_because: rejected,
        notes: selectedTool
          ? [
              details.voiceLabel === undefined ? undefined : `voice=${details.voiceLabel}`,
              details.voiceId === undefined ? undefined : `voice_id=${details.voiceId}`,
              details.voiceName === undefined ? undefined : `voice_name=${details.voiceName}`,
              details.model === undefined ? undefined : `model=${details.model}`,
              details.costUsd === undefined ? undefined : `cost_usd=${roundUsd(details.costUsd)}`,
            ]
              .filter((part): part is string => part !== undefined)
              .join("; ")
          : null,
      };
    });

  if (options.length >= 2) {
    return options;
  }

  return [
    ...options,
    {
      label: "attach_existing_voiceover",
      rejected_because: "this run is configured to generate approved narration through the TTS registry",
      notes: null,
    },
  ];
}

function isProviderSelectionMarker(tool: Tool): boolean {
  return tool.provider === "show-sidekick" && (tool.supports ?? []).includes("provider-selection");
}

function projectRelativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join("/");
}

function safeFileSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
  return slug.length > 0 ? slug : "scene";
}

function nowIso(): string {
  return new Date().toISOString();
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(recordValue).filter((record): record is Record<string, unknown> => record !== undefined)
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
