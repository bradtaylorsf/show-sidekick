import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cuesheet } from "../artifacts/cuesheet.js";
import type { AudioTrack, ClimaxPoint, Section, Segment } from "./types.js";

vi.mock("./load.js", () => ({ load: vi.fn() }));
vi.mock("./transcribe.js", () => ({ transcribe: vi.fn() }));
vi.mock("./sections.js", () => ({ detectSections: vi.fn() }));
vi.mock("./beats.js", () => ({ detectBeats: vi.fn() }));
vi.mock("./climax.js", () => ({ detectClimax: vi.fn() }));
vi.mock("./energy.js", () => ({ probeEnergy: vi.fn() }));

import { detectBeats } from "./beats.js";
import { buildCuesheet } from "./cuesheet.js";
import { detectClimax } from "./climax.js";
import { probeEnergy } from "./energy.js";
import { load } from "./load.js";
import { detectSections } from "./sections.js";
import { transcribe } from "./transcribe.js";

afterEach(() => {
  vi.resetAllMocks();
});

describe("buildCuesheet", () => {
  it("runs every primitive using one loaded AudioTrack", async () => {
    vi.mocked(load).mockResolvedValue(track());
    vi.mocked(transcribe).mockResolvedValue({ segments: segments(), average_confidence: 0.99, low_confidence: false });
    vi.mocked(probeEnergy).mockResolvedValue(windows());
    vi.mocked(detectSections).mockResolvedValue(sections());
    vi.mocked(detectBeats).mockResolvedValue({ bpm: 120, beats: [{ time_s: 0, strength: 1, is_downbeat: true }] });
    vi.mocked(detectClimax).mockResolvedValue([{ time_s: 2, type: "peak", intensity: 1, source: "algorithm" }]);

    const cuesheet = await buildCuesheet("/tmp/audio.wav", { projectRoot: "/project" });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("/tmp/audio.wav");
    expect(transcribe).toHaveBeenCalledWith(track(), expect.objectContaining({ projectRoot: "/project" }));
    expect(probeEnergy).toHaveBeenCalledTimes(1);
    expect(detectSections).toHaveBeenCalledWith(track(), expect.objectContaining({ transcript_hint: segments(), windows: windows() }));
    expect(detectBeats).toHaveBeenCalledWith(track(), expect.objectContaining({ projectRoot: "/project" }));
    expect(detectClimax).toHaveBeenCalledWith(track(), expect.objectContaining({ sections: sections(), manual: [], windows: windows() }));
    expect(cuesheet).toMatchObject({
      audio: track(),
      master_clock: "audio",
      bpm: 120,
      transcription_confidence: { average: 0.99, low_confidence: false },
      sections: sections(),
      beats: [{ time_s: 0, strength: 1, is_downbeat: true }],
    });
  });

  it("preserves non-algorithmic climax points from an existing cuesheet", async () => {
    const manual: ClimaxPoint = { time_s: 4, type: "arrival", intensity: 0.9, source: "manual" };
    const agent: ClimaxPoint = { time_s: 6, type: "release", intensity: 0.7, source: "agent" };
    vi.mocked(load).mockResolvedValue(track());
    vi.mocked(transcribe).mockResolvedValue({ segments: segments(), average_confidence: 0.99, low_confidence: false });
    vi.mocked(probeEnergy).mockResolvedValue(windows());
    vi.mocked(detectSections).mockResolvedValue(sections());
    vi.mocked(detectBeats).mockResolvedValue({ bpm: 120, beats: [] });
    vi.mocked(detectClimax).mockImplementation(async (_track, options) => [
      { time_s: 2, type: "peak", intensity: 1, source: "algorithm" },
      ...(options.manual ?? []),
    ]);

    const cuesheet = await buildCuesheet("/tmp/audio.wav", {
      existing: {
        ...baseCuesheet(),
        climax: [{ time_s: 1, type: "peak", intensity: 1, source: "algorithm" }, manual, agent],
      },
    });

    expect(cuesheet.climax).toEqual([{ time_s: 2, type: "peak", intensity: 1, source: "algorithm" }, manual, agent]);
  });
});

function track(): AudioTrack {
  return {
    path: "/tmp/audio.wav",
    duration_s: 8,
    sample_rate: 44_100,
    channels: 1,
  };
}

function segments(): Segment[] {
  return [
    {
      start_s: 0,
      end_s: 1,
      text: "hello",
      words: [{ text: "hello", start_s: 0, end_s: 0.8, confidence: 0.99 }],
    },
  ];
}

function sections(): Section[] {
  return [{ label: "chorus", start_s: 0, end_s: 8, kind: "vocal", energy: 1 }];
}

function windows() {
  return [{ start_s: 0, end_s: 8, rms: 0.5, lufs: -6 }];
}

function baseCuesheet(): Cuesheet {
  return {
    audio: track(),
    master_clock: "audio",
    bpm: 120,
    segments: segments(),
    sections: sections(),
    beats: [],
    climax: [],
    scene_anchors: [],
  };
}
