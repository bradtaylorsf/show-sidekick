import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "../checkpoints/io.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export const LyricAlignmentSourceSchema = z.enum(["aligned", "gap_filled", "manual", "unmatched"]);

export const LyricAlignedLineSchema = z
  .object({
    id: z.string().optional(),
    text: z.string(),
    confidence: z.number().min(0).max(1),
    matched_word_ids: z.array(z.string()),
    start_s: z.number().nonnegative().nullable(),
    end_s: z.number().nonnegative().nullable(),
    start_ms: z.number().int().nonnegative().nullable(),
    end_ms: z.number().int().nonnegative().nullable(),
    source: LyricAlignmentSourceSchema,
    flagged: z.boolean(),
  })
  .refine((line) => line.start_s === null || line.end_s === null || line.end_s >= line.start_s, {
    message: "lyric line end_s must be greater than or equal to start_s",
    path: ["end_s"],
  })
  .refine((line) => line.start_ms === null || line.end_ms === null || line.end_ms >= line.start_ms, {
    message: "lyric line end_ms must be greater than or equal to start_ms",
    path: ["end_ms"],
  });

export const LyricsAlignedSchema = z.object({
  source: z.enum(["transcript_words", "manual", "mixed"]),
  lines: z.array(LyricAlignedLineSchema),
});

export type LyricAlignmentSource = z.infer<typeof LyricAlignmentSourceSchema>;
export type LyricAlignedLine = z.infer<typeof LyricAlignedLineSchema>;
export type LyricsAligned = z.infer<typeof LyricsAlignedSchema>;

export function lyricsAlignedPath(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "lyrics_aligned.json");
}

export async function writeLyricsAligned(
  projectRoot: string,
  show: string,
  episode: string,
  lyricsAligned: LyricsAligned,
): Promise<string> {
  const parsed = LyricsAlignedSchema.parse(lyricsAligned);
  const filePath = lyricsAlignedPath(projectRoot, show, episode);

  await atomicWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);

  return filePath;
}

export async function readLyricsAligned(projectRoot: string, show: string, episode: string): Promise<LyricsAligned> {
  return loadJson(lyricsAlignedPath(projectRoot, show, episode), LyricsAlignedSchema);
}
