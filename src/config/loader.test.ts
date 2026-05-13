import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ConfigError } from "./errors.js";
import { loadJson, loadYaml } from "./loader.js";

const schema = z.object({
  name: z.string(),
  nested: z.object({
    count: z.number().int(),
  }),
});

let scratchDirs: string[] = [];

async function scratchFile(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "predit-config-"));
  scratchDirs.push(dir);
  const filePath = path.join(dir, name);
  await writeFile(filePath, content, "utf8");
  return filePath;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("config loaders", () => {
  it("returns typed values for valid YAML", async () => {
    const filePath = await scratchFile("valid.yaml", "name: demo\nnested:\n  count: 2\n");

    await expect(loadYaml(filePath, schema)).resolves.toEqual({
      name: "demo",
      nested: { count: 2 },
    });
  });

  it("returns typed values for valid JSON", async () => {
    const filePath = await scratchFile("valid.json", '{"name":"demo","nested":{"count":2}}');

    await expect(loadJson(filePath, schema)).resolves.toEqual({
      name: "demo",
      nested: { count: 2 },
    });
  });

  it("throws ConfigError for missing files", async () => {
    const filePath = path.join(tmpdir(), `predit-missing-config-${randomUUID()}.yaml`);

    await expect(loadYaml(filePath, schema)).rejects.toMatchObject({
      name: "ConfigError",
      filePath,
      issues: [{ path: "", message: "file not found" }],
    });
  });

  it("throws ConfigError with line data for malformed YAML", async () => {
    const filePath = await scratchFile("bad.yaml", "name: demo\nnested: [\n");

    await expect(loadYaml(filePath, schema)).rejects.toBeInstanceOf(ConfigError);

    try {
      await loadYaml(filePath, schema);
      throw new Error("expected loadYaml to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;
      expect(configError.filePath).toBe(filePath);
      expect(configError.line).toBeGreaterThan(0);
      expect(configError.issues[0]?.message).not.toContain("ZodError");
    }
  });

  it("throws ConfigError with human-readable schema issues", async () => {
    const filePath = await scratchFile("invalid.yaml", "name: demo\nnested:\n  count: nope\n");

    try {
      await loadYaml(filePath, schema);
      throw new Error("expected loadYaml to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const configError = error as ConfigError;

      expect(configError.issues).toEqual([
        {
          path: "nested.count",
          message: "Expected number, received string",
        },
      ]);
      expect(configError.message).not.toContain("ZodError");
      expect(configError.message).toContain("- nested.count: Expected number, received string");
    }
  });
});
