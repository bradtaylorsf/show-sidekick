import { describe, expect, it } from "vitest";
import { resolveProjectPath } from "./paths.js";

describe("tool path helpers", () => {
  it("resolves relative paths under the project root", () => {
    expect(resolveProjectPath("clips/source.mp4", "/project")).toBe("/project/clips/source.mp4");
  });

  it("rejects paths outside the project root", () => {
    expect(() => resolveProjectPath("../outside.mp4", "/project")).toThrow(/inside project root/);
    expect(() => resolveProjectPath("/tmp/outside.mp4", "/project")).toThrow(/inside project root/);
  });
});
