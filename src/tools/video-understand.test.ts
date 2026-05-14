import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoToolAvailable } from "../registry/index.js";
import { transcribe } from "../audio/transcribe.js";
import frameSampler from "./frame-sampler.js";
import videoUnderstand, { inferUnderstandingDuration, summarizeUnderstanding } from "./video-understand.js";

vi.mock("./frame-sampler.js", () => ({
  default: {
    isAvailable: vi.fn(async () => ({ available: true })),
    execute: vi.fn(async () => ({
      frames: [
        { index: 0, time_s: 0.5, path: "/tmp/frame_0000.png" },
        { index: 1, time_s: 1.5, path: "/tmp/frame_0001.png" },
      ],
    })),
  },
}));

vi.mock("../audio/transcribe.js", () => ({
  transcribe: vi.fn(async () => ({
    segments: [{ text: "fixture narration", start_s: 0, end_s: 1.8, words: [] }],
    average_confidence: 0.98,
    low_confidence: false,
  })),
}));

function logger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

describe("video_understand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the video understanding capability", () => {
    expect(videoUnderstand.name).toBe("video_understand");
    expect(videoUnderstand.capability).toBe("video_understanding");
    expect(videoUnderstand.integration).toMatchObject({ kind: "library", package: "predit" });
  });

  it("parses inputs and fixture-like outputs", () => {
    expect(videoUnderstand.input.parse({ path: "fixture.mp4" }).frame_count).toBe(6);

    expect(
      videoUnderstand.output.parse({
        summary: "Sampled 2 frames. Transcript: hello world",
        frames: [
          { index: 0, time_s: 0.5, path: "/tmp/frame_0000.png" },
          { index: 1, time_s: 1.5, path: "/tmp/frame_0001.png" },
        ],
        transcript_segments: [{ text: "hello world", start_s: 0, end_s: 1.8 }],
        duration_s: 1.8,
      }).summary,
    ).toContain("Transcript");
  });

  it("summarizes sampled frames and transcript segments", () => {
    const frames = [
      { index: 0, time_s: 0.5, path: "/tmp/frame_0000.png" },
      { index: 1, time_s: 2.5, path: "/tmp/frame_0001.png" },
    ];
    const transcriptSegments = [{ text: "A host introduces the clip.", start_s: 0, end_s: 2.8 }];

    expect(summarizeUnderstanding(frames, transcriptSegments)).toContain("A host introduces the clip.");
    expect(inferUnderstandingDuration(frames, transcriptSegments)).toBe(2.8);
  });

  it("uses transcription output in the content summary", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-video-understand-"));
    const registry = { select: vi.fn() };
    const result = await videoUnderstand.execute(videoUnderstand.input.parse({ path: "fixture.mp4" }), {
      projectRoot,
      logger: logger(),
      registry,
    });

    expect(frameSampler.execute).toHaveBeenCalledWith(
      expect.objectContaining({ path: join(projectRoot, "fixture.mp4"), count: 6, mode: "uniform" }),
      expect.any(Object),
    );
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({ path: join(projectRoot, "fixture.mp4") }),
      expect.objectContaining({ registry, projectRoot }),
    );
    expect(result.transcript_segments).toEqual([{ text: "fixture narration", start_s: 0, end_s: 1.8 }]);
    expect(result.summary).toContain("fixture narration");
  });

  it("keeps frame understanding available when transcription providers are unavailable", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-video-understand-"));
    vi.mocked(transcribe).mockRejectedValueOnce(new NoToolAvailable("transcribe", []));

    const result = await videoUnderstand.execute(videoUnderstand.input.parse({ path: "fixture.mp4" }), {
      projectRoot,
      logger: logger(),
      registry: { select: vi.fn() },
    });

    expect(result.transcript_segments).toEqual([]);
    expect(result.summary).toContain("No transcript segments were available.");
  });
});
