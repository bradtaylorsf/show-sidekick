import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEpisode, loadShow } from "./load.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-show-load-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("show and episode loaders", () => {
  it("loads a show with absolute brand, characters, and skills paths", async () => {
    const root = await scratchProject();
    const showDir = await writeShow(root, "music-videos");

    const show = await loadShow(root, "music-videos");

    expect(show).toMatchObject({
      slug: "music-videos",
      projectRoot: root,
      rootDir: showDir,
      brand: path.join(showDir, "brand"),
      characters: path.join(showDir, "characters"),
      skills: path.join(showDir, "skills"),
      brandPath: path.join(showDir, "brand"),
      charactersDir: path.join(showDir, "characters"),
      skillsDir: path.join(showDir, "skills"),
    });
  });

  it("throws with the expected show.yaml path when a show is missing", async () => {
    const root = await scratchProject();
    const expectedPath = path.join(root, "shows", "missing", "show.yaml");

    await expect(loadShow(root, "missing")).rejects.toThrow(expectedPath);
  });

  it("loads an episode with file inputs resolved to absolute paths", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    const inputPath = path.join(root, "music_library", "song", "track.mp3");
    await mkdir(path.dirname(inputPath), { recursive: true });
    await writeFile(inputPath, "audio", "utf8");
    await writeEpisode(root, "music-videos", "pilot", {
      track: "music_library/song/track.mp3",
      notes: "Hook lands early",
    });

    const show = await loadShow(root, "music-videos");
    const episode = await loadEpisode(show, "pilot");

    expect(episode).toMatchObject({
      slug: "pilot",
      filePath: path.join(show.rootDir, "episodes", "pilot.yaml"),
      inputs: {
        track: inputPath,
        notes: "Hook lands early",
      },
    });
  });

  it("throws with the expected episode.yaml path when an episode is missing", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    const show = await loadShow(root, "music-videos");
    const expectedPath = path.join(show.rootDir, "episodes", "missing.yaml");

    await expect(loadEpisode(show, "missing")).rejects.toThrow(expectedPath);
  });

  it("reports missing input files with the input key and resolved path", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    await writeEpisode(root, "music-videos", "pilot", {
      track: "music_library/song/missing.mp3",
    });
    const show = await loadShow(root, "music-videos");
    const expectedPath = path.join(root, "music_library", "song", "missing.mp3");

    await expect(loadEpisode(show, "pilot")).rejects.toThrow(`inputs.track: file not found at ${expectedPath}`);
  });
});

async function writeShow(root: string, slug: string): Promise<string> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "Music Videos"',
      "created: 2026-05-12",
      "brand: ./brand/",
      "characters: ./characters/",
      "skills: ./skills/",
      "pipelines:",
      "  music-video: {}",
      "defaults:",
      "  pipeline: music-video",
      "",
    ].join("\n"),
    "utf8",
  );
  return showDir;
}

async function writeEpisode(
  root: string,
  showSlug: string,
  slug: string,
  inputs: Record<string, string>,
): Promise<void> {
  const inputLines = Object.entries(inputs).map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`);
  await writeFile(
    path.join(root, "shows", showSlug, "episodes", `${slug}.yaml`),
    [
      `slug: ${slug}`,
      'title: "Pilot"',
      "created: 2026-05-12",
      "inputs:",
      ...inputLines,
      "",
    ].join("\n"),
    "utf8",
  );
}
