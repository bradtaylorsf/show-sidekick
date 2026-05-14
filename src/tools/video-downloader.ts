import { execFile } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectPath } from "../tool-support/paths.js";

const INSTALL = "brew install yt-dlp";

const inputSchema = z.object({
  url: z.string().url(),
  output_dir: z.string().min(1),
  format: z.string().min(1).default("mp4"),
});

const outputSchema = z.object({
  path: z.string().min(1),
  duration_s: z.number().nonnegative().optional(),
  source_url: z.string().url(),
});

type VideoDownloaderInput = z.infer<typeof inputSchema>;
type VideoDownloaderOutput = z.infer<typeof outputSchema>;

export function parseDownloadedPath(stdout: string): string | undefined {
  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("["));

  return lines.at(-1);
}

async function runFile(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(errorWithInstallHint(new Error(stderr.trim() || error.message), INSTALL));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function newestFile(dir: string): Promise<string> {
  const entries = await readdir(dir);
  const candidates = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry);
      const info = await stat(path);
      return info.isFile() ? { path, mtimeMs: info.mtimeMs } : undefined;
    }),
  );
  const newest = candidates
    .filter((candidate): candidate is { path: string; mtimeMs: number } => candidate !== undefined)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!newest) {
    throw new Error(`yt-dlp did not produce a media file in ${dir}`);
  }

  return newest.path;
}

const videoDownloader = defineTool({
  name: "video_downloader",
  capability: "video_download",
  provider: "yt-dlp",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "yt-dlp",
    install: INSTALL,
  },
  best_for: "downloading reviewable source clips from supported video URLs",
  supports: ["youtube", "vimeo", "local-review-fixtures"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: VideoDownloaderInput, ctx): Promise<VideoDownloaderOutput> {
    const input = inputSchema.parse(params);
    const outputDir = resolveProjectPath(input.output_dir, ctx.projectRoot);
    await mkdir(outputDir, { recursive: true });

    const result = await runFile("yt-dlp", [
      "--no-progress",
      "--merge-output-format",
      input.format,
      "--print",
      "after_move:filepath",
      "-o",
      join(outputDir, "%(id)s.%(ext)s"),
      input.url,
    ]);
    const path = parseDownloadedPath(result.stdout) ?? (await newestFile(outputDir));

    return outputSchema.parse({
      path,
      source_url: input.url,
    });
  },
});

export default videoDownloader;
