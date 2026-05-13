import { describe, expect, it } from "vitest";

import { deepMerge } from "./index.js";

describe("deepMerge", () => {
  it("merges nested objects by key", () => {
    const base = {
      defaults: {
        runtime: "ffmpeg",
        options: { first: 1, second: 2 },
      },
      title: "base",
    };

    const result = deepMerge(base, {
      defaults: {
        options: { second: 3, third: 4 },
      },
    });

    expect(result).toEqual({
      defaults: {
        runtime: "ffmpeg",
        options: { first: 1, second: 3, third: 4 },
      },
      title: "base",
    });
  });

  it("replaces arrays instead of concatenating them", () => {
    const result = deepMerge(
      { stages: ["research", "script"], nested: { tags: ["old"] } },
      { stages: ["compose"], nested: { tags: ["new"] } },
    );

    expect(result).toEqual({
      stages: ["compose"],
      nested: { tags: ["new"] },
    });
  });

  it("removes object keys when an override value is null", () => {
    const result = deepMerge(
      { keep: true, nested: { remove: "value", keep: "value" } },
      { nested: { remove: null } },
    );

    expect(result).toEqual({ keep: true, nested: { keep: "value" } });
  });

  it("overwrites scalar values", () => {
    const result = deepMerge({ runtime: "ffmpeg" }, { runtime: "remotion" });

    expect(result).toEqual({ runtime: "remotion" });
  });

  it("returns a new object without mutating either input", () => {
    const base = { stages: ["research"], nested: { first: 1 } };
    const overrides = { stages: ["compose"], nested: { second: 2 } };

    const result = deepMerge(base, overrides);

    expect(result).toEqual({ stages: ["compose"], nested: { first: 1, second: 2 } });
    expect(base).toEqual({ stages: ["research"], nested: { first: 1 } });
    expect(overrides).toEqual({ stages: ["compose"], nested: { second: 2 } });
    expect(result).not.toBe(base);
    expect(result.stages).not.toBe(base.stages);
    expect(result.nested).not.toBe(base.nested);
  });
});
