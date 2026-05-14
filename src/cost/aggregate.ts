import type { CostLog } from "../artifacts/cost-log.js";
import type { Finding } from "../artifacts/review.js";

export type CostAggregate = {
  sample_total: number;
  full_total: number;
  by_capability: Record<string, number>;
  by_provider: Record<string, number>;
};

export function aggregateCosts(log: CostLog): CostAggregate {
  return log.reduce<CostAggregate>(
    (aggregate, entry) => {
      if (entry.mode === "sample") {
        aggregate.sample_total += entry.usd;
      } else {
        aggregate.full_total += entry.usd;
      }

      aggregate.by_capability[entry.tool] = (aggregate.by_capability[entry.tool] ?? 0) + entry.usd;
      aggregate.by_provider[entry.provider] = (aggregate.by_provider[entry.provider] ?? 0) + entry.usd;

      return aggregate;
    },
    {
      sample_total: 0,
      full_total: 0,
      by_capability: {},
      by_provider: {},
    },
  );
}

export function cumulativeCostDrift(input: {
  actual: number;
  estimated: number;
  threshold?: number;
}): Finding[] {
  const threshold = input.threshold ?? 1.3;

  if (input.estimated <= 0 || input.actual <= input.estimated * threshold) {
    return [];
  }

  const allowed = input.estimated * threshold;

  return [
    {
      severity: "critical",
      title: "Cumulative cost drift exceeded estimate",
      location: "cost_log.cumulative_actual_usd",
      description: `Cumulative actual cost is $${input.actual.toFixed(2)}, above ${threshold.toFixed(
        2,
      )}x the cumulative estimate of $${input.estimated.toFixed(2)} (allowed: $${allowed.toFixed(2)}).`,
      proposed_fix:
        "Pause paid execution, revise the remaining plan to fit the approved estimate, or record an explicit budget_tradeoff decision before continuing.",
      patch: {
        artifact_path: "cost_log.cumulative_actual_usd",
        new_value: input.actual,
      },
      status: "pending",
    },
  ];
}
