import { describe, expect, it } from "vitest";
import { bucketize, clampMax, clampMin, mean, normalize, sumWeights, weightedScore } from "./scoring.js";

describe("scoring utilities", () => {
  describe("weightedScore", () => {
    it("returns the weighted average for positive and negative values", () => {
      expect(
        weightedScore([
          { value: -1, weight: 1 },
          { value: 3, weight: 3 },
        ]),
      ).toBe(2);
    });

    it("returns zero when total weight is zero", () => {
      expect(weightedScore([{ value: 10, weight: 0 }])).toBe(0);
      expect(weightedScore([])).toBe(0);
    });
  });

  describe("normalize", () => {
    it("normalizes and clamps values into the zero-to-one range", () => {
      expect(normalize(5, 0, 10)).toBe(0.5);
      expect(normalize(-5, 0, 10)).toBe(0);
      expect(normalize(15, 0, 10)).toBe(1);
    });

    it("returns zero for an empty range", () => {
      expect(normalize(5, 5, 5)).toBe(0);
    });
  });

  it("clamps against min and max helpers", () => {
    expect(clampMin(2, 4)).toBe(4);
    expect(clampMin(6, 4)).toBe(6);
    expect(clampMax(8, 6)).toBe(6);
    expect(clampMax(4, 6)).toBe(4);
  });

  it("averages arrays and returns zero for empty arrays", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(mean([])).toBe(0);
  });

  it("sums weights including empty input", () => {
    expect(sumWeights([{ value: 1, weight: 2 }])).toBe(2);
    expect(sumWeights([])).toBe(0);
  });

  it("bucketizes values at threshold boundaries using sorted thresholds", () => {
    const thresholds = [
      { at: 0.9, label: "pass" },
      { at: 0.4, label: "warn" },
      { at: 0.7, label: "review" },
    ];

    expect(bucketize(0.39, thresholds, "fail")).toBe("fail");
    expect(bucketize(0.4, thresholds, "fail")).toBe("warn");
    expect(bucketize(0.85, thresholds, "fail")).toBe("review");
    expect(bucketize(0.9, thresholds, "fail")).toBe("pass");
  });
});
