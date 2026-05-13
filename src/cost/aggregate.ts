import type { CostLog } from "../artifacts/cost-log.js";

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
