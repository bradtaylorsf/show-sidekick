import { randomUUID } from "node:crypto";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDING } from "../../branding.js";
import { createWatchHandler, type WatchFactory } from "./watch.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const ingestWatchFixture = path.join(repoRoot, "bundled/fixtures/ingest-watch/thechaosfm-news/pilot");

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-watch-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("watch command", () => {
  it("prints a suggested import command for a matching drop", async () => {
    const root = await scratchProject();
    await writeShow(root, "thechaosfm");
    await writeDropFixture(root);
    process.chdir(root);
    const { io, output } = captureIo();
    const watch: WatchFactory = async function* (_rootPath) {
      yield { eventType: "rename", filename: path.join("pilot", "track.mp3") };
    };

    await createWatchHandler(io, { watch })(command({}));

    expect(output().stdout).toContain(
      `${BRANDING.primaryCli} import music_library/thechaosfm-news/pilot/track.mp3 --as thechaosfm/pilot`,
    );
  });

  it("emits a JSON event for a matching drop", async () => {
    const root = await scratchProject();
    await writeShow(root, "thechaosfm");
    await writeDropFixture(root);
    process.chdir(root);
    const { io, output } = captureIo();
    const watch: WatchFactory = async function* () {
      yield { eventType: "rename", filename: path.join("pilot", "track.mp3") };
    };

    await createWatchHandler(io, { watch })(command({ json: true }));

    const event = JSON.parse(output().stdout.trim()) as {
      event: string;
      show: string;
      pipeline: string;
      path: string;
      suggested_command: string;
    };
    expect(event).toEqual({
      event: "drop_detected",
      show: "thechaosfm",
      pipeline: "news-song",
      path: "music_library/thechaosfm-news/pilot/track.mp3",
      suggested_command: `${BRANDING.primaryCli} import music_library/thechaosfm-news/pilot/track.mp3 --as thechaosfm/pilot`,
    });
  });

  it("exits cleanly when no shows configure ingest watches", async () => {
    const root = await scratchProject();
    await writeShow(root, "empty-show", { ingest: false });
    process.chdir(root);
    const { io, output } = captureIo();

    await createWatchHandler(io)(command({}));

    expect(output().stdout).toBe("watch: no ingest.watch entries configured\n");
  });
});

function captureIo() {
  let stdout = "";
  let stderr = "";

  return {
    io: {
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
    },
    output: () => ({ stdout, stderr }),
  };
}

function command(options: Record<string, unknown>): Command {
  return {
    optsWithGlobals: () => options,
  } as unknown as Command;
}

async function writeShow(root: string, slug: string, options: { ingest?: boolean } = {}): Promise<void> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  const ingestLines =
    options.ingest === false
      ? []
      : [
          "ingest:",
          "  watch:",
          "    - path: ../../music_library/thechaosfm-news",
          '      match: "**/track.mp3"',
          "      pipeline: news-song",
          "      slug_from: parent_dir",
        ];

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
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeDropFixture(root: string): Promise<void> {
  const dropDir = path.join(root, "music_library", "thechaosfm-news", "pilot");
  await mkdir(path.dirname(dropDir), { recursive: true });
  await cp(ingestWatchFixture, dropDir, { recursive: true });
}
