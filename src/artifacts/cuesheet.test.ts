import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CuesheetSchema, cuesheetPath, readCuesheet, writeCuesheet, type Cuesheet } from "./cuesheet.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("CuesheetSchema", () => {
  it("round-trips a valid cuesheet artifact", () => {
    const parsed = CuesheetSchema.parse(cuesheet());

    expect(parsed.audio.duration_s).toBe(12);
    expect(parsed.climax[0]?.source).toBe("manual");
  });

  it("writes atomically and reads back validated JSON", async () => {
    const root = await scratchProject();
    const outputPath = await writeCuesheet(root, "show", "episode", cuesheet());
    const readBack = await readCuesheet(root, "show", "episode");

    expect(outputPath).toBe(cuesheetPath(root, "show", "episode"));
    expect(readBack).toEqual(cuesheet());
  });

  it("rejects invalid cuesheet JSON on read", async () => {
    const root = await scratchProject();
    const filePath = cuesheetPath(root, "show", "episode");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{ nope", "utf8");

    await expect(readCuesheet(root, "show", "episode")).rejects.toThrow("Config error");
  });

  it("rejects unsafe show or episode path segments", () => {
    expect(() => cuesheetPath("/project", "../show", "episode")).toThrow("invalid show path segment");
    expect(() => cuesheetPath("/project", "show", "../episode")).toThrow("invalid episode path segment");
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-cuesheet-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

function cuesheet(): Cuesheet {
  return {
    audio: {
      path: "/tmp/audio.wav",
      duration_s: 12,
      sample_rate: 44_100,
      channels: 2,
    },
    master_clock: "audio",
    bpm: 120,
    transcription_confidence: { average: 0.99, low_confidence: false },
    segments: [
      {
        start_s: 0,
        end_s: 1,
        text: "hello",
        words: [{ text: "hello", start_s: 0, end_s: 0.8, confidence: 0.99 }],
      },
    ],
    sections: [{ label: "chorus", start_s: 0, end_s: 12, kind: "vocal", energy: 1 }],
    beats: [{ time_s: 0, strength: 1, is_downbeat: true }],
    climax: [{ time_s: 8, type: "peak", intensity: 1, source: "manual" }],
    scene_anchors: [
      {
        scene_id: "hero",
        start_s: 8,
        end_s: 12,
        snapped_to: "climax",
        source: { climax_index: 0 },
      },
    ],
  };
}
