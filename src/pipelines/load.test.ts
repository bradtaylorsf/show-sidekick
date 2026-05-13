import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPipeline } from "./load.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-pipeline-load-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("pipeline loader", () => {
  it("loads project-local pipeline manifests before cached manifests", async () => {
    const root = await scratchProject();
    await writePipeline(root, "pipelines", "framework-smoke", "Local Framework Smoke");
    await writePipeline(root, ".predit/pipelines", "framework-smoke", "Cached Framework Smoke");

    const pipeline = await loadPipeline(root, "framework-smoke");

    expect(pipeline.display_name).toBe("Local Framework Smoke");
  });

  it("falls back to cached pipeline manifests", async () => {
    const root = await scratchProject();
    await writePipeline(root, ".predit/pipelines", "framework-smoke", "Cached Framework Smoke");

    const pipeline = await loadPipeline(root, "framework-smoke");

    expect(pipeline.display_name).toBe("Cached Framework Smoke");
  });

  it("returns a typed pipeline with schema defaults", async () => {
    const root = await scratchProject();
    await writePipeline(root, "pipelines", "framework-smoke", "Framework Smoke");

    const pipeline = await loadPipeline(root, "framework-smoke");

    expect(pipeline).toMatchObject({
      slug: "framework-smoke",
      display_name: "Framework Smoke",
      stages: [
        {
          slug: "research",
          tools_available: [],
          review_focus: [],
          success_criteria: [],
          human_approval: "optional",
        },
        {
          slug: "script",
          human_approval: "optional",
        },
      ],
      orchestration: {
        budget_default_usd: 3,
        max_revisions_per_stage: 2,
        max_send_backs: 3,
        max_wall_time_minutes: 30,
      },
    });
  });

  it("accepts success criteria that reference declared stages", async () => {
    const root = await scratchProject();
    await writePipeline(root, "pipelines", "framework-smoke", "Framework Smoke", [
      "      - script.line_count: '>= 4'",
    ]);

    await expect(loadPipeline(root, "framework-smoke")).resolves.toMatchObject({
      slug: "framework-smoke",
    });
  });

  it("rejects success criteria that reference unknown stages", async () => {
    const root = await scratchProject();
    await writePipeline(root, "pipelines", "framework-smoke", "Framework Smoke", [
      "      - cuesheet.beats_detected: true",
    ]);

    await expect(loadPipeline(root, "framework-smoke")).rejects.toThrow(
      "unknown stage 'cuesheet' referenced in success_criteria key 'cuesheet.beats_detected'",
    );
  });

  it("reports both expected paths when a manifest is missing", async () => {
    const root = await scratchProject();
    const localPath = path.join(root, "pipelines", "missing.yaml");
    const bundledPath = path.join(root, ".predit", "pipelines", "missing.yaml");

    await expect(loadPipeline(root, "missing")).rejects.toThrow(localPath);
    await expect(loadPipeline(root, "missing")).rejects.toThrow(bundledPath);
  });
});

async function writePipeline(
  root: string,
  parent: string,
  slug: string,
  displayName: string,
  scriptSuccessCriteria: string[] = [],
): Promise<void> {
  const dir = path.join(root, parent);
  await mkdir(dir, { recursive: true });
  const successCriteriaLines =
    scriptSuccessCriteria.length > 0 ? ["    success_criteria:", ...scriptSuccessCriteria] : [];

  await writeFile(
    path.join(dir, `${slug}.yaml`),
    [
      `slug: ${slug}`,
      `display_name: ${JSON.stringify(displayName)}`,
      "stages:",
      "  - slug: research",
      "    skill: pipelines/framework-smoke/research-director.md",
      "    produces: research_brief",
      "  - slug: script",
      "    skill: pipelines/framework-smoke/script-director.md",
      "    produces: script",
      ...successCriteriaLines,
      "",
    ].join("\n"),
    "utf8",
  );
}
