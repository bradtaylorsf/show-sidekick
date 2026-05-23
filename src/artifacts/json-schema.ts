import {
  AUDIO_ARCHITECTURE,
  RENDER_RUNTIME,
  RENDERER_FAMILY,
  type RenderRuntime,
} from "./enums.js";
import { CreativeArtifactJsonSchemas, type JsonSchema } from "./creative-json-schema.js";
import { DECISION_CATEGORY } from "./decision-log.js";
import { FINAL_REVIEW_THRESHOLDS } from "./final-review.js";
import { BRANDING } from "../branding.js";

const stringJson = { type: "string" } as const satisfies JsonSchema;
const booleanJson = { type: "boolean" } as const satisfies JsonSchema;
const numberJson = { type: "number" } as const satisfies JsonSchema;
const nonNegativeNumberJson = { type: "number", minimum: 0 } as const satisfies JsonSchema;
const positiveNumberJson = { type: "number", exclusiveMinimum: 0 } as const satisfies JsonSchema;
const nonNegativeIntegerJson = { type: "integer", minimum: 0 } as const satisfies JsonSchema;
const stringArrayJson = { type: "array", items: stringJson } as const satisfies JsonSchema;
const unknownJson = {} as const satisfies JsonSchema;
const unknownArrayJson = { type: "array", items: unknownJson } as const satisfies JsonSchema;
const unknownRecordJson = { type: "object", additionalProperties: true } as const satisfies JsonSchema;
const nullableNonNegativeNumberJson = { type: ["number", "null"], minimum: 0 } as const satisfies JsonSchema;
const nullableNonNegativeIntegerJson = { type: ["integer", "null"], minimum: 0 } as const satisfies JsonSchema;
const timingSourceJson = {
  type: "string",
  enum: ["lyric", "word", "beat", "section", "climax", "manual", "audio_energy"],
} as const satisfies JsonSchema;
const timingRefJson = objectJson(
  "timing_ref",
  {
    lyric_line_id: stringJson,
    word_id: stringJson,
    beat_index: nonNegativeIntegerJson,
    climax_index: nonNegativeIntegerJson,
  },
  [],
);

function withMeta(id: string, schema: JsonSchema): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${BRANDING.packageName}://artifacts/${id}`,
    ...schema,
  };
}

function objectJson(
  id: string,
  properties: { readonly [key: string]: JsonSchema },
  required: readonly string[],
  additionalProperties: boolean | JsonSchema = false,
): JsonSchema {
  return withMeta(id, {
    type: "object",
    additionalProperties,
    properties,
    required,
  });
}

const resolutionJson = objectJson(
  "resolution",
  {
    width: { type: "integer", exclusiveMinimum: 0 },
    height: { type: "integer", exclusiveMinimum: 0 },
  },
  ["width", "height"],
);

const viewportJson = objectJson(
  "viewport",
  {
    width: { type: "integer", exclusiveMinimum: 0 },
    height: { type: "integer", exclusiveMinimum: 0 },
  },
  ["width", "height"],
);

const renderRuntimeJson = { type: "string", enum: RENDER_RUNTIME } as const satisfies JsonSchema;
const rendererFamilyJson = { type: "string", enum: RENDERER_FAMILY } as const satisfies JsonSchema;

const audioEnergyWindowJson = objectJson(
  "audio_energy.window",
  {
    start_s: nonNegativeNumberJson,
    end_s: nonNegativeNumberJson,
    rms: nonNegativeNumberJson,
    lufs: numberJson,
  },
  ["start_s", "end_s", "rms", "lufs"],
);

export const AudioEnergyJsonSchema = objectJson(
  "audio_energy",
  {
    source: { type: "string", enum: ["ffmpeg-ebur128", "pcm-rms", "manual"] },
    raw_points: {
      type: "array",
      items: objectJson(
        "audio_energy.raw_point",
        {
          time_s: nonNegativeNumberJson,
          momentary_lufs: numberJson,
          is_silence: booleanJson,
        },
        ["time_s", "momentary_lufs"],
      ),
    },
    energy_profile: {
      type: "array",
      items: audioEnergyWindowJson,
    },
    first_active_s: nullableNonNegativeNumberJson,
    peak_s: nullableNonNegativeNumberJson,
    recommended_offset_s: nonNegativeNumberJson,
    best_window: {
      anyOf: [
        objectJson(
          "audio_energy.best_window",
          {
            start_s: nonNegativeNumberJson,
            end_s: nonNegativeNumberJson,
            average_lufs: numberJson,
            peak_lufs: numberJson,
          },
          ["start_s", "end_s"],
        ),
        { type: "null" },
      ],
    },
    silence_threshold_lufs: numberJson,
    analysis_window_s: positiveNumberJson,
    astats: unknownRecordJson,
    rms_windows: {
      type: "array",
      items: audioEnergyWindowJson,
    },
  },
  ["source", "raw_points", "energy_profile", "first_active_s", "peak_s", "recommended_offset_s", "best_window"],
);

export const LyricsAlignedJsonSchema = objectJson(
  "lyrics_aligned",
  {
    source: { type: "string", enum: ["transcript_words", "manual", "mixed"] },
    lines: {
      type: "array",
      items: objectJson(
        "lyrics_aligned.line",
        {
          id: stringJson,
          text: stringJson,
          confidence: { type: "number", minimum: 0 },
          matched_word_ids: stringArrayJson,
          start_s: nullableNonNegativeNumberJson,
          end_s: nullableNonNegativeNumberJson,
          start_ms: nullableNonNegativeIntegerJson,
          end_ms: nullableNonNegativeIntegerJson,
          source: { type: "string", enum: ["aligned", "gap_filled", "manual", "manual-correction", "unmatched"] },
          original_source: { type: "string", enum: ["aligned", "gap_filled", "manual", "manual-correction", "unmatched"] },
          flagged: booleanJson,
        },
        [
          "text",
          "confidence",
          "matched_word_ids",
          "start_s",
          "end_s",
          "start_ms",
          "end_ms",
          "source",
          "flagged",
        ],
      ),
    },
  },
  ["source", "lines"],
);

export const LyricsAlignmentOverridesJsonSchema = objectJson(
  "lyrics_alignment_overrides",
  {
    overrides: {
      type: "array",
      items: objectJson(
        "lyrics_alignment_overrides.override",
        {
          line_id: stringJson,
          line_index: nonNegativeIntegerJson,
          start_s: nonNegativeNumberJson,
          end_s: nonNegativeNumberJson,
          start_ms: nonNegativeIntegerJson,
          end_ms: nonNegativeIntegerJson,
          text: stringJson,
          note: stringJson,
        },
        [],
      ),
    },
  },
  ["overrides"],
);

export const CaptureManifestJsonSchema = objectJson(
  "capture_manifest",
  {
    screenshots: {
      type: "array",
      items: objectJson(
        "capture_manifest.screenshot",
        {
          story_id: stringJson,
          image_path: stringJson,
          captured_at: stringJson,
          viewport: { anyOf: [stringJson, viewportJson] },
          quality_flags: stringArrayJson,
          page_load_status: { anyOf: [nonNegativeIntegerJson, stringJson] },
          url: stringJson,
          publisher: stringJson,
        },
        ["story_id", "image_path"],
      ),
    },
    failures: {
      type: "array",
      items: objectJson(
        "capture_manifest.failure",
        {
          story_id: stringJson,
          url: stringJson,
          reason: stringJson,
          page_load_status: { anyOf: [nonNegativeIntegerJson, stringJson] },
        },
        ["story_id", "reason"],
      ),
    },
  },
  ["screenshots"],
);

// Cross-slide uniqueness and contiguous ordering are enforced by DeckManifestSchema's
// Zod superRefine path. Draft 2020-12 JSON Schema cannot express those subfield
// constraints without non-standard extensions, so this bundled schema stays portable.
export const DeckManifestJsonSchema = objectJson(
  "deck_manifest",
  {
    source: objectJson(
      "deck_manifest.source",
      {
        kind: { type: "string", enum: ["pdf", "ppt", "pptx", "url"] },
        file_type: { type: "string", enum: ["pdf", "ppt", "pptx"] },
        source_path: stringJson,
        source_url: stringJson,
        working_file_path: stringJson,
        sha256: stringJson,
        byte_size: nonNegativeIntegerJson,
      },
      ["kind", "file_type", "sha256", "byte_size"],
    ),
    slides: {
      type: "array",
      items: objectJson(
        "deck_manifest.slide",
        {
          id: stringJson,
          order: { type: "integer", exclusiveMinimum: 0 },
          image_path: stringJson,
          image: objectJson(
            "deck_manifest.slide.image",
            {
              width: { type: "integer", exclusiveMinimum: 0 },
              height: { type: "integer", exclusiveMinimum: 0 },
            },
            ["width", "height"],
          ),
          text: stringJson,
          text_source: { type: "string", enum: ["native", "ocr", "absent"] },
          speaker_notes: stringJson,
          notes_source: { type: "string", enum: ["pptx_notes", "operator", "absent"] },
          warnings: stringArrayJson,
          source: objectJson(
            "deck_manifest.slide.source",
            {
              slide_number: { type: "integer", exclusiveMinimum: 0 },
              source_slide_id: stringJson,
            },
            ["slide_number"],
          ),
        },
        ["id", "order", "image_path", "image", "text_source", "notes_source", "source"],
      ),
    },
    extraction: objectJson(
      "deck_manifest.extraction",
      {
        text_engine: stringJson,
        notes_engine: stringJson,
        screenshot_engine: stringJson,
        extracted_at: stringJson,
        warnings: stringArrayJson,
      },
      [],
    ),
  },
  ["source", "slides", "extraction"],
);

const cuesheetSceneAnchorJson = objectJson(
  "cuesheet.scene_anchor",
  {
    scene_id: stringJson,
    start_s: nonNegativeNumberJson,
    end_s: nonNegativeNumberJson,
    snapped_to: { type: "string", enum: ["section_start", "beat", "downbeat", "word", "climax", "manual"] },
    slide_ids: stringArrayJson,
    source: objectJson(
      "cuesheet.scene_anchor.source",
      {
        section: stringJson,
        lyric_line_id: stringJson,
        beat_index: nonNegativeIntegerJson,
        word_id: stringJson,
        climax_index: nonNegativeIntegerJson,
      },
      [],
    ),
  },
  ["scene_id", "start_s", "end_s", "snapped_to", "source"],
);

export const CuesheetJsonSchema = objectJson(
  "cuesheet",
  {
    audio: objectJson(
      "cuesheet.audio",
      {
        path: stringJson,
        duration_s: positiveNumberJson,
        sample_rate: { type: "integer", exclusiveMinimum: 0 },
        channels: { type: "integer", exclusiveMinimum: 0 },
      },
      ["path", "duration_s", "sample_rate", "channels"],
    ),
    master_clock: { type: "string", enum: ["audio", "voiceover"] },
    bpm: positiveNumberJson,
    words: unknownArrayJson,
    segments: unknownArrayJson,
    sections: unknownArrayJson,
    beats: unknownArrayJson,
    climax: unknownArrayJson,
    scene_anchors: {
      type: "array",
      items: cuesheetSceneAnchorJson,
    },
  },
  ["audio", "master_clock", "segments", "sections", "beats", "climax", "scene_anchors"],
  true,
);

export const CostLogJsonSchema = withMeta("cost_log", {
  type: "array",
  items: objectJson(
    "cost_log.entry",
    {
      tool: stringJson,
      provider: stringJson,
      model: stringJson,
      units: nonNegativeNumberJson,
      usd: nonNegativeNumberJson,
      mode: { type: "string", enum: ["sample", "full"] },
      cache_hit: { type: "boolean" },
    },
    ["tool", "provider", "model", "units", "usd", "mode"],
  ),
});

export const DecisionLogJsonSchema = withMeta("decision_log", {
  type: "array",
  items: objectJson(
    "decision_log.entry",
    {
      id: stringJson,
      stage: stringJson,
      timestamp: stringJson,
      category: { type: "string", enum: DECISION_CATEGORY },
      scope: objectJson(
        "decision_log.scope",
        {
          capability: stringJson,
          provider: stringJson,
        },
        [],
      ),
      options_considered: {
        type: "array",
        minItems: 2,
        items: objectJson(
          "decision_log.option",
          {
            label: stringJson,
            rejected_because: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
          ["label", "rejected_because"],
        ),
      },
      picked: stringJson,
      reason: stringJson,
      confidence: { type: "number", minimum: 0 },
      user_visible: booleanJson,
      supersedes: { type: ["string", "null"] },
    },
    ["id", "stage", "timestamp", "category", "options_considered", "picked", "reason", "confidence", "user_visible", "supersedes"],
  ),
});

export const EditDecisionsJsonSchema = objectJson(
  "edit_decisions",
  {
    cuts: {
      type: "array",
      items: objectJson(
        "edit_decisions.cut",
        {
          start_s: nonNegativeNumberJson,
          end_s: nonNegativeNumberJson,
          timing_anchor: stringJson,
          timing_source: timingSourceJson,
          timing_ref: timingRefJson,
          start_ms: nonNegativeIntegerJson,
          end_ms: nonNegativeIntegerJson,
          asset_id: stringJson,
          transition_in: stringJson,
          transition_out: stringJson,
          provider: stringJson,
        },
        ["start_s", "end_s", "asset_id"],
      ),
    },
    overlays: unknownArrayJson,
    subtitles: objectJson(
      "edit_decisions.subtitles",
      {
        enabled: booleanJson,
        source: stringJson,
      },
      [],
    ),
    audio: unknownRecordJson,
    music: unknownJson,
    transitions: unknownArrayJson,
    render_runtime: renderRuntimeJson,
    renderer_family: rendererFamilyJson,
    brand: objectJson("edit_decisions.brand", { slug: stringJson, name: stringJson }, ["slug", "name"]),
  },
  ["cuts", "render_runtime", "renderer_family"],
);

export const FinalReviewJsonSchema = objectJson(
  "final_review",
  {
    status: { type: "string", enum: ["pass", "revise", "fail"] },
    recommended_action: { type: "string", enum: ["present_to_user", "re_render", "revise_edit", "revise_assets", "block"] },
    checks: objectJson(
      "final_review.checks",
      {
        technical_probe: unknownRecordJson,
        visual_spotcheck: unknownRecordJson,
        audio_spotcheck: unknownRecordJson,
        promise_preservation: unknownRecordJson,
        subtitle_check: unknownRecordJson,
        transcript_comparison: unknownRecordJson,
      },
      ["technical_probe", "visual_spotcheck", "audio_spotcheck", "promise_preservation", "subtitle_check"],
    ),
    issues_found: unknownArrayJson,
    thresholds: objectJson(
      "final_review.thresholds",
      Object.fromEntries(
        Object.entries(FINAL_REVIEW_THRESHOLDS).map(([key, value]) => [
          key,
          Number.isInteger(value) ? nonNegativeIntegerJson : nonNegativeNumberJson,
        ]),
      ),
      [],
    ),
  },
  ["status", "recommended_action", "checks"],
);

export const PublishLogJsonSchema = objectJson(
  "publish_log",
  {
    outputs: {
      type: "array",
      items: objectJson(
        "publish_log.output",
        {
          path: stringJson,
          kind: stringJson,
          platform: stringJson,
          notes: stringJson,
        },
        ["path"],
      ),
    },
    metadata: unknownRecordJson,
    source_manifest_path: stringJson,
    captions_path: stringJson,
    notes: stringArrayJson,
  },
  ["outputs"],
  true,
);

export const RenderReportJsonSchema = objectJson(
  "render_report",
  {
    output_path: stringJson,
    encoding_profile: stringJson,
    duration_s: nonNegativeNumberJson,
    expected_duration_s: nonNegativeNumberJson,
    drift_s: nonNegativeNumberJson,
    drift_frames: nonNegativeNumberJson,
    drift_tolerance_s: positiveNumberJson,
    within_tolerance: booleanJson,
    clip_trims: {
      type: "array",
      items: objectJson(
        "render_report.clip_trim",
        {
          asset_id: stringJson,
          requested_duration_s: positiveNumberJson,
          actual_duration_s: nonNegativeNumberJson,
          drift_s: nonNegativeNumberJson,
          drift_frames: nonNegativeNumberJson,
          within_tolerance: booleanJson,
        },
        [
          "asset_id",
          "requested_duration_s",
          "actual_duration_s",
          "drift_s",
          "drift_frames",
          "within_tolerance",
        ],
      ),
    },
    resolution: resolutionJson,
    framerate: positiveNumberJson,
    runtime_used: renderRuntimeJson,
    asset_count: nonNegativeIntegerJson,
    warnings: stringArrayJson,
    validation_steps: {
      type: "array",
      items: objectJson(
        "render_report.validation_step",
        {
          name: stringJson,
          status: { type: "string", enum: ["pass", "warn", "fail"] },
          notes: stringJson,
        },
        ["name", "status"],
      ),
    },
  },
  ["output_path", "encoding_profile", "duration_s", "resolution", "framerate", "runtime_used", "asset_count"],
);

export const ReviewJsonSchema = objectJson(
  "review",
  {
    stage: stringJson,
    round: nonNegativeIntegerJson,
    decision: { type: "string", enum: ["pass", "revise", "pass_with_warnings"] },
    findings: unknownArrayJson,
    summary: objectJson(
      "review.summary",
      {
        critical: nonNegativeIntegerJson,
        suggestions: nonNegativeIntegerJson,
        nitpicks: nonNegativeIntegerJson,
        investigations: nonNegativeIntegerJson,
        success_criteria_met: nonNegativeIntegerJson,
        success_criteria_total: nonNegativeIntegerJson,
      },
      ["critical", "suggestions", "nitpicks", "investigations", "success_criteria_met", "success_criteria_total"],
    ),
  },
  ["stage", "round", "decision", "summary"],
);

export const SourceMediaReviewJsonSchema = objectJson(
  "source_media_review",
  {
    files: {
      type: "array",
      minItems: 1,
      items: objectJson(
        "source_media_review.file",
        {
          path: stringJson,
          reviewed: booleanJson,
          technical_probe: unknownRecordJson,
          content_summary: stringJson,
          planning_implications: stringArrayJson,
        },
        ["path", "reviewed", "technical_probe", "content_summary"],
      ),
    },
  },
  ["files"],
);

export const VideoAnalysisBriefJsonSchema = objectJson(
  "video_analysis_brief",
  {
    pacing_style: stringJson,
    promise_elements: stringArrayJson,
    approved_budget_usd: nonNegativeNumberJson,
    scenes: {
      type: "array",
      items: objectJson(
        "video_analysis_brief.scene",
        {
          scene_ref: stringJson,
          subject: stringArrayJson,
          subject_motion: stringArrayJson,
          scene: stringArrayJson,
          spatial_framing: stringArrayJson,
          camera: stringArrayJson,
          motion_type: { type: "string", enum: ["motion_clip", "animated_still", "static_image"] },
          flow_variance: numberJson,
        },
        ["subject", "subject_motion", "scene", "spatial_framing", "camera", "motion_type", "flow_variance"],
      ),
    },
  },
  ["scenes"],
);

export const ActionTimelineJsonSchema = withMeta("action_timeline", {
  type: "object",
  additionalProperties: {
    type: "array",
    items: objectJson(
      "action_timeline.entry",
      {
        time_s: nonNegativeNumberJson,
        pose: stringJson,
        transition_frames: nonNegativeIntegerJson,
        ease: stringJson,
      },
      ["time_s", "pose", "transition_frames", "ease"],
    ),
  },
});

export const CharacterDesignJsonSchema = objectJson(
  "character_design",
  {
    slug: stringJson,
    required_actions: stringArrayJson,
    required_emotions: stringArrayJson,
    visual_description: stringJson,
    references: unknownArrayJson,
  },
  ["slug", "visual_description"],
);

export const CharacterQaReportJsonSchema = objectJson(
  "character_qa_report",
  {
    findings: unknownArrayJson,
    summary: objectJson(
      "character_qa_report.summary",
      {
        characters_reviewed: nonNegativeIntegerJson,
        critical: nonNegativeIntegerJson,
        suggestions: nonNegativeIntegerJson,
      },
      ["characters_reviewed", "critical", "suggestions"],
    ),
  },
  ["summary"],
);

export const PoseLibraryJsonSchema = objectJson(
  "pose_library",
  {
    poses: unknownRecordJson,
    expressions: unknownRecordJson,
  },
  ["poses", "expressions"],
);

export const RigPlanJsonSchema = objectJson(
  "rig_plan",
  {
    character: stringJson,
    joints: {
      type: "array",
      minItems: 1,
      items: objectJson(
        "rig_plan.joint",
        {
          id: stringJson,
          parent: { type: ["string", "null"] },
          pivot: objectJson("rig_plan.point", { x: numberJson, y: numberJson }, ["x", "y"]),
          default_rotation_deg: numberJson,
          range_deg: objectJson("rig_plan.range", { min: numberJson, max: numberJson }, ["min", "max"]),
        },
        ["id", "parent", "pivot", "default_rotation_deg"],
      ),
    },
    attachment_points: unknownArrayJson,
  },
  ["character", "joints"],
);

export const ArtifactJsonSchemas = {
  ...CreativeArtifactJsonSchemas,
  action_timeline: ActionTimelineJsonSchema,
  audio_energy: AudioEnergyJsonSchema,
  capture_manifest: CaptureManifestJsonSchema,
  character_design: CharacterDesignJsonSchema,
  character_qa_report: CharacterQaReportJsonSchema,
  cost_log: CostLogJsonSchema,
  cuesheet: CuesheetJsonSchema,
  deck_manifest: DeckManifestJsonSchema,
  decision_log: DecisionLogJsonSchema,
  edit_decisions: EditDecisionsJsonSchema,
  final_review: FinalReviewJsonSchema,
  pose_library: PoseLibraryJsonSchema,
  publish_log: PublishLogJsonSchema,
  render_report: RenderReportJsonSchema,
  review: ReviewJsonSchema,
  rig_plan: RigPlanJsonSchema,
  lyrics_aligned: LyricsAlignedJsonSchema,
  lyrics_alignment_overrides: LyricsAlignmentOverridesJsonSchema,
  source_media_review: SourceMediaReviewJsonSchema,
  video_analysis_brief: VideoAnalysisBriefJsonSchema,
  audio_architecture: withMeta("audio_architecture", { type: "string", enum: AUDIO_ARCHITECTURE }),
  render_runtime: withMeta("render_runtime", { type: "string", enum: RENDER_RUNTIME satisfies readonly RenderRuntime[] }),
} as const;

export type ArtifactJsonSchemaName = keyof typeof ArtifactJsonSchemas;
