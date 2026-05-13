import { z } from "zod";
import { EditDecisionsSchema, type Cut, type EditDecisions } from "../artifacts/index.js";
import { defineTool } from "../registry/index.js";

const rangeSchema = z.object({
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
});

const inputSchema = z.object({
  edit_decisions: EditDecisionsSchema,
  total_duration_s: z.number().positive(),
});

const outputSchema = z.object({
  passed: z.boolean(),
  gaps: z.array(rangeSchema),
  overlaps: z.array(rangeSchema),
  coverage_ratio: z.number().min(0).max(1),
});

type CompositionValidatorInput = z.infer<typeof inputSchema>;
type CompositionValidatorOutput = z.infer<typeof outputSchema>;

export function validateCompositionCoverage(
  editDecisions: EditDecisions,
  totalDurationS: number,
): CompositionValidatorOutput {
  const cuts = [...editDecisions.cuts].sort((left, right) => left.start_s - right.start_s || left.end_s - right.end_s);
  const gaps: CompositionValidatorOutput["gaps"] = [];
  const overlaps: CompositionValidatorOutput["overlaps"] = [];
  let cursor = 0;

  for (const cut of cuts) {
    if (cut.start_s > cursor) {
      gaps.push({ start_s: cursor, end_s: cut.start_s });
    } else if (cut.start_s < cursor && cut.end_s > cut.start_s) {
      overlaps.push({ start_s: cut.start_s, end_s: Math.min(cursor, cut.end_s) });
    }

    cursor = Math.max(cursor, cut.end_s);
  }

  if (cursor < totalDurationS) {
    gaps.push({ start_s: cursor, end_s: totalDurationS });
  }

  return outputSchema.parse({
    passed: gaps.length === 0 && overlaps.length === 0 && cursor >= totalDurationS,
    gaps,
    overlaps,
    coverage_ratio: coverageRatio(cuts, totalDurationS),
  });
}

function coverageRatio(cuts: Cut[], totalDurationS: number): number {
  const intervals = cuts
    .map((cut) => ({
      start: Math.max(0, Math.min(totalDurationS, cut.start_s)),
      end: Math.max(0, Math.min(totalDurationS, cut.end_s)),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  let covered = 0;
  let cursor = 0;

  for (const interval of intervals) {
    const start = Math.max(cursor, interval.start);
    if (interval.end > start) {
      covered += interval.end - start;
      cursor = interval.end;
    }
  }

  return Math.min(1, Math.max(0, covered / totalDurationS));
}

const compositionValidator = defineTool({
  name: "composition_validator",
  capability: "composition_validation",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "checking edit decisions for full-duration cut coverage without gaps or overlaps",
  supports: ["gap-detection", "overlap-detection", "coverage-ratio"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(params: CompositionValidatorInput): Promise<CompositionValidatorOutput> {
    const input = inputSchema.parse(params);

    return validateCompositionCoverage(input.edit_decisions, input.total_duration_s);
  },
});

export default compositionValidator;
