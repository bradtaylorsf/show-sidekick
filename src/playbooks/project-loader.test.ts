import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../config/errors.js";
import { loadProjectPlaybook } from "./project-loader.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("loadProjectPlaybook", () => {
  it("loads and validates project-local playbooks against the PBK schema", async () => {
    const root = await scratchProject();
    await writeFile(path.join(root, "playbooks", "custom.yaml"), validPlaybookYaml(), "utf8");

    const playbook = await loadProjectPlaybook(root, "custom");

    expect(playbook).toMatchObject({
      identity: {
        name: "Custom Look",
        category: "custom",
      },
    });
  });

  it("returns undefined when no project playbook exists", async () => {
    const root = await scratchProject();

    await expect(loadProjectPlaybook(root, "missing")).resolves.toBeUndefined();
  });

  it("rejects invalid project playbooks", async () => {
    const root = await scratchProject();
    await writeFile(path.join(root, "playbooks", "bad.yaml"), "identity: {}\n", "utf8");

    await expect(loadProjectPlaybook(root, "bad")).rejects.toBeInstanceOf(ConfigError);
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-playbook-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, "playbooks"), { recursive: true });
  return root;
}

function validPlaybookYaml(): string {
  return [
    "identity:",
    "  name: Custom Look",
    "  category: custom",
    "  mood: precise",
    "  pace: moderate",
    "visual_language:",
    "  color_palette:",
    "    primary: ['#111111']",
    "    accent: ['#ffcc00']",
    "    background: '#ffffff'",
    "    text: '#000000'",
    "  composition: centered editorial frames",
    "  texture: clean paper",
    "typography:",
    "  headings:",
    "    font: Inter",
    "  body:",
    "    font: Inter",
    "motion:",
    "  transitions: [cut]",
    "  animation_style: restrained motion",
    "  pacing_rules:",
    "    min_scene_hold_seconds: 2",
    "    max_scene_hold_seconds: 6",
    "audio:",
    "  voice_style: calm",
    "  music_mood: light pulse",
    "  music_volume: 0.4",
    "asset_generation:",
    "  image_prompt_prefix: clean editorial",
    "  consistency_anchors: [centered]",
    "quality_rules:",
    "  - keep typography readable",
    "",
  ].join("\n");
}
