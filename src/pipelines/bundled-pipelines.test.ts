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

  it("ships the hybrid manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("hybrid");
    const hybridSkillsDir = path.join(bundledPipelineSkillsDir, "hybrid");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "hybrid",
      status: "production",
      master_clock: "none",
      orchestration: {
        budget_default_usd: 2,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 12,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(hybridSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(hybridSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(hybridSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });
});

async function loadBundledManifest(slug: string) {
  const raw = await readFile(path.join(bundledPipelinesDir, `${slug}.yaml`), "utf8");
  return PipelineManifestSchema.parse(parseYaml(raw));
}
