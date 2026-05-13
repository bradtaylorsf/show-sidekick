import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadShow, type LoadedShow } from "../shows/load.js";
import { resolveSkill, SkillNotFoundError } from "./resolver.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-skill-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("skill resolver", () => {
  it("uses show director overrides before other tiers", async () => {
    const root = await scratchProject();
    const show = await writeAndLoadShow(root, "music-videos");
    await writeSkill(show.skillsDir!, "idea-director.md", "show override");
    await writeSkill(path.join(root, "skills", "pipelines", "music-video"), "idea-director.md", "project local");
    await writeSkill(
      path.join(root, ".predit", "skills", "pipelines", "music-video"),
      "idea-director.md",
      "bundled pipeline",
    );
    await writeSkill(
      path.join(root, ".predit", "skills", "pipelines", "_shared"),
      "idea-director.md",
      "bundled shared",
    );

    await expect(resolveSkill("director", "idea", { projectRoot: root, show, pipeline: "music-video" })).resolves.toEqual(
      {
        path: path.join(show.skillsDir!, "idea-director.md"),
        content: "show override",
        tier: "show",
      },
    );
  });

  it("uses project-local director overrides when no show override exists", async () => {
    const root = await scratchProject();
    const show = await writeAndLoadShow(root, "music-videos");
    const skillDir = path.join(root, "skills", "pipelines", "music-video");
    await writeSkill(skillDir, "script-director.md", "project local");
    await writeSkill(
      path.join(root, ".predit", "skills", "pipelines", "music-video"),
      "script-director.md",
      "bundled pipeline",
    );

    const skill = await resolveSkill("director", "script", { projectRoot: root, show, pipeline: "music-video" });

    expect(skill).toEqual({
      path: path.join(skillDir, "script-director.md"),
      content: "project local",
      tier: "project",
    });
  });

  it("falls back to bundled per-pipeline director skills", async () => {
    const root = await scratchProject();
    const show = await writeAndLoadShow(root, "music-videos");
    const skillDir = path.join(root, ".predit", "skills", "pipelines", "music-video");
    await writeSkill(skillDir, "assets-director.md", "bundled pipeline");
    await writeSkill(
      path.join(root, ".predit", "skills", "pipelines", "_shared"),
      "assets-director.md",
      "bundled shared",
    );

    const skill = await resolveSkill("director", "assets", { projectRoot: root, show, pipeline: "music-video" });

    expect(skill).toEqual({
      path: path.join(skillDir, "assets-director.md"),
      content: "bundled pipeline",
      tier: "bundled-pipeline",
    });
  });

  it("falls back to bundled shared director skills", async () => {
    const root = await scratchProject();
    const show = await writeAndLoadShow(root, "music-videos");
    const skillDir = path.join(root, ".predit", "skills", "pipelines", "_shared");
    await writeSkill(skillDir, "cuesheet-director.md", "bundled shared");

    const skill = await resolveSkill("director", "cuesheet", { projectRoot: root, show, pipeline: "music-video" });

    expect(skill).toEqual({
      path: path.join(skillDir, "cuesheet-director.md"),
      content: "bundled shared",
      tier: "bundled-shared",
    });
  });

  it("returns cached content for repeated resolutions of the same file", async () => {
    const root = await scratchProject();
    const show = await writeAndLoadShow(root, "music-videos");
    const skillDir = path.join(root, ".predit", "skills", "pipelines", "_shared");
    const skillPath = path.join(skillDir, "edit-director.md");
    await writeSkill(skillDir, "edit-director.md", "first version");

    const first = await resolveSkill("director", "edit", { projectRoot: root, show, pipeline: "music-video" });
    await writeFile(skillPath, "second version", "utf8");
    const second = await resolveSkill("director", "edit", { projectRoot: root, show, pipeline: "music-video" });

    expect(first.content).toBe("first version");
    expect(second.content).toBe(first.content);
  });

  it("lists all searched director skill paths when no candidate exists", async () => {
    const root = await scratchProject();
    const show = await writeAndLoadShow(root, "music-videos");
    const expectedPaths = [
      path.join(show.skillsDir!, "missing-director.md"),
      path.join(root, "skills", "pipelines", "music-video", "missing-director.md"),
      path.join(root, ".predit", "skills", "pipelines", "music-video", "missing-director.md"),
      path.join(root, ".predit", "skills", "pipelines", "_shared", "missing-director.md"),
    ];

    try {
      await resolveSkill("director", "missing", { projectRoot: root, show, pipeline: "music-video" });
      throw new Error("expected resolveSkill to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SkillNotFoundError);
      expect((error as SkillNotFoundError).searched).toEqual(expectedPaths);

      for (const expectedPath of expectedPaths) {
        expect((error as Error).message).toContain(expectedPath);
      }
    }
  });
});

async function writeAndLoadShow(root: string, slug: string): Promise<LoadedShow> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(showDir, { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "Music Videos"',
      "created: 2026-05-12",
      "skills: ./skills/",
      "pipelines:",
      "  music-video: {}",
      "defaults:",
      "  pipeline: music-video",
      "",
    ].join("\n"),
    "utf8",
  );
  return loadShow(root, slug);
}

async function writeSkill(dir: string, fileName: string, content: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fileName), content, "utf8");
}
