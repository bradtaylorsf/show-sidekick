import {
  ASSET_SOURCE,
  AUDIO_ARCHITECTURE,
  CAMERA_MOVEMENT,
  COLOR_TEMPERATURE,
  DEPTH_OF_FIELD,
  LENS_MM,
  LIGHTING_KEY,
  NARRATIVE_ROLE,
  RENDER_RUNTIME,
  RENDERER_FAMILY,
  SHOT_SIZE,
} from "./enums.js";
import { BRANDING } from "../branding.js";

export type JsonSchema = {
  readonly $schema?: string;
  readonly $id?: string;
  readonly type?: string | readonly string[];
  readonly properties?: { readonly [key: string]: JsonSchema };
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly minItems?: number;
  readonly enum?: readonly unknown[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly anyOf?: readonly JsonSchema[];
};

const stringJson = { type: "string" } as const satisfies JsonSchema;
const booleanJson = { type: "boolean" } as const satisfies JsonSchema;
const numberJson = { type: "number" } as const satisfies JsonSchema;
const nonNegativeNumberJson = { type: "number", minimum: 0 } as const satisfies JsonSchema;
const positiveNumberJson = { type: "number", exclusiveMinimum: 0 } as const satisfies JsonSchema;
const nonNegativeIntegerJson = { type: "integer", minimum: 0 } as const satisfies JsonSchema;
const stringArrayJson = { type: "array", items: stringJson } as const satisfies JsonSchema;
const timingSourceJson = {
  type: "string",
  enum: ["lyric", "word", "beat", "section", "climax", "manual", "audio_energy"],
} as const satisfies JsonSchema;
const voiceoverSourceJson = {
  type: "string",
  enum: ["pptx_notes", "slide_text", "ocr", "operator", "agent"],
} as const satisfies JsonSchema;
const timingRefJson = objectJson(
  "timing-ref",
  {
    lyric_line_id: stringJson,
    word_id: stringJson,
    beat_index: nonNegativeIntegerJson,
    climax_index: nonNegativeIntegerJson,
  },
  [],
);
const slideRectJson = objectJson(
  "slide-rect",
  {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
    width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
    height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
  },
  ["x", "y", "width", "height"],
);
const slideHighlightJson = objectJson(
  "slide-highlight",
  {
    rect: slideRectJson,
    shape: { type: "string", enum: ["rect", "ellipse"] },
    label: stringJson,
  },
  ["rect"],
);
const slideCalloutJson = objectJson(
  "slide-callout",
  {
    text: stringJson,
    target_rect: slideRectJson,
    anchor: { type: "string", enum: ["top", "right", "bottom", "left"] },
  },
  ["text"],
);

function objectJson(
  id: string,
  properties: { readonly [key: string]: JsonSchema },
  required: readonly string[],
): JsonSchema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${BRANDING.packageName}://artifacts/${id}`,
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const sourceJson = objectJson(
  "source",
  {
    url: stringJson,
    title: stringJson,
    accessed_at: stringJson,
    summary: stringJson,
  },
  ["url"],
);

const findingJson = objectJson(
  "finding",
  {
    claim: stringJson,
    evidence: stringJson,
    source_refs: stringArrayJson,
  },
  ["claim"],
);

const dialogueLineJson = objectJson("dialogue-line", { character: stringJson, line: stringJson }, [
  "character",
  "line",
]);

export const BriefJsonSchema = objectJson(
  "brief",
  {
    title: stringJson,
    audience: stringJson,
    platform: stringJson,
    tone: stringJson,
    duration_s: positiveNumberJson,
    hook: stringJson,
    key_points: stringArrayJson,
    notes: stringJson,
  },
  ["title", "audience", "platform", "tone", "duration_s", "hook"],
);

export const ResearchBriefJsonSchema = objectJson(
  "research-brief",
  {
    topic_exploration: stringJson,
    sources: { type: "array", items: sourceJson },
    findings: { type: "array", items: findingJson },
  },
  ["topic_exploration", "sources", "findings"],
);

export const ProposalPacketJsonSchema = objectJson(
  "proposal-packet",
  {
    concept_options: {
      type: "array",
      minItems: 3,
      items: objectJson(
        "concept-option",
        { slug: stringJson, hook: stringJson, treatment: stringJson },
        ["slug", "hook", "treatment"],
      ),
    },
    production_plan: objectJson(
      "production-plan",
      {
        render_runtime: { type: "string", enum: RENDER_RUNTIME },
        renderer_family: { type: "string", enum: RENDERER_FAMILY },
        audio_architecture: { type: "string", enum: AUDIO_ARCHITECTURE },
        sample_required: booleanJson,
      },
      ["render_runtime", "renderer_family", "audio_architecture"],
    ),
    delivery_promise: objectJson(
      "delivery-promise",
      {
        motion_led: booleanJson,
        narration_present: booleanJson,
        music_present: booleanJson,
        reference_driven: booleanJson,
      },
      ["motion_led", "narration_present", "music_present"],
    ),
    decision_log_ref: stringJson,
  },
  ["concept_options", "production_plan", "delivery_promise", "decision_log_ref"],
);

export const ScriptJsonSchema = objectJson(
  "script",
  {
    sections: {
      type: "array",
      items: objectJson(
        "script-section",
        {
          slug: stringJson,
          role: { type: "string", enum: NARRATIVE_ROLE },
          start_s: nonNegativeNumberJson,
          end_s: nonNegativeNumberJson,
          timing_anchor: stringJson,
          timing_source: timingSourceJson,
          timing_ref: timingRefJson,
          start_ms: nonNegativeIntegerJson,
          end_ms: nonNegativeIntegerJson,
          narration: stringJson,
          dialogue: { type: "array", items: dialogueLineJson },
          enhancement_cues: stringArrayJson,
          slide_ids: stringArrayJson,
          vo_source: voiceoverSourceJson,
        },
        ["slug", "start_s", "end_s"],
      ),
    },
  },
  ["sections"],
);

export const ScenePlanJsonSchema = objectJson(
  "scene-plan",
  {
    scenes: {
      type: "array",
      minItems: 1,
      items: objectJson(
        "scene",
        {
          slug: stringJson,
          order: nonNegativeIntegerJson,
          start_s: nonNegativeNumberJson,
          end_s: nonNegativeNumberJson,
          timing_anchor: stringJson,
          timing_source: timingSourceJson,
          timing_ref: timingRefJson,
          start_ms: nonNegativeIntegerJson,
          end_ms: nonNegativeIntegerJson,
          narrative_role: { type: "string", enum: NARRATIVE_ROLE },
          scene_anchor: stringJson,
          hero_moment: booleanJson,
          slide_id: stringJson,
          slide_ids: stringArrayJson,
          treatment: { type: "string", enum: ["slide_image", "zoom_pan", "highlight", "callout", "caption", "support_visual"] },
          focus_rect: slideRectJson,
          highlights: { type: "array", items: slideHighlightJson },
          callouts: { type: "array", items: slideCalloutJson },
          caption: stringJson,
          texture_keywords: stringArrayJson,
          character_actions: {
            type: "array",
            items: objectJson("character-action", { character: stringJson, action: stringJson }, [
              "character",
              "action",
            ]),
          },
          shot_language: objectJson(
            "shot-language",
            {
              shot_size: { type: "string", enum: SHOT_SIZE },
              camera_movement: { type: "string", enum: CAMERA_MOVEMENT },
              lighting_key: { type: "string", enum: LIGHTING_KEY },
              lens_mm: { type: "number", enum: LENS_MM },
              depth_of_field: { type: "string", enum: DEPTH_OF_FIELD },
              color_temperature: { type: "string", enum: COLOR_TEMPERATURE },
            },
            [
              "shot_size",
              "camera_movement",
              "lighting_key",
              "lens_mm",
              "depth_of_field",
              "color_temperature",
            ],
          ),
          required_assets: {
            type: "array",
            items: objectJson(
              "required-asset",
              {
                id: stringJson,
                source: { type: "string", enum: ASSET_SOURCE },
                notes: stringJson,
              },
              ["id", "source"],
            ),
          },
        },
        ["slug", "order", "start_s", "end_s", "narrative_role", "scene_anchor", "shot_language"],
      ),
    },
  },
  ["scenes"],
);

export const AssetManifestJsonSchema = objectJson(
  "asset-manifest",
  {
    assets: {
      type: "array",
      items: objectJson(
        "asset",
        {
          id: stringJson,
          kind: stringJson,
          path: stringJson,
          scene_ref: stringJson,
          provider: stringJson,
          model: stringJson,
          seed: { type: "integer" },
          prompt: stringJson,
          cost_usd: nonNegativeNumberJson,
        },
        ["id", "kind", "path"],
      ),
    },
  },
  ["assets"],
);

export const EndTagPlanJsonSchema = objectJson(
  "end-tag-plan",
  {
    mode: { type: "string", enum: ["overlay", "concat"] },
    text: stringJson,
    placement_seconds_from_end: nonNegativeNumberJson,
    style_ref: stringJson,
  },
  ["mode", "text", "placement_seconds_from_end"],
);

export const CreativeArtifactJsonSchemas = {
  brief: BriefJsonSchema,
  research_brief: ResearchBriefJsonSchema,
  proposal_packet: ProposalPacketJsonSchema,
  script: ScriptJsonSchema,
  scene_plan: ScenePlanJsonSchema,
  asset_manifest: AssetManifestJsonSchema,
  end_tag_plan: EndTagPlanJsonSchema,
} as const;
