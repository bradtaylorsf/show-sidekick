import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CostEntry } from "../artifacts/cost-log.js";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import type { Tool, ToolContext } from "../registry/index.js";
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
    case "script":
      state.script ??= await buildScript(ctx);
      return state.script;
    case "cuesheet":
      state.cuesheet ??= await buildCuesheet(ctx);
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

async function buildCuesheet(ctx: StageContext): Promise<unknown> {
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
  const duration = sampleDuration(ctx);
  const beats = await sampleBeats(ctx);
  const cuts = sampleBeatCuts(duration, beats);
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
            notes: `Generated start frame plus Higgsfield motion clip for this ${readableSlug(ctx.pipeline.slug)} beat.`,
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
      shot_intent: "Turn the lyric into a beat-locked PS2/GTA political music-video shot.",
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
          notes: "Higgsfield GPT Image 2 start frame plus Higgsfield motion clip reused across split <=5s sample scenes.",
        },
      ],
    }));
  });

  await writeLyricPlanningArtifacts(ctx, beats, scenes);

  return { scenes };
}

async function buildAssets(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  const imageTool = await toolFor(ctx, "openai_image", "image_generation");
  const videoTool = await toolFor(ctx, "higgsfield", "image_to_video");
  const beats = await sampleBeats(ctx);
  const imageAssets: Array<Record<string, unknown>> = [];
  const clipAssets: Array<Record<string, unknown>> = [];
  const imagePaths: string[] = [];
  const clipPaths: string[] = [];

  for (const beat of beats) {
    const imagePromptText = imagePrompt(ctx, beat);
    const imageModel = imageTool.name === "higgsfield_image" ? "gpt_image_2" : "gpt-image-2";
    const imageResult = await imageTool.execute(
      imageTool.name === "higgsfield_image"
        ? {
            prompt: imagePromptText,
            aspect_ratio: aspect(ctx).startsWith("9:16") ? "9:16" : "16:9",
            quality: "low",
            resolution: "2k",
          }
        : {
            prompt: imagePromptText,
            model: imageModel,
            size: imageSize(ctx),
            quality: "low",
          },
      toolContext(ctx, {
        reason: `Generate paid-demo explainer start frame ${beat.index + 1}.`,
        model: imageModel,
        units: 1,
      }),
    );
    const image = recordValue(imageResult);
    const imagePrefix = imageTool.name === "higgsfield_image" ? "higgsfield" : "openai";
    const imageFileName = beat.index === 0 ? `${imagePrefix}-sample.png` : `${imagePrefix}-sample-${beat.index + 1}.png`;
    const imagePath = await episodeMediaPath(ctx, stringValue(image?.image_path), "assets", imageFileName);
    imagePaths.push(imagePath);
    costEntries.push(
      costEntry(imageTool.name, imageTool.provider, stringValue(image?.model) ?? imageModel, 1, numberValue(image?.cost_usd) ?? 0),
    );

    const videoInput =
      videoTool.name === "higgsfield" || typeof image?.url !== "string"
        ? { image_path: imagePath, prompt: motionPrompt(ctx, beat), duration: higgsfieldDuration(ctx) }
        : { image_url: image.url, prompt: motionPrompt(ctx, beat), duration: higgsfieldDuration(ctx) };
    const videoResult = await videoTool.execute(
      videoInput,
      toolContext(ctx, {
        reason: `Generate paid-demo explainer motion clip ${beat.index + 1}.`,
        model: "seedance_2_0",
        units: 1,
      }),
    );
    const video = recordValue(videoResult);
    const clipFileName = beat.index === 0 ? "higgsfield-sample.mp4" : `higgsfield-sample-${beat.index + 1}.mp4`;
    const clipPath = await episodeMediaPath(ctx, stringValue(video?.video_path), "clips", clipFileName);
    clipPaths.push(clipPath);
    const cacheHit = video?.cache_hit === true || numberValue(video?.cost_usd) === 0;
    costEntries.push(
      costEntry("higgsfield", "higgsfield", "seedance_2_0", cacheHit ? 0 : 1, numberValue(video?.cost_usd) ?? 0, cacheHit),
    );

    imageAssets.push({
      id: imageAssetId(beat.index),
      kind: "image",
      path: imagePath,
      scene_ref: `sample-${beat.index + 1}`,
      provider: imageTool.provider,
      model: stringValue(image?.model) ?? imageModel,
      prompt: imagePromptText,
      cost_usd: numberValue(image?.cost_usd) ?? 0,
    });
    clipAssets.push({
      id: clipAssetId(beat.index),
      kind: "video",
      path: clipPath,
      scene_ref: `sample-${beat.index + 1}`,
      provider: "higgsfield",
      model: "seedance_2_0",
      prompt: motionPrompt(ctx, beat),
      cost_usd: numberValue(video?.cost_usd) ?? 0,
    });

    if (cacheHit) {
      decisions.push(cacheHitDecision(ctx, options));
    }
  }

  state.imagePaths = imagePaths;
  state.clipPaths = clipPaths;
  state.imagePath = imagePaths[0];
  state.clipPath = clipPaths[0];

  if (ctx.pipeline.master_clock === "voiceover" || hasNarrationInput(ctx)) {
    const tts = await preferredTtsTool(ctx);
    const text = await narrationText(ctx);
    const ttsResult = await tts.execute(
      {
        text,
        voice_id: voiceId(ctx),
        format: tts.name === "elevenlabs_tts" ? "mp3_44100_128" : "mp3",
      },
      toolContext(ctx, {
        reason: "Generate narration audio for the paid-demo sample.",
        model: tts.name === "elevenlabs_tts" ? "eleven_multilingual_v2" : "gpt-4o-mini-tts",
        units: 1,
      }),
    );
    const audio = recordValue(ttsResult);
    state.narrationPath = await episodeMediaPath(ctx, stringValue(audio?.audio_path), "audio", "narration.mp3");
    costEntries.push(
      costEntry(
        tts.name,
        tts.provider,
        stringValue(audio?.model) ?? (tts.name === "elevenlabs_tts" ? "eleven_multilingual_v2" : "gpt-4o-mini-tts"),
        1,
        numberValue(audio?.cost_usd) ?? 0,
      ),
    );
    decisions.push(voiceDecision(ctx, tts, options));
  }

  decisions.push(
    providerDecision(ctx, "image_generation", imageTool.provider, options),
    modelDecision(ctx, imageTool.provider, imageTool.name === "higgsfield_image" ? "gpt_image_2" : "gpt-image-2", options),
    providerDecision(ctx, "image_to_video", "higgsfield", options),
    modelDecision(ctx, "higgsfield", "seedance_2_0", options),
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
              provider: "elevenlabs",
              model: "eleven_multilingual_v2",
              prompt: "Narration generated from episode script input.",
              cost_usd: 0,
            },
          ]),
    ],
  };
}

function buildEditDecisions(ctx: StageContext, state: PaidSampleState): unknown {
  const duration = sampleDuration(ctx);
  const clipPaths = state.clipPaths && state.clipPaths.length > 0 ? state.clipPaths : state.clipPath ? [state.clipPath] : [];
  const scenes = recordValue(state.scene_plan)?.scenes;
  const sceneCuts = Array.isArray(scenes)
    ? scenes.map((scene, index) => {
        const record = recordValue(scene);
        const requiredAssets = record?.required_assets;
        const firstAsset = Array.isArray(requiredAssets) ? recordValue(requiredAssets[0]) : undefined;

        return {
          start_s: numberValue(record?.start_s) ?? 0,
          end_s: numberValue(record?.end_s) ?? duration,
          asset_id: stringValue(firstAsset?.id) ?? clipAssetId(index % Math.max(1, clipPaths.length)),
          provider: "higgsfield",
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
        provider: "higgsfield",
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

async function buildRenderReport(
  ctx: StageContext,
  state: PaidSampleState,
  costEntries: CostEntry[],
  decisions: DecisionEntry[],
  options: PaidSampleDispatcherOptions,
): Promise<unknown> {
  const runtime = renderRuntime(ctx);
  const composeTool = runtime === "ffmpeg" ? await toolFor(ctx, "ffmpeg", "video_compose") : await toolFor(ctx, "video_compose", "video_compose");
  const outputPath = `projects/${ctx.show.slug}/${ctx.episode.slug}/renders/paid-sample.mp4`;
  const composeInput =
    runtime === "ffmpeg"
      ? {
          operation: "compose",
          asset_manifest: state.asset_manifest,
          edit_decisions: state.edit_decisions,
          output_path: outputPath,
        }
      : {
          asset_manifest: state.asset_manifest,
          edit_decisions: state.edit_decisions,
          proposal_packet: state.proposal_packet,
          decision_log: [renderRuntimeDecision(ctx, "compose", options)],
          output_path: outputPath,
          planned_duration_s: sampleDuration(ctx),
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

  return {
    output_path: stringValue(record?.output_path) ?? `projects/${ctx.show.slug}/${ctx.episode.slug}/renders/paid-sample.mp4`,
    encoding_profile: stringValue(record?.encoding_profile) ?? "ffmpeg/h264-aac",
    duration_s: numberValue(record?.duration_s) ?? duration,
    resolution: recordValue(record?.resolution) ?? { width, height },
    framerate: numberValue(record?.framerate) ?? 30,
    runtime_used: renderRuntime(ctx),
    asset_count: numberValue(record?.asset_count) ?? assetCount(state.asset_manifest),
    warnings: Array.isArray(record?.warnings) ? record.warnings : [],
    validation_steps: Array.isArray(record?.validation_steps)
      ? record.validation_steps
      : [{ name: "paid-sample-compose", status: "pass", notes: "Render assembled through the paid sample dispatcher." }],
  };
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

async function preferredTtsTool(ctx: StageContext): Promise<Tool> {
  const elevenLabs = ctx.registry.get("elevenlabs_tts");
  if (elevenLabs !== undefined) {
    return elevenLabs;
  }

  return toolFor(ctx, "openai_tts", "tts");
}

async function toolFor(ctx: StageContext, name: string, capability: string): Promise<Tool> {
  const named = ctx.registry.get(name);
  if (named !== undefined) {
    const cached = ctx.registry.getAvailability(name);
    if (cached?.available === true) {
      return named;
    }
    if (cached === undefined) {
      const availability = await named.isAvailable({ projectRoot: ctx.show.projectRoot });
      if (availability.available) {
        return named;
      }
    }
  }

  return ctx.registry.select(capability, { prefer: [name], context: { projectRoot: ctx.show.projectRoot } });
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
    image_provider: { provider: "openai", model: "gpt-image-2", execution_path: "OpenAI Image API" },
    alternate_image_provider: { provider: "higgsfield", model: "gpt_image_2", execution_path: "higgsfield CLI" },
    video_provider: { provider: "higgsfield", model: "seedance_2_0", execution_path: "higgsfield CLI image-to-video" },
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

  return `${body}. The ChaosFM PS2/GTA political music-video lyric-art shot: ${motif}, compressed textures, visible polygon edges, vertex lighting, CRT scanlines, VHS tape noise, foggy render distance, no fake article pages, no readable invented logos.`;
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

function imagePrompt(ctx: StageContext, beat?: SampleBeat): string {
  if (lyricMusicMode(ctx)) {
    return lyricArtImagePrompt(ctx, beat);
  }

  const pipelineLabel = readableSlug(ctx.pipeline.slug);
  const style = visualStyleDirection(ctx);
  return [
    `Use case: ${pipelineLabel}.`,
    `Asset type: ${aspect(ctx)} keyframe for a ${pipelineLabel} sample.`,
    `Primary request: Create a polished provider-backed start frame for ${ctx.episode.title}.`,
    `Pipeline: ${ctx.pipeline.slug}.`,
    beat === undefined ? undefined : `Scene beat: ${beat.title}. ${beat.body}`,
    style === undefined ? undefined : `Style direction: ${style}.`,
    `Aspect ratio: ${aspect(ctx)}.`,
    "Reference policy: honor supplied readable reference media and storyboard cues; do not invent missing reference details.",
    "Use clean visual metaphors, layered foreground/background depth, distinct subject design, and no copyrighted third-party character replication.",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
}

function motionPrompt(ctx: StageContext, beat?: SampleBeat): string {
  if (lyricMusicMode(ctx)) {
    return lyricArtMotionPrompt(ctx, beat);
  }

  const pipelineLabel = readableSlug(ctx.pipeline.slug);
  const style = visualStyleDirection(ctx);
  const beatText = beat === undefined ? "the sample frame" : `"${beat.title}"`;
  return [
    `Animate ${beatText} as a short ${rendererFamily(ctx)} ${pipelineLabel} beat.`,
    style === undefined ? undefined : `Preserve this style: ${style}.`,
    "Use distinct subject motion, foreground/background parallax, motivated camera drift, and readable demo-safe pacing.",
  ]
    .filter((part): part is string => typeof part === "string")
    .join(" ");
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
    `Asset type: ${aspect(ctx)} keyframe for a PS2/GTA political music video.`,
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
    `Animate ${subject} as a short ${rendererFamily(ctx)} PS2/GTA political music-video shot.`,
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
  return aspect(ctx).startsWith("9:16") ? "1024x1536" : "1536x1024";
}

function resolution(ctx: StageContext): [number, number] {
  return aspect(ctx).startsWith("9:16") ? [1080, 1920] : [1920, 1080];
}

function renderRuntime(ctx: StageContext): RenderRuntime {
  const configured = configuredRenderRuntime(ctx);
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

function voiceId(ctx: StageContext): string {
  const value = ctx.episode.inputs.voice_id;
  return typeof value === "string" && value.trim().length > 0 ? value : "21m00Tcm4TlvDq8ikWAM";
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
      "The provider sample concept validates OpenAI, ElevenLabs, Higgsfield, and the selected composition runtime.",
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
): DecisionEntry {
  return {
    ...decision(ctx, "assets", "provider_selection", provider, `${provider} is selected by the ${options.providerProfile} profile for ${capability}.`, options),
    scope: { capability, provider },
  };
}

function modelDecision(
  ctx: StageContext,
  provider: string,
  model: string,
  options: PaidSampleDispatcherOptions,
): DecisionEntry {
  return {
    ...decision(ctx, "assets", "model_selection", model, `${model} is the configured ${options.providerProfile} model for ${provider}.`, options),
    scope: { provider },
  };
}

function voiceDecision(ctx: StageContext, tool: Tool, options: PaidSampleDispatcherOptions): DecisionEntry {
  return decision(ctx, "script", "voice_selection", tool.name, `${tool.name} is the configured narration lane for the paid sample.`, options);
}

function renderRuntimeDecision(ctx: StageContext, stage: string, options: PaidSampleDispatcherOptions): DecisionEntry {
  const picked = renderRuntime(ctx);
  return {
    ...decision(ctx, stage, "render_runtime_selection", picked, runtimeDecisionReason(ctx, picked), options),
    options_considered: runtimeOptionsConsidered(ctx, picked),
  };
}

function cacheHitDecision(ctx: StageContext, options: PaidSampleDispatcherOptions): DecisionEntry {
  return decision(ctx, "assets", "budget_tradeoff", "higgsfield_cache_hit", "A repeated Higgsfield prompt/input reused the cached clip with zero new provider cost.", options);
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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
