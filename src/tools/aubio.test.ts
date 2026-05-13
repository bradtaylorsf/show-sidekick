import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import tool from "./aubio.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("aubio tool", () => {
  it("registers aubio as a binary integration", () => {
    expect(tool.name).toBe("aubio");
    expect(tool.capability).toBe("aubio");
    expect(tool.integration).toMatchObject({
      kind: "binary",
      binary: "aubio",
    });
  });

  it("reports unavailable with install guidance when aubio is missing from PATH", async () => {
    stubMissingBinaryPath();

    await expect(tool.isAvailable()).resolves.toEqual({
      available: false,
      reason: "binary not on PATH: aubio",
      fix: "install",
    });
  });

  it("returns a stable availability shape with the current PATH", async () => {
    const availability = await tool.isAvailable();

    if (availability.available) {
      expect(availability).toEqual({ available: true });
    } else {
      expect(availability).toEqual({
        available: false,
        reason: "binary not on PATH: aubio",
        fix: "install",
      });
    }
  });
});

function stubMissingBinaryPath(): void {
  const dir = mkdtempSync(join(tmpdir(), "predit-tool-missing-"));
  const which = join(dir, "which");
  writeFileSync(which, "#!/bin/sh\nexit 1\n");
  chmodSync(which, 0o755);
  vi.stubEnv("PATH", dir);
}
