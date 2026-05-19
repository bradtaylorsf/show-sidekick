import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";

const INSTALL = "brew install yt-dlp";

const inputSchema = z.object({
  url: z.string().url(),
  languages: z.array(z.string().min(1)).default(["en"]),
});

const captionSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  text: z.string(),
});

const outputSchema = z.object({
  captions: z.array(captionSchema),
  source_lang: z.string(),
  source_url: z.string().url(),
});

type TranscriptFetcherInput = z.infer<typeof inputSchema>;
type TranscriptFetcherOutput = z.infer<typeof outputSchema>;

export function parseVttTimestamp(value: string): number {
  const parts = value.trim().replace(",", ".").split(":");
  const seconds = Number(parts.at(-1));
  const minutes = Number(parts.at(-2) ?? 0);
  const hours = Number(parts.at(-3) ?? 0);

  if (![seconds, minutes, hours].every(Number.isFinite)) {
    throw new Error(`Invalid VTT timestamp: ${value}`);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export function parseVttCaptions(vtt: string): TranscriptFetcherOutput["captions"] {
  const blocks = vtt.replace(/\r/g, "").split(/\n{2,}/);
  const captions: TranscriptFetcherOutput["captions"] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0 || /^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0] as string)) {
      continue;
    }

    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) {
      continue;
    }

    const timing = lines[timingIndex] as string;
    const [rawStart, rawEnd] = timing.split("-->");
    if (!rawStart || !rawEnd) {
      continue;
    }

    const endToken = rawEnd.trim().split(/\s+/)[0] as string;
    const text = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length === 0) {
      continue;
    }

    captions.push({
      start_s: parseVttTimestamp(rawStart),
      end_s: parseVttTimestamp(endToken),
      text,
    });
  }

  return captions;
}

async function runFile(binary: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) {
        reject(errorWithInstallHint(new Error(stderr.trim() || error.message), INSTALL));
        return;
      }

      resolve();
    });
  });
}

async function findVttFile(dir: string): Promise<string> {
  const entries = await readdir(dir);
  const found = entries.find((entry) => entry.endsWith(".vtt"));

  if (!found) {
    throw new Error("yt-dlp did not produce a VTT caption file");
  }

  return join(dir, found);
}

export function languageFromVttPath(path: string, fallback: string): string {
  return /\.([A-Za-z0-9_-]+)\.vtt$/.exec(path)?.[1] ?? fallback;
}

const transcriptFetcher = defineTool({
  name: "transcript_fetcher",
  capability: "transcript_fetch",
  provider: "yt-dlp",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "yt-dlp",
    install: INSTALL,
  },
  best_for: "fetching parsed captions from YouTube or Vimeo source URLs",
  supports: ["youtube-captions", "vimeo-captions", "webvtt"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: TranscriptFetcherInput): Promise<TranscriptFetcherOutput> {
    const input = inputSchema.parse(params);
    const tempDir = await mkdtemp(join(tmpdir(), "show-sidekick-captions-"));

    try {
      await runFile("yt-dlp", [
        "--skip-download",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs",
        input.languages.join(","),
        "--sub-format",
        "vtt",
        "-o",
        join(tempDir, "%(id)s"),
        input.url,
      ]);
      const vttPath = await findVttFile(tempDir);
      const vtt = await readFile(vttPath, "utf8");

      return outputSchema.parse({
        captions: parseVttCaptions(vtt),
        source_lang: languageFromVttPath(vttPath, input.languages[0] ?? "unknown"),
        source_url: input.url,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
});

export default transcriptFetcher;
