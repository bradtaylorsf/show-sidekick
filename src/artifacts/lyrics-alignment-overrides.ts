import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

const OverrideSecondsSchema = z.number().nonnegative();
const OverrideMillisecondsSchema = z.number().int().nonnegative();

export const LyricsAlignmentOverrideSchema = z
  .object({
    line_id: z.string().min(1).optional(),
    line_index: z.number().int().nonnegative().optional(),
    start_s: OverrideSecondsSchema.optional(),
    end_s: OverrideSecondsSchema.optional(),
    start_ms: OverrideMillisecondsSchema.optional(),
    end_ms: OverrideMillisecondsSchema.optional(),
    text: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((override) => override.line_id !== undefined || override.line_index !== undefined, {
    message: "override must include line_id or line_index",
    path: ["line_id"],
  })
  .refine(
    (override) =>
      override.start_s !== undefined ||
      override.end_s !== undefined ||
      override.start_ms !== undefined ||
      override.end_ms !== undefined,
    {
      message: "override must include at least one timing field",
      path: ["start_ms"],
    },
  );

export const LyricsAlignmentOverridesSchema = z.object({
  overrides: z.array(LyricsAlignmentOverrideSchema),
});

export type LyricsAlignmentOverride = z.infer<typeof LyricsAlignmentOverrideSchema>;
export type LyricsAlignmentOverrides = z.infer<typeof LyricsAlignmentOverridesSchema>;

export function lyricsAlignmentOverridesPath(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "lyrics_alignment_overrides.json");
}

export async function readLyricsAlignmentOverrides(
  projectRoot: string,
  show: string,
  episode: string,
): Promise<LyricsAlignmentOverrides | undefined> {
  const filePath = lyricsAlignmentOverridesPath(projectRoot, show, episode);

  try {
    await access(filePath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }

  return loadJson(filePath, LyricsAlignmentOverridesSchema);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
