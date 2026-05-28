import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDING, LEGACY_BRANDING } from "../branding.js";
import { InvalidResourceNameError, InvalidShowEpisodeError, ProjectRootNotFoundError } from "./errors.js";
import { findProjectRoot, migrateLegacyProjectCache, parseShowEpisode, projectPaths, resolve } from "./project.js";

let scratchDirs: string[] = [];

async function scratchProject(markRoot = true): Promise<string> {
  const root = path.join(tmpdir(), `predit-paths-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });

  if (markRoot) {
    await writeFile(path.join(root, "AGENTS.md"), "# project\n", "utf8");
    await mkdir(path.join(root, BRANDING.cacheDir), { recursive: true });
  }

  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("project paths", () => {
  it("finds a project root in cwd", async () => {
    const root = await scratchProject();

    expect(findProjectRoot(root)).toBe(root);
  });

  it("finds a project root in an ancestor", async () => {
    const root = await scratchProject();
    const child = path.join(root, "shows", "demo");
    await mkdir(child, { recursive: true });

    expect(findProjectRoot(child)).toBe(root);
  });

  it("recognizes the public project root marker and cache", async () => {
    const root = await scratchProject(false);
    await writeFile(path.join(root, "AGENTS.md"), "# agents\n", "utf8");
    await mkdir(path.join(root, BRANDING.cacheDir), { recursive: true });

    expect(findProjectRoot(root)).toBe(root);
  });

  it("recognizes a shared scaffold before the gitignored cache is restored", async () => {
    const root = await scratchProject(false);
    await writeFile(path.join(root, "AGENTS.md"), "# agents\n", "utf8");
    await writeFile(path.join(root, ".env.example"), "OPENAI_API_KEY=\n", "utf8");

    expect(findProjectRoot(root)).toBe(root);
  });

  it("throws a structured error when no project root is found", async () => {
    const root = await scratchProject(false);

    expect(() => findProjectRoot(root)).toThrow(ProjectRootNotFoundError);
    expect(() => findProjectRoot(root)).toThrow(`${BRANDING.primaryCli} init`);
  });

  it("returns absolute project paths", async () => {
    const root = await scratchProject();

    expect(projectPaths(root)).toMatchObject({
      shows: path.join(root, "shows"),
      pipelines: path.join(root, "pipelines"),
      playbooks: path.join(root, "playbooks"),
      skills: path.join(root, "skills"),
      cache: path.join(root, BRANDING.cacheDir),
      projects: path.join(root, "projects"),
      inputs: path.join(root, "inputs"),
      musicLibrary: path.join(root, "music_library"),
    });
  });

  it("resolves local overrides before cached resources", async () => {
    const root = await scratchProject();
    const local = path.join(root, "pipelines");
    const cache = path.join(root, BRANDING.cacheDir, "pipelines");
    await mkdir(local, { recursive: true });
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(local, "music-video.yaml"), "local: true\n", "utf8");
    await writeFile(path.join(cache, "music-video.yaml"), "cache: true\n", "utf8");

    expect(resolve("pipelines", "music-video", root)).toBe(path.join(local, "music-video.yaml"));
  });

  it("falls back to cached resources", async () => {
    const root = await scratchProject();
    const cache = path.join(root, BRANDING.cacheDir, "skills");
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, "director.md"), "# director\n", "utf8");

    expect(resolve("skills", "director", root)).toBe(path.join(cache, "director.md"));
  });

  it("parses show and episode specs into absolute paths", async () => {
    const root = await scratchProject();

    expect(parseShowEpisode("music-videos/midnight-train", root)).toEqual({
      show: "music-videos",
      episode: "midnight-train",
      showDir: path.join(root, "shows", "music-videos"),
      episodeFile: path.join(root, "shows", "music-videos", "episodes", "midnight-train.yaml"),
    });
  });

  it("rejects invalid show and episode specs", async () => {
    const root = await scratchProject();

    expect(() => parseShowEpisode("bad", root)).toThrow(InvalidShowEpisodeError);
    expect(() => parseShowEpisode("bad/", root)).toThrow(InvalidShowEpisodeError);
  });

  it("rejects show or episode segments that try to escape the project", async () => {
    const root = await scratchProject();

    expect(() => parseShowEpisode("../etc/passwd", root)).toThrow(InvalidShowEpisodeError);
    expect(() => parseShowEpisode("show/..", root)).toThrow(InvalidShowEpisodeError);
    expect(() => parseShowEpisode("show/.", root)).toThrow(InvalidShowEpisodeError);
  });

  it("rejects resource names that escape their resource directory", async () => {
    const root = await scratchProject();

    expect(() => resolve("shows", "../../etc/passwd", root)).toThrow(InvalidResourceNameError);
    expect(() => resolve("pipelines", "..", root)).toThrow(InvalidResourceNameError);
  });

  it("migrates a legacy cache to the public cache directory", async () => {
    const root = await scratchProject(false);
    await writeFile(path.join(root, "AGENTS.md"), "# project\n", "utf8");
    await mkdir(path.join(root, LEGACY_BRANDING.cacheDir, "pipelines"), { recursive: true });
    await writeFile(path.join(root, LEGACY_BRANDING.cacheDir, "pipelines", "demo.yaml"), "legacy: true\n", "utf8");

    await expect(migrateLegacyProjectCache(root)).resolves.toBe("migrated");
    expect(resolve("pipelines", "demo", root)).toBe(path.join(root, BRANDING.cacheDir, "pipelines", "demo.yaml"));
    expect(findProjectRoot(root)).toBe(root);
  });
});
