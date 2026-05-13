import { CuesheetSchema, CuesheetWordSchema, type CuesheetWord } from "../../artifacts/cuesheet.js";

export function cuesheetToWords(cuesheet: unknown): CuesheetWord[] {
  const parsed = CuesheetSchema.parse(cuesheet);
  const words = parsed.words?.length ? parsed.words : parsed.segments.flatMap((segment) => segment.words);

  return words.map((word) => CuesheetWordSchema.parse(word)).sort((left, right) => left.start_s - right.start_s);
}
