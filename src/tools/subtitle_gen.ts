import { writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import {
  ensureOutputDir,
  resolveProjectPath,
  resolveToolRunPath,
  srtTimestamp,
  vttTimestamp,
} from "../tool-support/audio-processing.js";

const cueSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    text: z.string().min(1),
  })
  .refine((cue) => cue.end_s >= cue.start_s, { message: "cue end_s must be greater than or equal to start_s" });

const wordSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    text: z.string().min(1).optional(),
    word: z.string().min(1).optional(),
  })
  .refine((word) => word.end_s >= word.start_s, { message: "word end_s must be greater than or equal to start_s" })
  .refine((word) => word.text !== undefined || word.word !== undefined, { message: "word requires text or word" })
  .transform((word) => ({
    start_s: word.start_s,
    end_s: word.end_s,
    text: word.text ?? word.word ?? "",
  }));

const cuesheetArtifactSchema = z.object({
  segments: z.array(cueSchema).min(1),
});

const inputSchema = z
  .object({
    cuesheet: z.union([z.array(cueSchema).min(1), cuesheetArtifactSchema]).optional(),
    words: z.array(wordSchema).min(1).optional(),
    max_chars_per_line: z.number().int().positive().default(42),
    format: z.enum(["srt", "vtt"]).default("srt"),
    output_path: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.cuesheet && !value.words) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subtitle_gen requires either cuesheet or words",
      });
    }
  });

const outputSchema = z.object({
  subtitle_path: z.string(),
  format: z.enum(["srt", "vtt"]),
  cue_count: z.number().int().nonnegative(),
  cost_usd: z.number(),
});

type Cue = z.infer<typeof cueSchema>;
type Word = z.infer<typeof wordSchema>;

export default defineTool({
  name: "subtitle_gen",
  capability: "subtitle_generation",
  provider: "local",
  status: "beta",
  integration: { kind: "library", package: "node:fs", install: "built into Node.js" },
  best_for: "Generating SRT or WebVTT subtitle files from cuesheets or word-level transcript timestamps.",
  supports: ["srt", "vtt", "word-timestamps", "cuesheet"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const cues = resolveCues(input);
    const outputPath = resolveSubtitlePath(input.output_path, input.format, ctx.projectRoot);
    const content = input.format === "srt" ? renderSrt(cues) : renderVtt(cues);

    await ensureOutputDir(outputPath);
    await writeFile(outputPath, content, "utf8");

    return outputSchema.parse({
      subtitle_path: outputPath,
      format: input.format,
      cue_count: cues.length,
      cost_usd: 0,
    });
  },
});

function resolveCues(input: z.infer<typeof inputSchema>): Cue[] {
  if (Array.isArray(input.cuesheet)) {
    return input.cuesheet;
  }

  if (input.cuesheet) {
    return input.cuesheet.segments;
  }

  return groupWords(input.words ?? [], input.max_chars_per_line);
}

function groupWords(words: Word[], maxCharsPerLine: number): Cue[] {
  const cues: Cue[] = [];
  let current: Word[] = [];
  let currentText = "";

  for (const word of words) {
    const nextText = currentText ? `${currentText} ${word.text}` : word.text;

    if (current.length > 0 && nextText.length > maxCharsPerLine) {
      cues.push(wordsToCue(current));
      current = [word];
      currentText = word.text;
      continue;
    }

    current.push(word);
    currentText = nextText;
  }

  if (current.length > 0) {
    cues.push(wordsToCue(current));
  }

  return cues;
}

function wordsToCue(words: Word[]): Cue {
  const first = words[0];
  const last = words[words.length - 1];

  if (!first || !last) {
    throw new Error("cannot build subtitle cue from empty word group");
  }

  return {
    start_s: first.start_s,
    end_s: last.end_s,
    text: words.map((word) => word.text).join(" "),
  };
}

function renderSrt(cues: Cue[]): string {
  return `${cues
    .map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start_s)} --> ${srtTimestamp(cue.end_s)}\n${cue.text.trim()}\n`)
    .join("\n")}\n`;
}

function renderVtt(cues: Cue[]): string {
  return `WEBVTT\n\n${cues
    .map((cue) => `${vttTimestamp(cue.start_s)} --> ${vttTimestamp(cue.end_s)}\n${cue.text.trim()}\n`)
    .join("\n")}\n`;
}

function resolveSubtitlePath(outputPath: string | undefined, format: "srt" | "vtt", projectRoot: string): string {
  if (outputPath) {
    const resolved = resolveProjectPath(outputPath, projectRoot);
    return extname(resolved) ? resolved : `${resolved}.${format}`;
  }

  return resolveToolRunPath(projectRoot, "subtitles", `subtitles.${format}`);
}
