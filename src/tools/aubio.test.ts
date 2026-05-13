import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import tool, { buildAubioBeatGrid, parseAubioBeatOutput, parseAubioTempoOutput, selectAubioBpm } from "./aubio.js";

const hasAubio = hasBinary("aubio");
const hasFfmpeg = hasBinary("ffmpeg");
let scratchDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  scratchDirs = [];
});

describe("aubio tool", () => {
  it("registers aubio as a binary integration", () => {
    expect(tool.name).toBe("aubio");
    expect(tool.capability).toBe("beats");
    expect(tool.integration).toMatchObject({
      kind: "binary",
      binary: "aubio",
    });
  });

  it("reports unavailable with install guidance when aubio is missing from PATH", async () => {
    stubMissingBinaryPath();

    await expect(tool.isAvailable()).resolves.toEqual({
      available: false,
      reason: "binary not on PATH: aubio",
      fix: "install",
    });
  });

  it("returns a stable availability shape with the current PATH", async () => {
    const availability = await tool.isAvailable();

    if (availability.available) {
      expect(availability).toEqual({ available: true });
    } else {
      expect(availability).toEqual({
        available: false,
        reason: "binary not on PATH: aubio",
        fix: "install",
      });
    }
  });

  it("parses tempo candidates and selects the expected BPM range", () => {
    const candidates = parseAubioTempoOutput("119.9\n240.0 bpm\n62.5\n");

    expect(candidates).toEqual([119.9, 240, 62.5]);
    expect(selectAubioBpm(candidates, [100, 140])).toBe(119.9);
    expect(selectAubioBpm(candidates, [230, 250])).toBe(240);
  });

  it("parses beats and marks every 4-beat group downbeat", () => {
    const beats = buildAubioBeatGrid(parseAubioBeatOutput("0.000\n0.500\n1.000\n1.500\n2.000\n2.500\n"));

    expect(beats.map((beat) => beat.time_s)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(beats.map((beat) => beat.is_downbeat)).toEqual([true, false, false, false, true, false]);
    expect(beats.every((beat) => beat.strength >= 0 && beat.strength <= 1)).toBe(true);
  });

  it.skipIf(!hasAubio || !hasFfmpeg)("detects a 120 BPM click fixture within tolerance", async () => {
    const dir = mkdtempSync(join(tmpdir(), "predit-aubio-fixture-"));
    scratchDirs.push(dir);
    const audioPath = join(dir, "click-120.mp3");
    generateClickTrack(audioPath);

    const result = await tool.execute({ audio_path: audioPath, expect_bpm: [118, 122] }, logger());
    const expectedBeatCount = (result.bpm * 8) / 60;

    expect(result.bpm).toBeGreaterThanOrEqual(118);
    expect(result.bpm).toBeLessThanOrEqual(122);
    expect(result.beats.length).toBeGreaterThanOrEqual(Math.floor(expectedBeatCount) - 1);
    expect(result.beats.length).toBeLessThanOrEqual(Math.ceil(expectedBeatCount) + 1);
  });
});

function stubMissingBinaryPath(): void {
  const dir = mkdtempSync(join(tmpdir(), "predit-tool-missing-"));
  const which = join(dir, "which");
  writeFileSync(which, "#!/bin/sh\nexit 1\n");
  chmodSync(which, 0o755);
  vi.stubEnv("PATH", dir);
}

function hasBinary(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function generateClickTrack(outputPath: string): void {
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
      "aevalsrc=if(lt(mod(t\\,0.5)\\,0.03)\\,0.9*sin(2*PI*1000*t)\\,0):d=8:s=44100",
      "-ac",
      "1",
      "-ar",
      "44100",
      "-b:a",
      "64k",
      outputPath,
    ],
    { stdio: "ignore" },
  );
}

function logger() {
  return {
    projectRoot: process.cwd(),
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      event() {},
    },
  };
}
