import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEpisode, loadShow } from "../../shows/load.js";
import { loadRunTargetInput } from "../commands/run-target.js";
import { findWatchedDrop, materializeEpisodeFromIngest } from "./from-drop.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("episodes from watched drops", () => {
  it("materializes a nested watched track.wav into a loadable episode", async () => {
    const root = await scratchProject();
    await writeShow(root);
    const track = await writeTrack(root, "daily/2026-05-30/01-house-always-buys");
    const show = await loadShow(root, "the-chaos");

    const written = await materializeEpisodeFromIngest(show, "01-house-always-buys");

    expect(written).toMatchObject({
      path: path.join(root, "shows", "the-chaos", "episodes", "01-house-always-buys.yaml"),
      pipeline: "news-song",
      source: track,
    });
    const episode = await loadEpisode(show, "01-house-always-buys");
    expect(episode.pipeline).toBe("news-song");
    expect(episode.inputs.track).toBe(track);
  });

  it("leaves an existing episode alone and returns null when nothing matches", async () => {
    const root = await scratchProject();
    await writeShow(root);
    await writeTrack(root, "daily/2026-05-30/01-house-always-buys");
    const episodeFile = path.join(root, "shows", "the-chaos", "episodes", "01-house-always-buys.yaml");
    await writeFile(episodeFile, "slug: 01-house-always-buys\ntitle: Hand written\ncreated: 2026-05-30\n", "utf8");
    const show = await loadShow(root, "the-chaos");

    await expect(materializeEpisodeFromIngest(show, "01-house-always-buys")).resolves.toBeNull();
    await expect(materializeEpisodeFromIngest(show, "no-such-song")).resolves.toBeNull();
    await expect(findWatchedDrop(show, "no-such-song")).resolves.toBeNull();
    expect(await readFile(episodeFile, "utf8")).toContain("Hand written");
  });

  it("lets build's target loader create the missing episode and report it", async () => {
    const root = await scratchProject();
    await writeShow(root);
    await writeTrack(root, "daily/2026-05-30/02-second-song");
    process.chdir(root);
    const reported: string[] = [];

    const input = await loadRunTargetInput("the-chaos/02-second-song", {
      materializeFromIngest: true,
      onMaterialized: (episode) => reported.push(episode.path),
    });

    expect(input.episode.slug).toBe("02-second-song");
    expect(reported).toEqual([path.join(root, "shows", "the-chaos", "episodes", "02-second-song.yaml")]);
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-from-drop-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

async function writeShow(root: string): Promise<void> {
  const showDir = path.join(root, "shows", "the-chaos");
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      "slug: the-chaos",
      'display_name: "The Chaos"',
      "created: 2026-05-12",
      "pipelines:",
      "  news-song: {}",
      "defaults:",
      "  pipeline: news-song",
      "ingest:",
      "  watch:",
      "    - path: ./inputs/",
      '      match: "**/track.wav"',
      "      pipeline: news-song",
      "      slug_from: parent_dir",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeTrack(root: string, relativeDir: string): Promise<string> {
  const dir = path.join(root, "shows", "the-chaos", "inputs", relativeDir);
  await mkdir(dir, { recursive: true });
  const track = path.join(dir, "track.wav");
  await writeFile(track, "audio", "utf8");
  return track;
}
