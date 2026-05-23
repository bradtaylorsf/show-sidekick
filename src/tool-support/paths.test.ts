import { describe, expect, it } from "vitest";
import { resolveProjectPath, resolveProjectReadPath, resolveProjectWritePath } from "./paths.js";

describe("tool path helpers", () => {
  it("resolves relative paths under the project root", () => {
    expect(resolveProjectPath("clips/source.mp4", "/project")).toBe("/project/clips/source.mp4");
  });

  it("rejects paths outside the project root", () => {
    expect(() => resolveProjectPath("../outside.mp4", "/project")).toThrow(/inside project root/);
    expect(() => resolveProjectPath("/tmp/outside.mp4", "/project")).toThrow(/inside project root/);
  });

  it("allows absolute read paths outside the project root", () => {
    expect(resolveProjectReadPath("/tmp/source.mp4", "/project")).toBe("/tmp/source.mp4");
    expect(resolveProjectReadPath("clips/source.mp4", "/project")).toBe("/project/clips/source.mp4");
  });

  it("keeps write paths confined to the project root", () => {
    expect(resolveProjectWritePath("renders/out.mp4", "/project")).toBe("/project/renders/out.mp4");
    expect(() => resolveProjectWritePath("/tmp/out.mp4", "/project")).toThrow(/inside project root/);
  });

  it("supports ingest-style absolute reads while preserving project-local writes", () => {
    expect(resolveProjectReadPath("/Users/operator/Desktop/deck.pdf", "/project")).toBe(
      "/Users/operator/Desktop/deck.pdf",
    );
    expect(resolveProjectWritePath("projects/show/episode/decks", "/project")).toBe(
      "/project/projects/show/episode/decks",
    );
    expect(() => resolveProjectWritePath("/Users/operator/Desktop/decks", "/project")).toThrow(/inside project root/);
  });
});
