import type { Finding } from "../artifacts/review.js";

export type FocusEvaluatorHook = (input: {
  item: string;
  stageSlug: string;
  artifact: unknown;
}) => Finding[];

export type FocusEvaluatorContext = {
  focusEvaluators?: Record<string, FocusEvaluatorHook>;
};

export function evaluateFocusItem(
  item: string,
  stageSlug: string,
  artifact: unknown,
  ctx: FocusEvaluatorContext = {},
): Finding[] {
  const hook = ctx.focusEvaluators?.[item];
  if (hook !== undefined) {
    return hook({ item, stageSlug, artifact });
  }

  return [
    {
      severity: "nitpick",
      title: `Review focus queued: ${item}`,
      location: stageSlug,
      description: `No automated evaluator is registered for review_focus item "${item}"; keep it visible during review.`,
      status: "pending",
    },
  ];
}
