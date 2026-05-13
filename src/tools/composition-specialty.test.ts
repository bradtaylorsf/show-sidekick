import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ffprobe } from "../audio/ffprobe.js";
import greenScreenComposite from "./green-screen-composite.js";
import greenScreenProcessor from "./green-screen-processor.js";
import showcaseCard from "./showcase-card.js";
import videoStitch from "./video-stitch.js";
import videoTrimmer from "./video-trimmer.js";

const hasFfmpeg = hasBinary("ffmpeg") && hasBinary("ffprobe");
const hasDrawtext = hasFfmpeg && hasFfmpegFilter("drawtext");
let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("composition specialty tools", () => {
  describe("video_stitch", () => {
    it.skipIf(!hasFfmpeg)("stitches clips with a crossfade transition", async () => {
      const dir = await tempDir();
      const first = join(dir, "first.mp4");
      const second = join(dir, "second.mp4");
      const output = join(dir, "stitched.mp4");
      synthesizeVideo(first, 1);
      synthesizeVideo(second, 1);

      const result = await videoStitch.execute(
        {
          inputs: [first, second],
          output,
          transition: { kind: "crossfade", duration_s: 0.25 },
        },
        testContext(dir),
      );

      expect(result.output_path).toBe(output);
      expect(result.clip_count).toBe(2);
      expect(result.transitions_applied).toBe(1);
      expect(existsSync(output)).toBe(true);

      const probe = await ffprobe(output);
      expect(probe.format.duration_s).toBeGreaterThanOrEqual(1.5);
      expect(probe.format.duration_s).toBeLessThanOrEqual(2);
    });
  });

  describe("video_trimmer", () => {
    it.skipIf(!hasFfmpeg)("reports trim drift within one requested frame", async () => {
      const dir = await tempDir();
      const input = join(dir, "input.mp4");
      const output = join(dir, "trimmed.mp4");
      synthesizeVideo(input, 2);

      const result = await videoTrimmer.execute(
        {
          input,
          output,
          start_s: 0.2,
          end_s: 1.2,
          fps: 15,
        },
        testContext(dir),
      );

      expect(result.output_path).toBe(output);
      expect(existsSync(output)).toBe(true);
      expect(result.within_tolerance).toBe(true);
      expect(result.drift_frames).toBeLessThanOrEqual(1);
    });
  });

  describe("showcase_card", () => {
    it.skipIf(!hasDrawtext)("renders a card from logo, headline, and product-shot fixtures", async () => {
      const dir = await tempDir();
      const logo = join(dir, "logo.png");
      const product = join(dir, "product.png");
      const output = join(dir, "card.png");
      synthesizeImage(logo, "red", "32x32");
      synthesizeImage(product, "yellow", "80x80");

      const result = await showcaseCard.execute(
        {
          output,
          canvas: { width: 320, height: 180, background_color: "#102030" },
          logo: { path: logo, x: 16, y: 16, width: 32 },
          headline: {
            text: "Launch Ready",
            font_size: 24,
            color: "#ffffff",
            x: 16,
            y: 70,
            max_width: 180,
          },
          product_shot: { path: product, x: 220, y: 50, width: 64, height: 64 },
        },
        testContext(dir),
      );

      expect(result.output_path).toBe(output);
      expect(existsSync(output)).toBe(true);

      const probe = await ffprobe(output);
      const stream = probe.streams.find((candidate) => candidate.codec_type === "video");
      expect(stream).toMatchObject({ width: 320, height: 180 });
    });
  });

  describe("green_screen_composite", () => {
    it.skipIf(!hasFfmpeg)("composites a green-screen foreground over a background clip", async () => {
      const dir = await tempDir();
      const foreground = join(dir, "foreground.mp4");
      const background = join(dir, "background.mp4");
      const output = join(dir, "composited.mp4");
      synthesizeGreenScreen(foreground, 1);
      synthesizeSolidVideo(background, "blue", 1);

      const result = await greenScreenComposite.execute(
        {
          foreground,
          background,
          output,
          similarity: 0.35,
          blend: 0.05,
        },
        testContext(dir),
      );

      expect(result.output_path).toBe(output);
      expect(existsSync(output)).toBe(true);

      const probe = await ffprobe(output);
      const stream = probe.streams.find((candidate) => candidate.codec_type === "video");
      expect(stream).toMatchObject({ width: 160, height: 90 });
    });
  });

  describe("green_screen_processor", () => {
    it.skipIf(!hasFfmpeg)("extracts an alpha matte from green-screen footage", async () => {
      const dir = await tempDir();
      const input = join(dir, "green.mp4");
      const output = join(dir, "matte.mov");
      synthesizeGreenScreen(input, 1);

      const result = await greenScreenProcessor.execute(
        {
          input,
          output,
          similarity: 0.35,
          blend: 0.05,
          alpha_quality: "high",
        },
        testContext(dir),
      );

      expect(result.output_path).toBe(output);
      expect(existsSync(output)).toBe(true);
      expect(probePixFmt(output)).toContain("yuva");
    });
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "predit-composition-specialty-test-"));
  tempDirs.push(dir);
  return dir;
}

function synthesizeVideo(output: string, durationS: number): void {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `testsrc2=size=160x90:rate=15:duration=${durationS}`,
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${durationS}`,
      "-shortest",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-g",
      "1",
      "-c:a",
      "aac",
      output,
    ],
    { stdio: "pipe" },
  );

  expect(existsSync(output)).toBe(true);
}

function synthesizeSolidVideo(output: string, color: string, durationS: number): void {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=160x90:r=15:d=${durationS}`,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      output,
    ],
    { stdio: "pipe" },
  );

  expect(existsSync(output)).toBe(true);
}

function synthesizeGreenScreen(output: string, durationS: number): void {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `color=c=green:s=160x90:r=15:d=${durationS}`,
      "-vf",
      "drawbox=x=56:y=25:w=48:h=40:color=red:t=fill",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      output,
    ],
    { stdio: "pipe" },
  );

  expect(existsSync(output)).toBe(true);
}

function synthesizeImage(output: string, color: string, size: string): void {
  execFileSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${color}:s=${size}`, "-frames:v", "1", output],
    { stdio: "pipe" },
  );

  expect(existsSync(output)).toBe(true);
}

function probePixFmt(path: string): string {
  return execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=pix_fmt", "-of", "default=nw=1:nk=1", path],
    { encoding: "utf8" },
  ).trim();
}

function hasBinary(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasFfmpegFilter(filterName: string): boolean {
  try {
    const filters = execFileSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
    return filters.includes(` ${filterName} `);
  } catch {
    return false;
  }
}

function testContext(projectRoot: string) {
  return {
    projectRoot,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
