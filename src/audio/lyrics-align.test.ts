import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LyricsAlignedSchema } from "../artifacts/lyrics-aligned.js";
import { alignLyrics, applyManualCorrections, canonicalLyricsFromEpisodeInputs } from "./lyrics-align.js";
import type { Segment } from "./types.js";

const lyricsPath = fileURLToPath(new URL("./__fixtures__/lyrics-align-lyrics.txt", import.meta.url));
const transcriptPath = fileURLToPath(new URL("./__fixtures__/lyrics-align-transcript.json", import.meta.url));

describe("alignLyrics", () => {
  it("emits stable lyric phrase windows that validate against the artifact schema", async () => {
    const aligned = alignLyrics(await readFile(lyricsPath, "utf8"), await transcript(), { gap_close_s: 0.1 });

    expect(LyricsAlignedSchema.parse(aligned)).toEqual(aligned);
    expect(aligned).toEqual({
      source: "transcript_words",
      lines: [
        {
          id: "line-1",
          text: "We open on the downbeat",
          confidence: 1,
          matched_word_ids: ["w-1", "w-2", "w-3", "w-4", "w-5"],
          start_s: 0,
          end_s: 1.48,
          start_ms: 0,
          end_ms: 1480,
          source: "gap_filled",
          flagged: false,
        },
        {
          id: "line-2",
          text: "Then cut where the chorus lands",
          confidence: 1,
          matched_word_ids: ["w-6", "w-7", "w-8", "w-9", "w-10", "w-11"],
          start_s: 1.48,
          end_s: 3.1,
          start_ms: 1480,
          end_ms: 3100,
          source: "aligned",
          flagged: false,
        },
      ],
    });
  });

  it("flags low-confidence and unmatched lines", async () => {
    const aligned = alignLyrics("We open on missing downbeat\nCompletely absent line", await transcript(), {
      min_confidence: 0.8,
    });

    expect(aligned.lines[0]).toMatchObject({
      text: "We open on missing downbeat",
      confidence: 0.6,
      matched_word_ids: ["w-1", "w-2", "w-3"],
      source: "aligned",
      flagged: true,
    });
    expect(aligned.lines[1]).toMatchObject({
      text: "Completely absent line",
      confidence: 0,
      matched_word_ids: [],
      start_s: null,
      end_s: null,
      source: "unmatched",
      flagged: true,
    });
  });

  it("applies manual timing corrections without losing word provenance", async () => {
    const aligned = alignLyrics(await readFile(lyricsPath, "utf8"), await transcript(), { gap_close_s: 0.1 });
    const corrected = applyManualCorrections(aligned, {
      overrides: [
        {
          line_id: "line-2",
          start_ms: 1520,
          end_ms: 2980,
          note: "tightened after listening pass",
        },
      ],
    });

    expect(corrected.source).toBe("mixed");
    expect(corrected.lines[1]).toEqual({
      id: "line-2",
      text: "Then cut where the chorus lands",
      confidence: 1,
      matched_word_ids: ["w-6", "w-7", "w-8", "w-9", "w-10", "w-11"],
      start_s: 1.52,
      end_s: 2.98,
      start_ms: 1520,
      end_ms: 2980,
      source: "manual-correction",
      original_source: "aligned",
      flagged: false,
    });
  });

  it("keeps repeated manual correction passes idempotent across rebuilds", async () => {
    const overrides = {
      overrides: [
        {
          line_index: 0,
          start_s: 0.25,
          end_s: 1.45,
        },
      ],
    };
    const aligned = alignLyrics(await readFile(lyricsPath, "utf8"), await transcript(), { gap_close_s: 0.1 });

    const corrected = applyManualCorrections(aligned, overrides);
    const repeated = applyManualCorrections(corrected, overrides);

    expect(repeated).toEqual(corrected);
    expect(repeated.lines[0]).toMatchObject({
      start_s: 0.25,
      end_s: 1.45,
      start_ms: 250,
      end_ms: 1450,
      source: "manual-correction",
      original_source: "gap_filled",
      flagged: false,
    });
  });

  it("extracts canonical lyric text from episode inputs", () => {
    expect(canonicalLyricsFromEpisodeInputs({ lyrics: { text: "Line one\nLine two" } })).toBe("Line one\nLine two");
    expect(canonicalLyricsFromEpisodeInputs({ canonical_lyrics: "Canonical line" })).toBe("Canonical line");
    expect(canonicalLyricsFromEpisodeInputs({ lyrics: "" })).toBeUndefined();
  });
});

async function transcript(): Promise<Segment[]> {
  return JSON.parse(await readFile(transcriptPath, "utf8")) as Segment[];
}
