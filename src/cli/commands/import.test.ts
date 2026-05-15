import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const ingestWatchFixture = path.join(repoRoot, "bundled/fixtures/ingest-watch/thechaosfm-news/pilot");

async function scratchProject(options: { template?: boolean } = {}): Promise<string> {
  const root = path.join(tmpdir(), `predit-import-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  await writeShow(root, "thechaosfm", options);
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("import command", () => {
  it("imports a fixture folder into a new episode", async () => {
    const root = await scratchProject();
    const dropDir = await writeDropFixture(root);
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "import", dropDir, "--as", "thechaosfm/pilot"], {
      from: "node",
    });

    expect(output().stdout).toContain("import: wrote");
    const episodePath = path.join(root, "shows", "thechaosfm", "episodes", "pilot.yaml");
    const episode = parseYaml(await readFile(episodePath, "utf8")) as Record<string, unknown>;
    expect(episode).toMatchObject({
      slug: "pilot",
      title: "Pilot",
      pipeline: "news-song",
      inputs: {
        track: "music_library/thechaosfm-news/pilot/track.mp3",
        lyrics: "music_library/thechaosfm-news/pilot/lyrics.txt",
        sources: "music_library/thechaosfm-news/pilot/sources.yaml",
        reference: "music_library/thechaosfm-news/pilot/reference.mp4",
      },
      cast: [],
      tags: ["news-song"],
    });
  });

  it("uses ingest episode templates to preserve pipeline-specific input keys", async () => {
    const root = await scratchProject({ template: true });
    const dropDir = path.join(root, "music_library", "thechaosfm-news", "pilot");
    await mkdir(dropDir, { recursive: true });
    await writeFile(path.join(dropDir, "track.mp3"), "audio", "utf8");
    await writeFile(path.join(dropDir, "narration.txt"), "voiceover", "utf8");
    await writeFile(path.join(dropDir, "reference.jpg"), "image", "utf8");
    process.chdir(root);
    const { program } = captureProgram();

    await program.parseAsync(["node", "predit", "import", dropDir, "--as", "thechaosfm/pilot"], {
      from: "node",
    });

    const episodePath = path.join(root, "shows", "thechaosfm", "episodes", "pilot.yaml");
    const episode = parseYaml(await readFile(episodePath, "utf8")) as Record<string, unknown>;
    expect(episode.inputs).toMatchObject({
      track: "music_library/thechaosfm-news/pilot/track.mp3",
      narration: "music_library/thechaosfm-news/pilot/narration.txt",
      reference_image: "music_library/thechaosfm-news/pilot/reference.jpg",
    });
  });

  it("refuses to overwrite an existing episode", async () => {
    const root = await scratchProject();
    const dropDir = await writeDropFixture(root);
    await mkdir(path.join(root, "shows", "thechaosfm", "episodes"), { recursive: true });
    await writeFile(path.join(root, "shows", "thechaosfm", "episodes", "pilot.yaml"), "slug: pilot\n", "utf8");
    process.chdir(root);
    const { program } = captureProgram();

    await expect(
      program.parseAsync(["node", "predit", "import", dropDir, "--as", "thechaosfm/pilot"], { from: "node" }),
    ).rejects.toThrow("refuses to clobber existing episode");
  });

  it("errors clearly when the path matches no ingest watch entry", async () => {
    const root = await scratchProject();
    const dropDir = path.join(root, "music_library", "other", "pilot");
    await mkdir(dropDir, { recursive: true });
    await writeFile(path.join(dropDir, "track.mp3"), "audio", "utf8");
    process.chdir(root);
    const { program } = captureProgram();

    await expect(
      program.parseAsync(["node", "predit", "import", dropDir, "--as", "thechaosfm/pilot"], { from: "node" }),
    ).rejects.toThrow("no ingest.watch[] entry");
  });

  it("errors when the requested show is unknown", async () => {
    const root = await scratchProject();
    const dropDir = await writeDropFixture(root);
    process.chdir(root);
    const { program } = captureProgram();

    await expect(
      program.parseAsync(["node", "predit", "import", dropDir, "--as", "missing/pilot"], { from: "node" }),
    ).rejects.toThrow(path.join(root, "shows", "missing", "show.yaml"));
  });

  it("emits a parseable JSON event", async () => {
    const root = await scratchProject();
    const dropDir = await writeDropFixture(root);
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "import", dropDir, "--as", "thechaosfm/pilot"], {
      from: "node",
    });

    const event = JSON.parse(output().stdout.trim()) as {
      event: string;
      show: string;
      episode: string;
      pipeline: string;
      path: string;
      inputs: Record<string, string>;
    };
    expect(event).toEqual({
      event: "episode_imported",
      show: "thechaosfm",
      episode: "pilot",
      pipeline: "news-song",
      path: await realpath(path.join(root, "shows", "thechaosfm", "episodes", "pilot.yaml")),
      inputs: {
        track: "music_library/thechaosfm-news/pilot/track.mp3",
        lyrics: "music_library/thechaosfm-news/pilot/lyrics.txt",
        reference: "music_library/thechaosfm-news/pilot/reference.mp4",
        sources: "music_library/thechaosfm-news/pilot/sources.yaml",
      },
    });
  });
});

function captureProgram() {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
    stdout: {
      write: (value: string) => {
        stdout += value;
        return true;
      },
    },
    stderr: {
      write: (value: string) => {
        stderr += value;
        return true;
      },
    },
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}

async function writeShow(root: string, slug: string, options: { template?: boolean } = {}): Promise<void> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  const ingestLines = options.template
    ? ["ingest:", "  episode_template: ./episode.template.yaml", "  watch:"]
    : ["ingest:", "  watch:"];

  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "The Chaos FM"',
      "created: 2026-05-12",
      "pipelines:",
      "  news-song: {}",
      "defaults:",
      "  pipeline: news-song",
      ...ingestLines,
      "    - path: ../../music_library/thechaosfm-news",
      '      match: "**/track.mp3"',
      "      pipeline: news-song",
      "      slug_from: parent_dir",
      "",
    ].join("\n"),
    "utf8",
  );

  if (options.template) {
    await writeFile(
      path.join(showDir, "episode.template.yaml"),
      [
        "slug: sample-episode",
        'title: "Template"',
        "created: 2026-05-12",
        "pipeline: news-song",
        "inputs:",
        "  track: shows/thechaosfm/inputs/sample-episode/track.mp3",
        "  narration: shows/thechaosfm/inputs/sample-episode/narration.txt",
        "  reference_image: shows/thechaosfm/inputs/sample-episode/reference.jpg",
        "cast: []",
        "tags: [template]",
        "",
      ].join("\n"),
      "utf8",
    );
  }
}

async function writeDropFixture(root: string): Promise<string> {
  const dropDir = path.join(root, "music_library", "thechaosfm-news", "pilot");
  await mkdir(path.dirname(dropDir), { recursive: true });
  await cp(ingestWatchFixture, dropDir, { recursive: true });
  return dropDir;
}
