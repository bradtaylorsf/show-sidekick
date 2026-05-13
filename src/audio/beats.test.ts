import { z } from "zod";
import { describe, expect, it } from "vitest";
import { defineTool, Registry, type Tool } from "../registry/index.js";
import { detectBeats } from "./beats.js";
import type { AudioTrack, Beat } from "./types.js";

type BeatToolInput = {
  audio_path: string;
  expect_bpm?: [number, number];
  time_signature?: [number, number];
};

type BeatToolOutput = {
  bpm: number;
  beats: Beat[];
};

const beatInput = z.object({
  audio_path: z.string(),
  expect_bpm: z.tuple([z.number(), z.number()]).optional(),
  time_signature: z.tuple([z.number(), z.number()]).optional(),
});

const beatOutput = z.object({
  bpm: z.number(),
  beats: z.array(
    z.object({
      time_s: z.number(),
      strength: z.number(),
      is_downbeat: z.boolean(),
    }),
  ),
});

describe("detectBeats", () => {
  it("selects a beats-capable tool and forwards the expected BPM range", async () => {
    const calls: BeatToolInput[] = [];
    const registry = new Registry({
      tools: [beatTool(calls, { bpm: 120, beats: beats(8) })],
    });

    const result = await detectBeats(track(), { registry, expect_bpm: [118, 122] });

    expect(calls).toEqual([{ audio_path: "/tmp/audio.wav", expect_bpm: [118, 122] }]);
    expect(result.bpm).toBe(120);
    expect(result.beats).toHaveLength(8);
  });

  it("preserves every 4-beat downbeat grid returned by the backend", async () => {
    const registry = new Registry({
      tools: [beatTool([], { bpm: 120, beats: beats(9) })],
    });

    const result = await detectBeats(track(), { registry });

    expect(result.beats.map((beat) => beat.is_downbeat)).toEqual([true, false, false, false, true, false, false, false, true]);
  });

  it("forwards known time signatures so backends can override the downbeat cadence", async () => {
    const calls: BeatToolInput[] = [];
    const registry = new Registry({
      tools: [beatTool(calls, { bpm: 90, beats: beats(7, 3) })],
    });

    const result = await detectBeats(track(), { registry, time_signature: [3, 4] });

    expect(calls).toEqual([{ audio_path: "/tmp/audio.wav", time_signature: [3, 4] }]);
    expect(result.beats.map((beat) => beat.is_downbeat)).toEqual([true, false, false, true, false, false, true]);
  });
});

function track(): AudioTrack {
  return {
    path: "/tmp/audio.wav",
    duration_s: 4,
    sample_rate: 44_100,
    channels: 1,
  };
}

function beats(count: number, downbeatEvery = 4): Beat[] {
  return Array.from({ length: count }, (_value, index) => ({
    time_s: index * 0.5,
    strength: 1,
    is_downbeat: index % downbeatEvery === 0,
  }));
}

function beatTool(calls: BeatToolInput[], response: BeatToolOutput): Tool<BeatToolInput, BeatToolOutput> {
  return defineTool({
    name: "test-beats",
    capability: "beats",
    provider: "test",
    status: "production",
    integration: { kind: "binary", binary: "test-beats", install: "install test-beats" },
    best_for: "test beat detection",
    input: beatInput,
    output: beatOutput,
    async isAvailable() {
      return { available: true };
    },
    async execute(params) {
      calls.push(params);
      return response;
    },
  });
}
