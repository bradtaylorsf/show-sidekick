import { mkdir, mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectPath } from "../tool-support/paths.js";

const PLAYWRIGHT_PACKAGE: string = "playwright";
const INSTALL = "pnpm add -D playwright && pnpm exec playwright install chromium";

const viewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const stepSchema = z.object({
  action: z.enum(["click", "type", "wait"]),
  selector: z.string().min(1).optional(),
  value: z.string().optional(),
  ms: z.number().int().nonnegative().optional(),
});

const inputSchema = z.object({
  url: z.string().url(),
  output_path: z.string().min(1),
  viewport: viewportSchema.optional(),
  steps: z.array(stepSchema).default([]),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
  source_url: z.string().url(),
});

type Viewport = z.infer<typeof viewportSchema>;
type RecordingStep = z.infer<typeof stepSchema>;
type PlaywrightRecordingInput = z.infer<typeof inputSchema>;
type PlaywrightRecordingOutput = z.infer<typeof outputSchema>;

type PlaywrightContextOptions = {
  viewport?: Viewport;
  recordVideo: {
    dir: string;
    size?: Viewport;
  };
};

type NormalizedRecordingStep =
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; value: string }
  | { action: "wait"; selector: string }
  | { action: "wait"; ms: number };

type PlaywrightVideo = {
  path(): Promise<string>;
};

type PlaywrightPage = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string): Promise<unknown>;
  type(selector: string, text: string): Promise<unknown>;
  waitForSelector(selector: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<unknown>;
  video(): PlaywrightVideo | null;
};

type PlaywrightContext = {
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
};

type PlaywrightBrowser = {
  newContext(options: PlaywrightContextOptions): Promise<PlaywrightContext>;
  close(): Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    launch(): Promise<PlaywrightBrowser>;
  };
};

export function buildPlaywrightContextOptions(videoDir: string, viewport?: Viewport): PlaywrightContextOptions {
  if (viewport === undefined) {
    return { recordVideo: { dir: videoDir } };
  }

  return {
    viewport,
    recordVideo: {
      dir: videoDir,
      size: viewport,
    },
  };
}

export function normalizeRecordingStep(step: RecordingStep): NormalizedRecordingStep {
  if (step.action === "click") {
    if (step.selector === undefined) {
      throw new Error("playwright_recording click step requires selector");
    }

    return { action: "click", selector: step.selector };
  }

  if (step.action === "type") {
    if (step.selector === undefined) {
      throw new Error("playwright_recording type step requires selector");
    }
    if (step.value === undefined) {
      throw new Error("playwright_recording type step requires value");
    }

    return { action: "type", selector: step.selector, value: step.value };
  }

  if (step.ms !== undefined) {
    return { action: "wait", ms: step.ms };
  }
  if (step.selector !== undefined) {
    return { action: "wait", selector: step.selector };
  }

  throw new Error("playwright_recording wait step requires ms or selector");
}

async function importPlaywright(): Promise<PlaywrightModule> {
  const loaded = (await import(PLAYWRIGHT_PACKAGE)) as PlaywrightModule;
  return loaded;
}

async function runRecordingStep(page: PlaywrightPage, step: RecordingStep): Promise<void> {
  const normalized = normalizeRecordingStep(step);

  if (normalized.action === "click") {
    await page.click(normalized.selector);
    return;
  }

  if (normalized.action === "type") {
    await page.type(normalized.selector, normalized.value);
    return;
  }

  if ("ms" in normalized) {
    await page.waitForTimeout(normalized.ms);
    return;
  }

  await page.waitForSelector(normalized.selector);
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
    throw new Error(`playwright did not produce a recording in ${dir}`);
  }

  return newest.path;
}

const playwrightRecording = defineTool({
  name: "playwright_recording",
  capability: "screen_capture",
  provider: "playwright",
  status: "beta",
  integration: {
    kind: "library",
    package: PLAYWRIGHT_PACKAGE,
    install: INSTALL,
  },
  best_for: "deterministic browser flow recordings from fixture pages and source URLs",
  supports: ["browser-flow-recording", "fixture-page-capture", "playwright-video"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => {
    try {
      await importPlaywright();
      return { available: true };
    } catch {
      return { available: false, reason: "playwright not installed", fix: "install" };
    }
  },
  async execute(params: PlaywrightRecordingInput, ctx): Promise<PlaywrightRecordingOutput> {
    const input = inputSchema.parse(params);
    const outputPath = resolveProjectPath(input.output_path, ctx.projectRoot);
    const recordingDir = await mkdtemp(join(tmpdir(), "show-sidekick-playwright-"));
    await mkdir(dirname(outputPath), { recursive: true });

    const startedAt = Date.now();
    const playwright = await importPlaywright();
    let browser: PlaywrightBrowser | undefined;

    try {
      try {
        browser = await playwright.chromium.launch();
      } catch (error) {
        throw errorWithInstallHint(error, INSTALL);
      }
      const context = await browser.newContext(buildPlaywrightContextOptions(recordingDir, input.viewport));
      const page = await context.newPage();

      await page.goto(input.url, { waitUntil: "load" });
      for (const step of input.steps) {
        await runRecordingStep(page, step);
      }

      const video = page.video();
      await context.close();
      const recordedPath = video === null ? await newestFile(recordingDir) : await video.path();
      await rm(outputPath, { force: true });
      await rename(recordedPath, outputPath);

      return outputSchema.parse({
        video_path: outputPath,
        duration_s: Math.max(0, (Date.now() - startedAt) / 1000),
        source_url: input.url,
      });
    } finally {
      try {
        await browser?.close();
      } finally {
        await rm(recordingDir, { recursive: true, force: true });
      }
    }
  },
});

export default playwrightRecording;
