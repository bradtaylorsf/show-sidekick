import { describe, expect, it } from "vitest";
import transcriber from "./transcriber.js";

const ctx = {
  projectRoot: "/tmp/predit",
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  },
};

describe("transcriber", () => {
  it("registers the transcriber capability marker", async () => {
    expect(transcriber.name).toBe("transcriber");
    expect(transcriber.capability).toBe("transcriber");
    await expect(transcriber.isAvailable()).resolves.toEqual({ available: true });
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(transcriber.execute({ path: "voice.wav" }, ctx)).rejects.toThrow(/capability marker/);
  });
});
