import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { PipelineManifestSchema } from "./manifest.js";

const bundledPipelinesDir = fileURLToPath(new URL("../../bundled/pipelines/", import.meta.url));
const bundledPipelineSkillsDir = fileURLToPath(new URL("../../bundled/skills/pipelines/", import.meta.url));

describe("bundled pipeline manifests", () => {
  it("ships the framework-smoke manifest as a minimal two-stage pipeline", async () => {
    const manifestPath = path.join(bundledPipelinesDir, "framework-smoke.yaml");
    const raw = await readFile(manifestPath, "utf8");
    const manifest = PipelineManifestSchema.parse(parseYaml(raw));

    expect(raw.trimEnd().split(/\r?\n/u).length).toBeLessThan(30);
    expect(raw).not.toMatch(/^orchestration:/mu);
    expect(raw).not.toMatch(/^metadata:/mu);
    expect(manifest.slug).toBe("framework-smoke");
    expect(manifest.stages.map((stage) => stage.slug)).toEqual(["research", "script"]);
    expect(manifest.stages.map((stage) => stage.human_approval)).toEqual(["never", "never"]);
    expect(existsSync(path.join(bundledPipelineSkillsDir, "framework-smoke", "executive-producer.md"))).toBe(false);
  });
});
