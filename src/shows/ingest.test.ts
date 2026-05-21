import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compileGlobMatcher,
  deriveInputs,
  deriveSlug,
  loadAllShowIngest,
  matchDropToWatch,
  resolveDropMatch,
} from "./ingest.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-ingest-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("ingest helpers", () => {
  it("compiles watch globs without matching suffix lookalikes", () => {
    const matcher = compileGlobMatcher("**/track.mp3");

    expect(matcher("pilot/track.mp3")).toBe(true);
    expect(matcher("track.mp3")).toBe(true);
    expect(matcher("pilot/track.mp3.bak")).toBe(false);
  });

  it("loads each show's configured watch entries with absolute roots", async () => {
    const root = await scratchProject();
    await writeShow(root, "news-lab");

    const entries = await loadAllShowIngest(root);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      absolutePath: path.join(root, "music_library", "news-song-drops"),
      show: expect.objectContaining({ slug: "news-lab" }),
      watchEntry: expect.objectContaining({ pipeline: "news-song" }),
    });
  });

  it("matches drops only when they are under the watched path and satisfy the matcher", async () => {
    const root = await scratchProject();
    await writeShow(root, "news-lab");
    const entries = await loadAllShowIngest(root);
    const track = path.join(root, "music_library", "news-song-drops", "pilot", "track.mp3");
    const backup = path.join(root, "music_library", "news-song-drops", "pilot", "track.mp3.bak");
    const outside = path.join(root, "music_library", "other", "pilot", "track.mp3");

    expect(matchDropToWatch(track, entries)?.watchEntry.pipeline).toBe("news-song");
    expect(matchDropToWatch(backup, entries)).toBeNull();
    expect(matchDropToWatch(outside, entries)).toBeNull();
  });

  it("resolves a dropped folder to the matching file inside it", async () => {
    const root = await scratchProject();
    await writeShow(root, "news-lab");
    const dropDir = path.join(root, "music_library", "news-song-drops", "pilot");
    await mkdir(dropDir, { recursive: true });
    await writeFile(path.join(dropDir, "track.mp3"), "audio", "utf8");
    await writeFile(path.join(dropDir, "track.mp3.bak"), "backup", "utf8");
    const entries = await loadAllShowIngest(root);

    const match = await resolveDropMatch(dropDir, entries);

    expect(match).toMatchObject({
      matchedFilePath: path.join(dropDir, "track.mp3"),
      watchEntry: expect.objectContaining({ pipeline: "news-song" }),
    });
  });

  it("derives slugs from parent directory, filename, and rejects prompt slugs", () => {
    const track = path.join("music_library", "show", "pilot", "track.mp3");

    expect(deriveSlug(track, { path: ".", match: "**/track.mp3", pipeline: "news-song" })).toBe("pilot");
    expect(
      deriveSlug(track, { path: ".", match: "**/track.mp3", pipeline: "news-song", slug_from: "filename" }),
    ).toBe("track");
    expect(() =>
      deriveSlug(track, { path: ".", match: "**/track.mp3", pipeline: "news-song", slug_from: "prompt" }),
    ).toThrow("slug_from: prompt requires --slug");
  });

  it("derives inputs from the matched file and sibling fixture files", async () => {
    const root = await scratchProject();
    await writeShow(root, "news-lab");
    const dropDir = path.join(root, "music_library", "news-song-drops", "pilot");
    await mkdir(dropDir, { recursive: true });
    await writeFile(path.join(dropDir, "track.mp3"), "audio", "utf8");
    await writeFile(path.join(dropDir, "lyrics.txt"), "lyrics", "utf8");
    await writeFile(path.join(dropDir, "sources.yaml"), "sources: []\n", "utf8");
    await writeFile(path.join(dropDir, "reference.mov"), "video", "utf8");
    const entries = await loadAllShowIngest(root);
    const match = await resolveDropMatch(path.join(dropDir, "track.mp3"), entries);

    expect(match).not.toBeNull();
    await expect(deriveInputs(match!.matchedFilePath, match!)).resolves.toEqual({
      track: "music_library/news-song-drops/pilot/track.mp3",
      lyrics: "music_library/news-song-drops/pilot/lyrics.txt",
      reference: "music_library/news-song-drops/pilot/reference.mov",
      sources: "music_library/news-song-drops/pilot/sources.yaml",
    });
  });
});

async function writeShow(root: string, slug: string): Promise<void> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "News Lab"',
      "created: 2026-05-12",
      "pipelines:",
      "  news-song: {}",
      "defaults:",
      "  pipeline: news-song",
      "ingest:",
      "  watch:",
      "    - path: ../../music_library/news-song-drops",
      '      match: "**/track.mp3"',
      "      pipeline: news-song",
      "      slug_from: parent_dir",
      "",
    ].join("\n"),
    "utf8",
  );
}
