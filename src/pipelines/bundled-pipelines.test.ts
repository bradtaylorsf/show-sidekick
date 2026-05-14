import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { PipelineManifestSchema } from "./manifest.js";
import { Registry } from "../registry/index.js";

const bundledPipelinesDir = fileURLToPath(new URL("../../bundled/pipelines/", import.meta.url));
const bundledPipelineSkillsDir = fileURLToPath(new URL("../../bundled/skills/pipelines/", import.meta.url));
const bundledArtifactSchemasDir = fileURLToPath(new URL("../../bundled/schemas/artifacts/", import.meta.url));

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
        mode: "executive-producer",
        skill: "pipelines/hybrid/executive-producer.md",
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

  it("ships the localization-dub manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("localization-dub");
    const localizationSkillsDir = path.join(bundledPipelineSkillsDir, "localization-dub");
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
      slug: "localization-dub",
      status: "beta",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/localization-dub/executive-producer.md",
        budget_default_usd: 3,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 15,
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
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toContain("heygen_video");

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(localizationSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(localizationSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(localizationSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the daily-news manifest with nine directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("daily-news");
    const dailyNewsSkillsDir = path.join(bundledPipelineSkillsDir, "daily-news");
    const directorFiles = [
      "research-director.md",
      "idea-director.md",
      "script-director.md",
      "capture-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "daily-news",
      status: "beta",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/daily-news/executive-producer.md",
        budget_default_usd: 1.5,
        max_revisions_per_stage: 2,
        max_send_backs: 1,
        max_wall_time_minutes: 20,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "research",
      "capture",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "capture")?.tools_available).toEqual([
      "playwright_recording",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "edit")?.review_focus).toContain(
      "silent runtime swap is a CRITICAL governance violation",
    );

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(dailyNewsSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(dailyNewsSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(dailyNewsSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("resolves every declared pipeline director and executive-producer skill", async () => {
    const manifests = await loadAllBundledManifests();
    const missing: string[] = [];

    for (const manifest of manifests) {
      if (manifest.orchestration.skill) {
        const skillPath = resolvePipelineSkill(manifest.orchestration.skill);
        if (!existsSync(skillPath)) {
          missing.push(`${manifest.slug}.orchestration.skill -> ${manifest.orchestration.skill}`);
        }
      }

      for (const stage of manifest.stages) {
        const skillPath = resolvePipelineSkill(stage.skill);
        if (!existsSync(skillPath)) {
          missing.push(`${manifest.slug}.${stage.slug}.skill -> ${stage.skill}`);
        }
      }

      for (const requiredSkill of manifest.required_skills ?? []) {
        if (!requiredSkill.startsWith("pipelines/")) {
          continue;
        }

        const skillPath = resolvePipelineSkill(requiredSkill);
        if (!existsSync(skillPath)) {
          missing.push(`${manifest.slug}.required_skills -> ${requiredSkill}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("resolves every declared tool name through the registry", async () => {
    const manifests = await loadAllBundledManifests();
    const registry = new Registry();
    await registry.discover();
    const unresolved: string[] = [];

    for (const manifest of manifests) {
      for (const stage of manifest.stages) {
        const toolFields = {
          required_tools: stage.required_tools,
          optional_tools: stage.optional_tools,
          tools_available: stage.tools_available,
        };

        for (const [field, toolNames] of Object.entries(toolFields)) {
          for (const toolName of toolNames) {
            if (!registry.get(toolName) && registry.byCapability(toolName).length === 0) {
              unresolved.push(`${manifest.slug}.${stage.slug}.${field}: ${toolName}`);
            }
          }
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("ships JSON schemas for every artifact produced by bundled pipeline manifests", async () => {
    const manifests = await loadAllBundledManifests();
    const missing: string[] = [];

    for (const manifest of manifests) {
      for (const stage of manifest.stages) {
        const artifacts = new Set([stage.produces, ...stage.produces_artifacts]);

        for (const artifact of artifacts) {
          if (!existsSync(path.join(bundledArtifactSchemasDir, `${artifact}.schema.json`))) {
            missing.push(`${manifest.slug}.${stage.slug}: ${artifact}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

async function loadBundledManifest(slug: string) {
  const raw = await readFile(path.join(bundledPipelinesDir, `${slug}.yaml`), "utf8");
  return PipelineManifestSchema.parse(parseYaml(raw));
}

async function loadAllBundledManifests() {
  const files = await readdir(bundledPipelinesDir);
  return Promise.all(
    files
      .filter((file) => file.endsWith(".yaml"))
      .sort((left, right) => left.localeCompare(right))
      .map((file) => loadBundledManifest(path.basename(file, ".yaml"))),
  );
}

function resolvePipelineSkill(skillPath: string): string {
  const normalized = skillPath.endsWith(".md") ? skillPath : `${skillPath}.md`;
  const relative = normalized.startsWith("pipelines/") ? normalized.slice("pipelines/".length) : normalized;
  return path.join(bundledPipelineSkillsDir, relative);
}
