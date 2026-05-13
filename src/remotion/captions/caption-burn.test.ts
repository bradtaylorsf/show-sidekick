import { describe, expect, it } from "vitest";
import { CuesheetSchema, PlaybookCaptionStyleSchema } from "../../artifacts/index.js";
import { renderAtFrame } from "../primitives.js";
import { activeCaptionWordIndex, caption_burn, cuesheetToWords, validateCaptionFrameSync } from "./index.js";

const cuesheet = CuesheetSchema.parse({
  audio: {
    path: "/tmp/voiceover.wav",
    duration_s: 1.2,
    sample_rate: 48_000,
    channels: 1,
  },
  master_clock: "voiceover",
  segments: [
    {
      start_s: 0,
      end_s: 1.2,
      text: "Ship the draft",
      words: [
        { text: "Ship", start_s: 0, end_s: 0.4, confidence: 0.99 },
        { text: "the", start_s: 0.4, end_s: 0.7, confidence: 0.99 },
        { text: "draft", start_s: 0.7, end_s: 1.2, confidence: 0.99 },
      ],
    },
  ],
  sections: [{ label: "voiceover", start_s: 0, end_s: 1.2, kind: "vocal", energy: 0.8 }],
  beats: [],
  climax: [],
  scene_anchors: [],
});

const style = PlaybookCaptionStyleSchema.parse({
  font_family: "Inter Tight",
  font_size: 60,
  fill: "#ffffff",
  active_fill: "#2dd4bf",
  inactive_fill: "#cbd5e1",
  position: "bottom",
  max_chars_per_line: 18,
});

describe("caption burn", () => {
  it("extracts segment-level words into sorted caption words", () => {
    expect(cuesheetToWords(cuesheet).map((word) => word.text)).toEqual(["Ship", "the", "draft"]);
  });

  it("activates the word matching the current frame time", () => {
    const words = cuesheetToWords(cuesheet);

    expect(activeCaptionWordIndex(words, 0 / 30)).toBe(0);
    expect(activeCaptionWordIndex(words, 12 / 30)).toBe(1);
    expect(activeCaptionWordIndex(words, 21 / 30)).toBe(2);
  });

  it("verifies word frame quantization within the 50ms sync tolerance", () => {
    expect(validateCaptionFrameSync(cuesheetToWords(cuesheet), 30)).toEqual({
      checked_words: 3,
      max_drift_s: 0,
      status: "pass",
      tolerance_s: 0.05,
    });
  });

  it("renders active word state deterministically", () => {
    expect(
      renderAtFrame(
        caption_burn,
        {
          words: cuesheetToWords(cuesheet),
          style,
          fps: 30,
        },
        12,
      ),
    ).toMatchSnapshot();
  });
});
