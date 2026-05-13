import { afterEach, describe, expect, it, vi } from "vitest";
import { probe } from "./availability.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("probe", () => {
  it("reports cli-login tools as available when the binary exists and auth check succeeds", async () => {
    await expect(
      probe({
        kind: "cli",
        binary: "node",
        auth: { mode: "cli-login", check: 'node -e "process.exit(0)"' },
        install: "install node",
      }),
    ).resolves.toEqual({ available: true });
  });

  it("reports cli-login tools as unauthenticated when auth check exits non-zero", async () => {
    await expect(
      probe({
        kind: "cli",
        binary: "node",
        auth: { mode: "cli-login", check: 'node -e "process.exit(1)"' },
        install: "install node",
      }),
    ).resolves.toEqual({ available: false, reason: "not-authenticated", fix: "cli-login" });
  });

  it("checks required environment variables for api integrations", async () => {
    vi.stubEnv("PREDIT_TEST_API_KEY", "present");

    await expect(
      probe({ kind: "api", env: ["PREDIT_TEST_API_KEY"], install: "set PREDIT_TEST_API_KEY" }),
    ).resolves.toEqual({ available: true });

    vi.stubEnv("PREDIT_TEST_API_KEY", "");

    await expect(
      probe({ kind: "api", env: ["PREDIT_TEST_API_KEY"], install: "set PREDIT_TEST_API_KEY" }),
    ).resolves.toEqual({
      available: false,
      reason: "missing env: PREDIT_TEST_API_KEY",
      fix: "env",
    });
  });

  it("checks whether library integrations resolve from Node", async () => {
    await expect(probe({ kind: "library", package: "zod", install: "pnpm add zod" })).resolves.toEqual({
      available: true,
    });

    await expect(
      probe({ kind: "library", package: "definitely-not-installed-predit-fixture", install: "pnpm add nope" }),
    ).resolves.toEqual({
      available: false,
      reason: "package not installed: definitely-not-installed-predit-fixture",
      fix: "install",
    });
  });

  it("bounds cli auth checks with a configurable timeout", async () => {
    const started = Date.now();
    const availability = await probe({
      kind: "cli",
      binary: "node",
      auth: { mode: "cli-login", check: 'node -e "setTimeout(() => {}, 1000)"', timeoutMs: 50 },
      install: "install node",
    });

    expect(Date.now() - started).toBeLessThan(500);
    expect(availability).toEqual({ available: false, reason: "auth check timed out", fix: "cli-login" });
  });
});
