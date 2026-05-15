import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPipeline } from "../../pipelines/load.js";
import { loadEpisode, loadShow } from "../../shows/load.js";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-new-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("new command", () => {
  it("creates a show that round-trips through the show schema", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "new", "show", "the-show"], { from: "node" });

    const event = JSON.parse(output().stdout.trim()) as { event: string; slug: string; path: string };
    expect(event).toEqual(expect.objectContaining({ event: "show_created", slug: "the-show" }));
    await expect(loadShow(root, "the-show")).resolves.toMatchObject({
      slug: "the-show",
      defaults: { pipeline: "default" },
      pipelines: { default: {} },
    });
  });

  it("creates a multi-pipeline show from --pipelines", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program } = captureProgram();
    await program.parseAsync(
      ["node", "predit", "new", "show", "channel", "--pipelines", "news-song,music-video"],
      { from: "node" },
    );

    const show = await loadShow(root, "channel");
    expect(Object.keys(show.pipelines)).toEqual(["news-song", "music-video"]);
    expect(show.defaults.pipeline).toBe("news-song");
  });

  it("creates a show from a starter without clobbering starter show.yaml", async () => {
    const root = await scratchProject();
    await writeStarter(root, "example");
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "new", "show", "from-starter", "--from", "example"], {
      from: "node",
    });

    const event = JSON.parse(output().stdout.trim()) as { event: string; pipelines: string[] };
    expect(event).toEqual(expect.objectContaining({ event: "show_created", pipelines: ["cinematic"] }));
    const show = await loadShow(root, "from-starter");
    expect(show).toMatchObject({
      slug: "from-starter",
      defaults: { pipeline: "cinematic" },
      pipelines: {
        cinematic: {
          playbook: "moody-cinematic",
          runtime: "remotion",
          aspect: "16:9",
        },
      },
    });
    expect(show.pipelines).not.toHaveProperty("default");
  });

  it("rewrites starter sample paths when cloning to a custom show slug", async () => {
    const root = await scratchProject();
    await writeStarter(root, "music-video");
    process.chdir(root);

    const { program } = captureProgram();
    await program.parseAsync(["node", "predit", "new", "show", "custom-show", "--from", "music-video"], {
      from: "node",
    });

    await expect(readFile(path.join(root, "shows", "custom-show", "episodes", "sample-episode.yaml"), "utf8")).resolves.toContain(
      "shows/custom-show/inputs/sample-episode/track.wav",
    );
    await expect(readFile(path.join(root, "shows", "custom-show", "episode.template.yaml"), "utf8")).resolves.toContain(
      "shows/custom-show/inputs/sample-episode/track.wav",
    );
  });

  it("throws when a requested starter is missing", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program } = captureProgram();

    await expect(
      program.parseAsync(["node", "predit", "new", "show", "missing", "--from", "nope"], { from: "node" }),
    ).rejects.toThrow(path.join(root, ".predit", "starters", "nope"));
  });

  it("refuses to clobber an existing show directory", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, "shows", "existing"), { recursive: true });
    process.chdir(root);

    const { program } = captureProgram();

    await expect(program.parseAsync(["node", "predit", "new", "show", "existing"], { from: "node" })).rejects.toThrow(
      "refuses to clobber existing show",
    );
  });

  it("creates an episode with a pipeline validated against show.pipelines", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program } = captureProgram();
    await program.parseAsync(
      ["node", "predit", "new", "show", "channel", "--pipelines", "news-song,music-video"],
      { from: "node" },
    );
    await program.parseAsync(["node", "predit", "new", "episode", "channel", "pilot", "--pipeline", "music-video"], {
      from: "node",
    });

    const show = await loadShow(root, "channel");
    await expect(loadEpisode(show, "pilot")).resolves.toMatchObject({
      slug: "pilot",
      pipeline: "music-video",
    });

    await expect(
      program.parseAsync(["node", "predit", "new", "episode", "channel", "bad", "--pipeline", "missing"], {
        from: "node",
      }),
    ).rejects.toThrow("episode.pipeline 'missing' is not a key in show.pipelines");
  });

  it("creates pipeline and playbook stubs and refuses to clobber them", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program } = captureProgram();
    await program.parseAsync(["node", "predit", "new", "pipeline", "local-pipeline"], { from: "node" });
    await expect(loadPipeline(root, "local-pipeline")).resolves.toMatchObject({
      slug: "local-pipeline",
      stages: [expect.objectContaining({ slug: "idea" })],
    });
    await expect(
      program.parseAsync(["node", "predit", "new", "pipeline", "local-pipeline"], { from: "node" }),
    ).rejects.toThrow("refuses to clobber existing pipeline");

    await program.parseAsync(["node", "predit", "new", "playbook", "look"], { from: "node" });
    await expect(program.parseAsync(["node", "predit", "new", "playbook", "look"], { from: "node" })).rejects.toThrow(
      "refuses to clobber existing playbook",
    );
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

async function writeStarter(root: string, name: string): Promise<void> {
  const starterDir = path.join(root, ".predit", "starters", name);
  await mkdir(path.join(starterDir, "brand"), { recursive: true });
  await mkdir(path.join(starterDir, "episodes"), { recursive: true });
  await mkdir(path.join(starterDir, "inputs", "sample-episode"), { recursive: true });
  await writeFile(
    path.join(starterDir, "show.yaml"),
    [
      "slug: starter-template",
      'display_name: "Starter Template"',
      "created: 2026-05-12",
      "brand: ./brand/",
      "pipelines:",
      "  cinematic:",
      "    playbook: moody-cinematic",
      "    runtime: remotion",
      '    aspect: "16:9"',
      "defaults:",
      "  pipeline: cinematic",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(path.join(starterDir, "inputs", "sample-episode", "track.wav"), "audio\n", "utf8");
  await writeFile(
    path.join(starterDir, "episode.template.yaml"),
    [
      "slug: sample-episode",
      'title: "Sample"',
      "created: 2026-05-12",
      "pipeline: cinematic",
      "inputs:",
      `  track: shows/${name}/inputs/sample-episode/track.wav`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(starterDir, "episodes", "sample-episode.yaml"),
    [
      "slug: sample-episode",
      'title: "Sample"',
      "created: 2026-05-12",
      "pipeline: cinematic",
      "inputs:",
      `  track: shows/${name}/inputs/sample-episode/track.wav`,
      "",
    ].join("\n"),
    "utf8",
  );
}
