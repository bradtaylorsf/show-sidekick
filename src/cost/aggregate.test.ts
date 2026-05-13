import { describe, expect, it } from "vitest";
import type { CostLog } from "../artifacts/cost-log.js";
import { aggregateCosts } from "./aggregate.js";

describe("aggregateCosts", () => {
  it("separates sample totals from full totals", () => {
    expect(
      aggregateCosts([
        costEntry({ tool: "image_generation", usd: 0.25, mode: "sample" }),
        costEntry({ tool: "video_generation", usd: 1.5, mode: "full" }),
      ]),
    ).toMatchObject({
      sample_total: 0.25,
      full_total: 1.5,
    });
  });

  it("groups cost by capability using the tool field", () => {
    const aggregate = aggregateCosts([
      costEntry({ tool: "image_generation", usd: 0.25, mode: "sample" }),
      costEntry({ tool: "image_generation", usd: 0.75, mode: "full" }),
      costEntry({ tool: "tts", usd: 0.1, mode: "sample" }),
    ]);

    expect(aggregate.by_capability).toEqual({
      image_generation: 1,
      tts: 0.1,
    });
  });

  it("groups cost by provider across sample and full entries", () => {
    const aggregate = aggregateCosts([
      costEntry({ provider: "openai", usd: 0.25, mode: "sample" }),
      costEntry({ provider: "openai", usd: 1.25, mode: "full" }),
      costEntry({ provider: "elevenlabs", usd: 0.1, mode: "sample" }),
    ]);

    expect(aggregate.by_provider).toEqual({
      openai: 1.5,
      elevenlabs: 0.1,
    });
  });

  it("returns zeroed totals and empty maps for an empty log", () => {
    expect(aggregateCosts([])).toEqual({
      sample_total: 0,
      full_total: 0,
      by_capability: {},
      by_provider: {},
    });
  });
});

function costEntry(overrides: Partial<CostLog[number]>): CostLog[number] {
  return {
    tool: "image_generation",
    provider: "openai",
    model: "image-model",
    units: 1,
    usd: 0.12,
    mode: "sample",
    ...overrides,
  };
}
