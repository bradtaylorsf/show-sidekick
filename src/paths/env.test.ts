import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDING, LEGACY_BRANDING } from "../branding.js";
import { LegacyEnvVarError, MissingEnvError } from "./errors.js";
import { loadEnv, loadEnvIntoProcess, optionalEnv, requireEnv } from "./env.js";

let scratchDirs: string[] = [];
const processEnvKey = "PREDIT_TEST_PROCESS_ENV";
const missingEnvKey = "PREDIT_TEST_MISSING_ENV";
const hydratedEnvKey = "PREDIT_TEST_HYDRATED_ENV";

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-env-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, BRANDING.cacheDir), { recursive: true });
  await writeFile(path.join(root, "AGENTS.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
  delete process.env[processEnvKey];
  delete process.env[missingEnvKey];
  delete process.env[hydratedEnvKey];
  delete process.env.SHOW_SIDEKICK_TEST_VALUE;
  delete process.env.PREDIT_TEST_VALUE;
});

describe("env loader", () => {
  it("loads env files with local and command-specific precedence", async () => {
    const root = await scratchProject();
    await writeFile(path.join(root, ".env"), "SHARED=base\nBASE_ONLY=1\n", "utf8");
    await writeFile(path.join(root, ".env.build"), "SHARED=build\nCOMMAND_ONLY=1\n", "utf8");
    await writeFile(path.join(root, ".env.local"), "SHARED=local\nLOCAL_ONLY=1\n", "utf8");

    expect(loadEnv("build", root)).toMatchObject({
      SHARED: "local",
      BASE_ONLY: "1",
      COMMAND_ONLY: "1",
      LOCAL_ONLY: "1",
    });
  });

  it("lets process.env win for requireEnv and optionalEnv", async () => {
    const root = await scratchProject();
    process.env[processEnvKey] = "process";
    await writeFile(path.join(root, ".env"), `${processEnvKey}=file\n`, "utf8");

    expect(requireEnv(processEnvKey, undefined, root)).toBe("process");
    expect(optionalEnv(processEnvKey, undefined, root)).toBe("process");
    expect(loadEnv(undefined, root)[processEnvKey]).toBe("process");
  });

  it("throws MissingEnvError for required missing values", async () => {
    const root = await scratchProject();

    expect(() => requireEnv(missingEnvKey, undefined, root)).toThrow(MissingEnvError);
    try {
      requireEnv(missingEnvKey, undefined, root);
      throw new Error("expected requireEnv to fail");
    } catch (error) {
      expect(error).toMatchObject({ name: "MissingEnvError", envName: missingEnvKey });
    }
  });

  it("returns undefined for optional missing values", async () => {
    const root = await scratchProject();

    expect(optionalEnv(missingEnvKey, undefined, root)).toBeUndefined();
  });

  it("rejects legacy public env var names with migration guidance", async () => {
    const root = await scratchProject();
    const publicName = `${BRANDING.envPrefix}TEST_VALUE`;
    const legacyName = `${LEGACY_BRANDING.envPrefix}TEST_VALUE`;
    await writeFile(path.join(root, ".env"), `${legacyName}=legacy\n`, "utf8");

    expect(() => requireEnv(publicName, undefined, root)).toThrow(LegacyEnvVarError);
    expect(() => requireEnv(publicName, undefined, root)).toThrow(
      `Rename it to ${publicName}`,
    );
  });

  it("hydrates process.env from project env files without replacing existing values", async () => {
    const root = await scratchProject();
    process.env[processEnvKey] = "process";
    await writeFile(
      path.join(root, ".env"),
      `${hydratedEnvKey}=file\n${processEnvKey}=file\n`,
      "utf8",
    );

    expect(loadEnvIntoProcess(undefined, root)).toMatchObject({
      [hydratedEnvKey]: "file",
      [processEnvKey]: "process",
    });
    expect(process.env[hydratedEnvKey]).toBe("file");
    expect(process.env[processEnvKey]).toBe("process");
  });
});
