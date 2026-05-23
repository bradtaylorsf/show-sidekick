import { z } from "zod";
import {
  CuesheetSchema,
  DeckManifestSchema,
  EditDecisionsSchema,
  ScriptSchema,
  type Cuesheet,
  type DeckManifest,
  type DeckSlide,
  type EditDecisions,
  type RenderRuntime,
  type Script,
} from "../artifacts/index.js";
import type { ScenePlan } from "../artifacts/scene-plan.js";

const SlideRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

const SlideMotionSchema = z.object({
  kind: z.enum(["static", "zoom_pan", "push_in", "pull_out", "pan", "support_visual"]).default("zoom_pan"),
  from: SlideRectSchema.optional(),
  to: SlideRectSchema.optional(),
  start_zoom: z.number().positive().optional(),
  end_zoom: z.number().positive().optional(),
  pan_x: z.number().optional(),
  pan_y: z.number().optional(),
});

const SlideHighlightSchema = z.object({
  id: z.string().optional(),
  rect: SlideRectSchema,
  label: z.string().optional(),
  tone: z.enum(["info", "warning", "success", "danger"]).default("info"),
  start_s: z.number().nonnegative().optional(),
  end_s: z.number().nonnegative().optional(),
});

const SlideCalloutSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  anchor_rect: SlideRectSchema.optional(),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).default("bottom-right"),
  tone: z.enum(["info", "warning", "success", "danger"]).default("info"),
  start_s: z.number().nonnegative().optional(),
  end_s: z.number().nonnegative().optional(),
});

const SlideCaptionSchema = z.object({
  text: z.string(),
  start_s: z.number().nonnegative().optional(),
  end_s: z.number().nonnegative().optional(),
});

const SupportVisualSchema = z.object({
  id: z.string().optional(),
  kind: z.string().default("diagram"),
  asset_id: z.string().optional(),
  label: z.string().optional(),
  notes: z.string().optional(),
});

export const SlideTreatmentSchema = z.object({
  scene_type: z.enum(["slide_image", "slide_callout", "support_visual"]).default("slide_image"),
  slide_id: z.string().optional(),
  motion: SlideMotionSchema.optional(),
  highlights: z.array(SlideHighlightSchema).default([]),
  callouts: z.array(SlideCalloutSchema).default([]),
  caption: SlideCaptionSchema.optional(),
  support_visuals: z.array(SupportVisualSchema).default([]),
});

export const PresentationDemoCompositionInputSchema = z.object({
  deck_manifest: DeckManifestSchema,
  edit_decisions: EditDecisionsSchema,
  scene_plan: z.unknown().optional(),
  script: ScriptSchema.optional(),
  cuesheet: CuesheetSchema.optional(),
  output_path: z.string().optional(),
  fps: z.number().positive().default(30),
  resolution: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .default({ width: 1920, height: 1080 }),
  runtime: z.enum(["remotion", "hyperframes"]).optional(),
});

export const PresentationDemoSceneSchema = z.object({
  id: z.string(),
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  start_frame: z.number().int().nonnegative(),
  duration_frames: z.number().int().positive(),
  scene_type: z.enum(["slide_image", "slide_callout", "support_visual"]),
  slide_id: z.string(),
  slide_index: z.number().int().nonnegative(),
  image_path: z.string(),
  title: z.string().optional(),
  narration: z.string().optional(),
  motion: SlideMotionSchema,
  highlights: z.array(SlideHighlightSchema),
  callouts: z.array(SlideCalloutSchema),
  caption: SlideCaptionSchema.optional(),
  support_visuals: z.array(SupportVisualSchema),
});

export const PresentationDemoCompositionSchema = z.object({
  runtime: z.enum(["remotion", "hyperframes"]),
  output_path: z.string(),
  fps: z.number().positive(),
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  duration_s: z.number().nonnegative(),
  expected_duration_s: z.number().nonnegative(),
  drift_tolerance_s: z.number().positive(),
  scenes: z.array(PresentationDemoSceneSchema).min(1),
  audio: z
    .object({
      path: z.string(),
      duration_s: z.number().positive(),
    })
    .optional(),
  captions: z
    .object({
      source: z.string().optional(),
      words: z.array(z.unknown()).default([]),
    })
    .optional(),
  validation_notes: z.array(z.string()).default([]),
});

export type SlideTreatment = z.infer<typeof SlideTreatmentSchema>;
export type PresentationDemoCompositionInput = z.input<typeof PresentationDemoCompositionInputSchema>;
export type PresentationDemoComposition = z.infer<typeof PresentationDemoCompositionSchema>;
export type PresentationDemoScene = z.infer<typeof PresentationDemoSceneSchema>;

type UnknownRecord = Record<string, unknown>;

export function buildPresentationDemoComposition(input: PresentationDemoCompositionInput): PresentationDemoComposition {
  const parsed = PresentationDemoCompositionInputSchema.parse(input);
  const runtime = parsed.runtime ?? runtimeForEdit(parsed.edit_decisions);
  assertComposeRuntime(parsed.edit_decisions, runtime);

  const slideById = new Map(parsed.deck_manifest.slides.map((slide) => [slide.id, slide]));
  const scenes = parsed.edit_decisions.cuts.map((cut, index) => {
    const treatment = treatmentForCut(cut);
    const slide = slideForCut({
      deck: parsed.deck_manifest,
      slideById,
      cut,
      treatment,
      index,
    });
    const narration = narrationForCut(parsed.script, cut);
    const fallbackCaption = narration ? { text: narration, start_s: cut.start_s, end_s: cut.end_s } : undefined;
    const sceneType = treatment.scene_type ?? "slide_image";

    return PresentationDemoSceneSchema.parse({
      id: sceneId(cut, index),
      start_s: cut.start_s,
      end_s: cut.end_s,
      start_frame: Math.round(cut.start_s * parsed.fps),
      duration_frames: Math.max(1, Math.round((cut.end_s - cut.start_s) * parsed.fps)),
      scene_type: sceneType,
      slide_id: slide.id,
      slide_index: slide.index,
      image_path: slide.screenshot_path,
      title: slide.title,
      narration,
      motion: motionForTreatment(treatment, index),
      highlights: treatment.highlights,
      callouts: treatment.callouts,
      caption: treatment.caption ?? fallbackCaption,
      support_visuals: treatment.support_visuals,
    });
  });
  const durationS = scenes.reduce((max, scene) => Math.max(max, scene.end_s), 0);
  const expectedDurationS = expectedDuration(parsed.cuesheet, durationS);

  return PresentationDemoCompositionSchema.parse({
    runtime,
    output_path: parsed.output_path ?? `renders/presentation-demo-${runtime}.mp4`,
    fps: parsed.fps,
    resolution: parsed.resolution,
    duration_s: durationS,
    expected_duration_s: expectedDurationS,
    drift_tolerance_s: 1 / parsed.fps,
    scenes,
    audio: parsed.cuesheet
      ? {
          path: parsed.cuesheet.audio.path,
          duration_s: parsed.cuesheet.audio.duration_s,
        }
      : undefined,
    captions: captionSource(parsed.edit_decisions, parsed.cuesheet),
    validation_notes: validationNotes({
      deck: parsed.deck_manifest,
      editDecisions: parsed.edit_decisions,
      scenes,
      scenePlan: parsed.scene_plan as ScenePlan | undefined,
    }),
  });
}

export function assertComposeRuntime(editDecisions: EditDecisions, runtime: Exclude<RenderRuntime, "ffmpeg">): void {
  if (editDecisions.render_runtime !== runtime) {
    throw new Error(
      `compose runtime '${runtime}' would silently swap edit_decisions.render_runtime '${editDecisions.render_runtime}'`,
    );
  }
}

function runtimeForEdit(editDecisions: EditDecisions): Exclude<RenderRuntime, "ffmpeg"> {
  if (editDecisions.render_runtime === "hyperframes") {
    return "hyperframes";
  }
  if (editDecisions.render_runtime === "remotion") {
    return "remotion";
  }
  throw new Error("presentation-demo composition requires edit_decisions.render_runtime to be remotion or hyperframes");
}

function sceneId(cut: { timing_anchor?: string }, index: number): string {
  return cut.timing_anchor ?? `slide-scene-${index + 1}`;
}

function treatmentForCut(cut: unknown): SlideTreatment {
  if (!isRecord(cut)) {
    return SlideTreatmentSchema.parse({});
  }

  const candidate = isRecord(cut.treatment) ? cut.treatment : cut;
  return SlideTreatmentSchema.parse(candidate);
}

function slideForCut(input: {
  deck: DeckManifest;
  slideById: ReadonlyMap<string, DeckSlide>;
  cut: unknown;
  treatment: SlideTreatment;
  index: number;
}): DeckSlide {
  const directId = input.treatment.slide_id ?? (isRecord(input.cut) ? stringValue(input.cut.slide_id) : undefined);
  if (directId !== undefined) {
    const slide = input.slideById.get(directId);
    if (slide === undefined) {
      throw new Error(`edit decision references slide_id '${directId}', but deck_manifest has no matching slide`);
    }
    return slide;
  }

  const slide = input.deck.slides[input.index] ?? input.deck.slides[0];
  if (slide === undefined) {
    throw new Error("presentation-demo composition requires at least one slide in deck_manifest");
  }
  return slide;
}

function motionForTreatment(treatment: SlideTreatment, index: number): z.infer<typeof SlideMotionSchema> {
  if (treatment.motion !== undefined) {
    return treatment.motion;
  }

  return {
    kind: index % 2 === 0 ? "zoom_pan" : "push_in",
    start_zoom: 1,
    end_zoom: index % 2 === 0 ? 1.08 : 1.05,
    pan_x: index % 2 === 0 ? -0.02 : 0.02,
    pan_y: -0.01,
  };
}

function narrationForCut(script: Script | undefined, cut: { start_s: number; end_s: number }): string | undefined {
  const sections = script?.sections ?? [];
  const overlapping = sections
    .filter((section) => section.narration && section.end_s > cut.start_s && section.start_s < cut.end_s)
    .map((section) => section.narration?.trim())
    .filter((value): value is string => Boolean(value));

  if (overlapping.length === 0) {
    return undefined;
  }

  return overlapping.join(" ");
}

function expectedDuration(cuesheet: Cuesheet | undefined, durationS: number): number {
  return cuesheet?.audio.duration_s ?? durationS;
}

function captionSource(editDecisions: EditDecisions, cuesheet: Cuesheet | undefined): PresentationDemoComposition["captions"] | undefined {
  if (editDecisions.subtitles?.enabled || editDecisions.subtitles?.source) {
    return {
      source: editDecisions.subtitles.source,
      words: cuesheet?.words ?? cuesheet?.segments.flatMap((segment) => segment.words) ?? [],
    };
  }

  if ((cuesheet?.words?.length ?? 0) > 0) {
    return {
      words: cuesheet?.words ?? [],
    };
  }

  return undefined;
}

function validationNotes(input: {
  deck: DeckManifest;
  editDecisions: EditDecisions;
  scenes: PresentationDemoScene[];
  scenePlan?: ScenePlan;
}): string[] {
  const animatedScenes = input.scenes.filter((scene) => hasMotionOrOverlay(scene)).length;
  const notes = [
    `${input.scenes.length} slide-based scene(s) mapped from ${input.deck.slide_count} deck slide(s).`,
    `${animatedScenes} scene(s) include motion, highlight, callout, caption, or support-visual treatment.`,
  ];

  if (input.scenePlan?.scenes.length) {
    notes.push(`${input.scenePlan.scenes.length} planned scene(s) were available for timing cross-checks.`);
  }
  if (input.editDecisions.subtitles?.enabled || input.editDecisions.subtitles?.source) {
    notes.push("Caption source is enabled in edit decisions.");
  }

  return notes;
}

function hasMotionOrOverlay(scene: PresentationDemoScene): boolean {
  return (
    scene.motion.kind !== "static" ||
    scene.highlights.length > 0 ||
    scene.callouts.length > 0 ||
    scene.support_visuals.length > 0 ||
    scene.caption !== undefined
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
