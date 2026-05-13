import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MissingEnvError } from "./errors.js";
import { loadEnv, optionalEnv, requireEnv } from "./env.js";

let scratchDirs: string[] = [];
const processEnvKey = "PREDIT_TEST_PROCESS_ENV";
const missingEnvKey = "PREDIT_TEST_MISSING_ENV";

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-env-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
  delete process.env[processEnvKey];
  delete process.env[missingEnvKey];
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
});
