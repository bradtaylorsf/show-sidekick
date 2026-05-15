import { z } from "zod";
import { RendererFamilySchema, RenderRuntimeSchema } from "./enums.js";

type UnknownRecord = Record<string, unknown>;

export const DuckingSchema = z.union([
  z.boolean(),
  z.object({
    enabled: z.boolean(),
    threshold_db: z.number(),
    reduction_db: z.number(),
    attack_ms: z.number().nonnegative(),
    release_ms: z.number().nonnegative(),
  }),
]);

export const CutSchema = z.object({
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  asset_id: z.string(),
  transition_in: z.string().optional(),
  transition_out: z.string().optional(),
  provider: z.string().optional(),
}).refine((cut) => cut.end_s > cut.start_s, {
  message: "cut end_s must be greater than start_s",
  path: ["end_s"],
});

export const EditDecisionsSchema = z.object({
  cuts: z.array(CutSchema),
  overlays: z.array(z.unknown()).default([]),
  subtitles: z
    .object({
      enabled: z.boolean().optional(),
      source: z.string().optional(),
    })
    .optional(),
  audio: z
    .object({
      music: z
        .object({
          track_path: z.string().optional(),
          ducking: DuckingSchema.optional(),
        })
        .optional(),
    })
    .optional(),
  music: z.unknown().optional(),
  transitions: z.array(z.unknown()).optional(),
  render_runtime: RenderRuntimeSchema,
  renderer_family: RendererFamilySchema,
  brand: z
    .object({
      slug: z.string(),
      name: z.string(),
    })
    .optional(),
});

export type Ducking = z.infer<typeof DuckingSchema>;
export type Cut = z.infer<typeof CutSchema>;
export type EditDecisions = z.infer<typeof EditDecisionsSchema>;

export function migrateEditDecisions(legacy: unknown): EditDecisions {
  const candidate = isRecord(legacy) ? cloneRecord(legacy) : legacy;

  if (!isRecord(candidate)) {
    return EditDecisionsSchema.parse(candidate);
  }

  const audio = isRecord(candidate.audio) ? cloneRecord(candidate.audio) : {};
  if (candidate.music !== undefined && audio.music === undefined) {
    audio.music = normalizeLegacyMusic(candidate.music);
    candidate.audio = audio;
    delete candidate.music;
  }

  const transitions = candidate.transitions;
  if (Array.isArray(candidate.cuts) && Array.isArray(transitions)) {
    candidate.cuts = candidate.cuts.map((cut, index) => {
      if (!isRecord(cut)) {
        return cut;
      }

      const transition = transitions[index] ?? transitions[0];
      if (transition === undefined) {
        return cut;
      }

      return {
        ...cut,
        transition_in: cut.transition_in ?? transitionField(transition, ["transition_in", "in"]),
        transition_out: cut.transition_out ?? transitionField(transition, ["transition_out", "out"]),
      };
    });
    delete candidate.transitions;
  }

  return EditDecisionsSchema.parse(candidate);
}

function normalizeLegacyMusic(music: unknown): unknown {
  if (typeof music === "string") {
    return { track_path: music };
  }

  if (!isRecord(music)) {
    return music;
  }

  return {
    ...music,
    track_path: music.track_path ?? music.path,
  };
}

function transitionField(transition: unknown, fields: string[]): string | undefined {
  if (typeof transition === "string") {
    return transition;
  }

  if (!isRecord(transition)) {
    return undefined;
  }

  for (const field of fields) {
    const value = transition[field];
    if (typeof value === "string") {
      return value;
    }
  }

  return undefined;
}

function cloneRecord(value: UnknownRecord): UnknownRecord {
  return { ...value };
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
