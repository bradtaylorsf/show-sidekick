import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import tool from "./whisper-cpp.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("whisper-cpp tool", () => {
  it("registers whisper.cpp as a binary integration", () => {
    expect(tool.name).toBe("whisper-cpp");
    expect(tool.capability).toBe("whisper");
    expect(tool.integration).toMatchObject({
      kind: "binary",
      binary: "whisper-cli",
    });
  });

  it("reports unavailable with install guidance when whisper-cli is missing from PATH", async () => {
    stubMissingBinaryPath();

    await expect(tool.isAvailable()).resolves.toEqual({
      available: false,
      reason: "binary not on PATH: whisper-cli",
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
        reason: "binary not on PATH: whisper-cli",
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
