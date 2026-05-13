import { z } from "zod";
import { PlaybookCaptionStyleSchema } from "../../artifacts/playbook.js";
import { element, sceneRoot } from "../scene-helpers.js";
import { useCurrentFrame } from "../primitives.js";
import { BaseScenePropsSchema } from "../types.js";
import { CuesheetWordSchema, type CuesheetWord } from "../../artifacts/cuesheet.js";

export const CaptionBurnPropsSchema = BaseScenePropsSchema.extend({
  words: z.array(CuesheetWordSchema),
  style: PlaybookCaptionStyleSchema.default({}),
});

export type CaptionBurnProps = z.input<typeof CaptionBurnPropsSchema>;

export type CaptionSyncResult = {
  status: "pass" | "warn";
  max_drift_s: number;
  tolerance_s: number;
  checked_words: number;
};

export function caption_burn(props: CaptionBurnProps) {
  const parsed = CaptionBurnPropsSchema.parse(props);
  const frame = useCurrentFrame();
  const timeS = frame / parsed.fps;
  const activeIndex = activeCaptionWordIndex(parsed.words, timeS);
  const lines = chunkCaptionWords(parsed.words, parsed.style.max_chars_per_line);

  return sceneRoot(
    "caption_burn",
    parsed,
    [
      element(
        "caption-box",
        {
          active_index: activeIndex,
          position: parsed.style.position,
          time_s: Math.round(timeS * 1000) / 1000,
          style: {
            background: parsed.style.background,
            color: parsed.style.fill,
            fontFamily: parsed.style.font_family,
            fontSize: parsed.style.font_size,
            fontWeight: parsed.style.font_weight,
            stroke: parsed.style.stroke,
            strokeWidth: parsed.style.stroke_width,
          },
        },
        ...lines.map((line, lineIndex) =>
          element(
            "caption-line",
            { index: lineIndex },
            ...line.map((word) =>
              element("caption-word", {
                active: word.index === activeIndex,
                color: word.index === activeIndex ? parsed.style.active_fill : parsed.style.inactive_fill,
                end_s: word.end_s,
                index: word.index,
                start_s: word.start_s,
                text: word.text,
              }),
            ),
          ),
        ),
      ),
    ],
    { overlay: true },
  );
}

export function activeCaptionWordIndex(words: CuesheetWord[], timeS: number): number | null {
  const index = words.findIndex((word, wordIndex) => {
    const isLast = wordIndex === words.length - 1;
    return timeS >= word.start_s && (timeS < word.end_s || (isLast && timeS <= word.end_s));
  });

  return index === -1 ? null : index;
}

export function validateCaptionFrameSync(words: CuesheetWord[], fps: number, toleranceS = 0.05): CaptionSyncResult {
  const maxDrift = words.reduce((max, word) => {
    const nearestFrameStart = Math.round(word.start_s * fps) / fps;
    const nearestFrameEnd = Math.round(word.end_s * fps) / fps;
    return Math.max(max, Math.abs(nearestFrameStart - word.start_s), Math.abs(nearestFrameEnd - word.end_s));
  }, 0);

  return {
    status: maxDrift <= toleranceS ? "pass" : "warn",
    max_drift_s: Math.round(maxDrift * 1000) / 1000,
    tolerance_s: toleranceS,
    checked_words: words.length,
  };
}

function chunkCaptionWords(words: CuesheetWord[], maxCharsPerLine: number): Array<Array<CuesheetWord & { index: number }>> {
  const lines: Array<Array<CuesheetWord & { index: number }>> = [];
  let currentLine: Array<CuesheetWord & { index: number }> = [];
  let currentLength = 0;

  words.forEach((word, index) => {
    const nextLength = currentLength + word.text.length + (currentLine.length > 0 ? 1 : 0);
    if (currentLine.length > 0 && nextLength > maxCharsPerLine) {
      lines.push(currentLine);
      currentLine = [];
      currentLength = 0;
    }

    currentLine.push({ ...word, index });
    currentLength += word.text.length + (currentLine.length > 1 ? 1 : 0);
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}
