import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "../checkpoints/io.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export const CuesheetWordSchema = z
  .object({
    text: z.string(),
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
  })
  .refine((word) => word.end_s >= word.start_s, {
    message: "word end_s must be greater than or equal to start_s",
    path: ["end_s"],
  });

export const WordSchema = CuesheetWordSchema;

export const CuesheetSegmentSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    text: z.string(),
    words: z.array(CuesheetWordSchema),
  })
  .refine((segment) => segment.end_s >= segment.start_s, {
    message: "segment end_s must be greater than or equal to start_s",
    path: ["end_s"],
  });

export const SegmentSchema = CuesheetSegmentSchema;

export const SectionSchema = z.object({
  label: z.string(),
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  kind: z.enum(["vocal", "instrumental", "silence"]),
  energy: z.number().min(0).max(1),
});

export const BeatSchema = z.object({
  time_s: z.number().nonnegative(),
  strength: z.number().min(0).max(1),
  is_downbeat: z.boolean(),
});

export const ClimaxPointSchema = z.object({
  time_s: z.number().nonnegative(),
  type: z.enum(["peak", "drop", "arrival", "release"]),
  intensity: z.number().min(0).max(1),
  source: z.enum(["algorithm", "agent", "manual"]),
});

export const SceneAnchorSchema = z.object({
  scene_id: z.string(),
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  snapped_to: z.enum(["section_start", "beat", "downbeat", "word", "climax", "manual"]),
  slide_ids: z.array(z.string()).optional(),
  source: z.object({
    section: z.string().optional(),
    lyric_line_id: z.string().optional(),
    beat_index: z.number().int().nonnegative().optional(),
    word_id: z.string().optional(),
    climax_index: z.number().int().nonnegative().optional(),
  }),
});

export const AudioTrackSchema = z.object({
  path: z.string(),
  duration_s: z.number().positive(),
  sample_rate: z.number().int().positive(),
  channels: z.number().int().positive(),
});

export const CuesheetSchema = z
  .object({
    audio: AudioTrackSchema,
    master_clock: z.enum(["audio", "voiceover"]),
    bpm: z.number().positive().optional(),
    transcription_confidence: z
      .object({
        average: z.number().min(0).max(1),
        low_confidence: z.boolean(),
      })
      .optional(),
    words: z.array(CuesheetWordSchema).optional(),
    segments: z.array(CuesheetSegmentSchema),
    sections: z.array(SectionSchema),
    beats: z.array(BeatSchema),
    climax: z.array(ClimaxPointSchema),
    scene_anchors: z.array(SceneAnchorSchema),
  })
  .passthrough();

export type CuesheetWord = z.infer<typeof CuesheetWordSchema>;
export type CuesheetSegment = z.infer<typeof CuesheetSegmentSchema>;
export type Cuesheet = z.infer<typeof CuesheetSchema>;

export function cuesheetPath(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "cuesheet.json");
}

export async function writeCuesheet(
  projectRoot: string,
  show: string,
  episode: string,
  cuesheet: Cuesheet,
): Promise<string> {
  const parsed = CuesheetSchema.parse(cuesheet);
  const filePath = cuesheetPath(projectRoot, show, episode);

  await atomicWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);

  return filePath;
}

export async function readCuesheet(projectRoot: string, show: string, episode: string): Promise<Cuesheet> {
  return loadJson(cuesheetPath(projectRoot, show, episode), CuesheetSchema);
}
