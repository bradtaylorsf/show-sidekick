import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RenderReportSchema } from "../artifacts/render-report.js";
import { ffprobe } from "../audio/ffprobe.js";
import ffmpeg from "./ffmpeg.js";

const hasFfmpeg = hasBinary("ffmpeg") && hasBinary("ffprobe");
let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("ffmpeg tool", () => {
  it("rejects payloads that do not match an ffmpeg operation", async () => {
    await expect(
      ffmpeg.execute(
        {
          asset_manifest: { assets: [] },
          edit_decisions: { cuts: [], render_runtime: "remotion" },
          output_path: "renders/should-not-succeed.mp4",
        } as never,
        testContext(),
      ),
    ).rejects.toThrow(/operation|Invalid discriminator/u);
  });

  it.skipIf(!hasFfmpeg)("trims a fixture and leaves a probeable output", async () => {
    const dir = await tempDir();
    const input = join(dir, "input.mp4");
    const output = join(dir, "trimmed.mp4");
    synthesizeVideo(input, 2);

    const result = await ffmpeg.execute(
      {
        operation: "trim",
        input,
        output,
        start_s: 0.2,
        end_s: 1.2,
      },
      testContext(),
    );

    expect(result.output_path).toBe(output);
    expect(existsSync(output)).toBe(true);

    const probe = await ffprobe(output);
    expect(probe.format.duration_s).toBeGreaterThanOrEqual(0.8);
    expect(probe.format.duration_s).toBeLessThanOrEqual(1.4);
  });

  it.skipIf(!hasFfmpeg)("concatenates smoke fixtures and leaves a probeable output", async () => {
    const dir = await tempDir();
    const first = join(dir, "first.mp4");
    const second = join(dir, "second.mp4");
    const output = join(dir, "concat.mp4");
    synthesizeVideo(first, 1);
    synthesizeVideo(second, 1);

    const result = await ffmpeg.execute(
      {
        operation: "concat",
        inputs: [first, second],
        output,
      },
      testContext(),
    );

    expect(result.output_path).toBe(output);
    expect(existsSync(output)).toBe(true);

    const probe = await ffprobe(output);
    expect(probe.format.duration_s).toBeGreaterThanOrEqual(1.8);
    expect(probe.format.duration_s).toBeLessThanOrEqual(2.3);
  });

  it.skipIf(!hasFfmpeg)("pads short compose clips and maps an external audio track", async () => {
    const dir = await tempDir();
    const video = join(dir, "silent-video.mp4");
    const audio = join(dir, "narration.m4a");
    const output = join(dir, "composed.mp4");
    synthesizeSilentVideo(video, 1);
    synthesizeAudio(audio, 2);

    const result = await ffmpeg.execute(
      {
        operation: "compose",
        asset_manifest: {
          assets: [{ id: "clip", kind: "video", path: video }],
        },
        edit_decisions: {
          cuts: [{ start_s: 0, end_s: 2, asset_id: "clip" }],
          overlays: [],
          audio: {
            music: {
              track_path: audio,
            },
          },
          render_runtime: "ffmpeg",
          renderer_family: "animation-first",
        },
        output_path: output,
      },
      testContext(dir),
    );

    const report = RenderReportSchema.parse(result);

    expect(report.output_path).toBe(output);
    expect(report.expected_duration_s).toBe(2);
    expect(report.clip_trims?.[0]).toMatchObject({
      asset_id: "clip",
      requested_duration_s: 2,
      actual_duration_s: 2,
      drift_s: 0,
      drift_frames: 0,
      within_tolerance: true,
    });
    expect(report.drift_frames).toBeLessThanOrEqual(1);
    expect(report.within_tolerance).toBe(true);
    expect(report.validation_steps).toContainEqual(
      expect.objectContaining({
        name: "render_drift",
        status: "pass",
      }),
    );
    expect(existsSync(output)).toBe(true);

    const probe = await ffprobe(output);
    expect(probe.format.duration_s).toBeGreaterThanOrEqual(1.8);
    expect(probe.format.duration_s).toBeLessThanOrEqual(2.3);
    expect(probe.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "predit-ffmpeg-test-"));
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

function synthesizeSilentVideo(output: string, durationS: number): void {
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
      "-c:v",
      "mpeg4",
      "-g",
      "1",
      "-q:v",
      "5",
      output,
    ],
    { stdio: "pipe" },
  );

  expect(existsSync(output)).toBe(true);
}

function synthesizeAudio(output: string, durationS: number): void {
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
      `sine=frequency=880:duration=${durationS}`,
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

function testContext(projectRoot: string = tmpdir()) {
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
