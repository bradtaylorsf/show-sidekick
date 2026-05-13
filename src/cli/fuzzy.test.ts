import { describe, expect, it } from "vitest";
import { distance, suggest } from "./fuzzy.js";

describe("fuzzy suggestions", () => {
  it("returns zero distance for exact matches", () => {
    expect(distance("build", "build")).toBe(0);
  });

  it("suggests a nearby command", () => {
    expect(suggest("buid", ["build", "doctor"])).toBe("build");
  });

  it("does not suggest when the nearest command is too far away", () => {
    expect(suggest("xyz", ["build", "doctor"])).toBeUndefined();
  });
});
