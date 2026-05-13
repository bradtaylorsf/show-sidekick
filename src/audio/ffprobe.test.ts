import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ffprobe } from "./ffprobe.js";

const hasFfmpeg = hasBinary("ffmpeg") && hasBinary("ffprobe");
let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("ffprobe", () => {
  it.skipIf(!hasFfmpeg)("parses media duration and streams from ffprobe JSON", async () => {
    const dir = await tempDir();
    const input = join(dir, "probe-fixture.mp4");

    synthesizeVideo(input, 2);

    const result = await ffprobe(input);

    expect(result.format.duration_s).toBeGreaterThanOrEqual(1.9);
    expect(result.format.duration_s).toBeLessThanOrEqual(2.2);
    expect(result.streams.length).toBeGreaterThan(0);
    expect(result.streams.some((stream) => stream.codec_type === "video")).toBe(true);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "predit-ffprobe-test-"));
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
      "mpeg4",
      "-g",
      "1",
      "-q:v",
      "5",
      "-c:a",
      "aac",
      output,
    ],
    { stdio: "pipe" },
  );

  expect(existsSync(output)).toBe(true);
}

function hasBinary(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
