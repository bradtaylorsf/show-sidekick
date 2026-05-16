import { afterEach, describe, expect, it, vi } from "vitest";
import scribe, { normalizeScribeResponse } from "./elevenlabs-scribe.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("elevenlabs-scribe", () => {
  it("reports availability from ELEVENLABS_API_KEY", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    await expect(scribe.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: ELEVENLABS_API_KEY",
      fix: "env",
    });

    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    await expect(scribe.isAvailable()).resolves.toEqual({ available: true });
  });

  it("normalizes root-level Scribe words into word-level segments", () => {
    const result = normalizeScribeResponse({
      text: "Hello world. Sing again",
      words: [
        { text: "Hello", start: 0, end: 0.4, confidence: 0.95, type: "word" },
        { word: "world.", start: 0.5, end: 1.1, logprob: Math.log(0.8), type: "word" },
        { text: "Sing", start: 2.2, end: 2.6, probability: 0.7, type: "word" },
        { text: "again", start: 2.7, end: 3.4, score: 1.2, type: "word" },
      ],
    });

    expect(result.segments).toEqual([
      {
        start_s: 0,
        end_s: 1.1,
        text: "Hello world.",
        words: [
          { text: "Hello", start_s: 0, end_s: 0.4, confidence: 0.95 },
          { text: "world.", start_s: 0.5, end_s: 1.1, confidence: 0.8 },
        ],
      },
      {
        start_s: 2.2,
        end_s: 3.4,
        text: "Sing again",
        words: [
          { text: "Sing", start_s: 2.2, end_s: 2.6, confidence: 0.7 },
          { text: "again", start_s: 2.7, end_s: 3.4, confidence: 1 },
        ],
      },
    ]);
  });

  it("uses explicit Scribe segments when present", () => {
    const result = normalizeScribeResponse({
      segments: [
        {
          text: "Held note",
          start: 4,
          end: 5.5,
          words: [{ text: "Held", start: 4, end: 4.6 }, { text: "note", start: 4.7, end: 5.5 }],
        },
      ],
    });

    expect(result.segments).toEqual([
      {
        start_s: 4,
        end_s: 5.5,
        text: "Held note",
        words: [
          { text: "Held", start_s: 4, end_s: 4.6, confidence: 1 },
          { text: "note", start_s: 4.7, end_s: 5.5, confidence: 1 },
        ],
      },
    ]);
  });
});
