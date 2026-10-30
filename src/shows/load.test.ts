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

  it("preserves URL and prose inputs instead of resolving them as files", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    await writeEpisode(root, "music-videos", "reference", {
      reference: "https://youtube.com/watch?v=x",
      source: "docs.google.com/document/d/example",
      handle: "twitter.com",
      brief: "Hook lands at 0:18.",
    });

    const show = await loadShow(root, "music-videos");
    const episode = await loadEpisode(show, "reference");

    expect(episode.inputs).toEqual({
      reference: "https://youtube.com/watch?v=x",
      source: "docs.google.com/document/d/example",
      handle: "twitter.com",
      brief: "Hook lands at 0:18.",
    });
  });

  it("leaves inputs.reference unresolved for the reference workflow", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    await writeEpisode(root, "music-videos", "reference-file", {
      reference: "reference.mp4",
    });

    const show = await loadShow(root, "music-videos");
    const episode = await loadEpisode(show, "reference-file");

    expect(episode.inputs.reference).toBe("reference.mp4");
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
    const fromEpisode = path.join(show.rootDir, "episodes", "music_library", "song", "missing.mp3");
    const fromRoot = path.join(root, "music_library", "song", "missing.mp3");

    const error = await loadEpisode(show, "pilot").catch((caught: unknown) => caught as Error);

    expect(error.message).toContain("inputs.track: file not found for 'music_library/song/missing.mp3'");
    expect(error.message).toContain(`${fromEpisode} (relative to the episode file's folder, ${path.join(show.rootDir, "episodes")})`);
    expect(error.message).toContain(`${fromRoot} (relative to the project root, ${root})`);
  });

  it("resolves ../ input paths relative to the episode YAML's folder", async () => {
    const root = await scratchProject();
    await writeShow(root, "docs");
    const inputPath = path.join(root, "episodes", "ep01", "script.md");
    await mkdir(path.dirname(inputPath), { recursive: true });
    await writeFile(inputPath, "# script", "utf8");
    await writeEpisode(root, "docs", "ep01", { script: "../../../episodes/ep01/script.md" });

    const episode = await loadEpisode(await loadShow(root, "docs"), "ep01");

    expect(episode.inputs.script).toBe(inputPath);
  });

  it("prefers the episode folder over the project root when both exist", async () => {
    const root = await scratchProject();
    const showDir = await writeShow(root, "docs");
    const besideEpisode = path.join(showDir, "episodes", "inputs", "track.wav");
    const atRoot = path.join(root, "inputs", "track.wav");
    for (const file of [besideEpisode, atRoot]) {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, "audio", "utf8");
    }
    await writeEpisode(root, "docs", "ep02", { track: "inputs/track.wav" });

    const episode = await loadEpisode(await loadShow(root, "docs"), "ep02");

    expect(episode.inputs.track).toBe(besideEpisode);
  });

  it("keeps absolute input paths as written", async () => {
    const root = await scratchProject();
    await writeShow(root, "docs");
    const inputPath = path.join(root, "elsewhere", "narration.wav");
    await mkdir(path.dirname(inputPath), { recursive: true });
    await writeFile(inputPath, "audio", "utf8");
    await writeEpisode(root, "docs", "ep03", { narration: inputPath });

    const episode = await loadEpisode(await loadShow(root, "docs"), "ep03");

    expect(episode.inputs.narration).toBe(inputPath);
  });

  it("names the create commands when an episode file is missing", async () => {
    const root = await scratchProject();
    await writeShow(root, "music-videos");
    const show = await loadShow(root, "music-videos");

    await expect(loadEpisode(show, "new-song")).rejects.toThrow(
      "showkick import <path> --as music-videos/new-song",
    );
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
