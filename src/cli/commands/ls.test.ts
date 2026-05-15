import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST_INVENTORY_SLUGS } from "../../pipelines/demo-inventory.js";
import { Registry, type Tool } from "../../registry/index.js";
import { createProgram } from "../program.js";
import { createLsHandler } from "./ls.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-ls-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  return root;
}

async function emptyScratchDir(): Promise<string> {
  const root = path.join(tmpdir(), `predit-ls-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("ls command", () => {
  it("lists shows from project-local and bundled cache in sorted order", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, "shows", "zeta"), { recursive: true });
    await mkdir(path.join(root, ".predit", "shows", "alpha"), { recursive: true });
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "ls", "shows"], { from: "node" });

    const rows = parseLines(output().stdout);
    expect(rows.map((row) => row.name)).toEqual(["alpha", "zeta"]);
    expect(rows.map((row) => row.source)).toEqual(["bundled", "local"]);
  });

  it("lists pipelines from local and bundled manifests in sorted order", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
    await mkdir(path.join(root, "pipelines"), { recursive: true });
    await writePipeline(root, ".predit/pipelines", "bundled-a");
    await writePipeline(root, "pipelines", "local-b");
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "ls", "pipelines"], { from: "node" });

    const rows = parseLines(output().stdout);
    expect(rows.map((row) => row.name)).toEqual(["bundled-a", "local-b"]);
    expect(rows.map((row) => row.source)).toEqual(["bundled", "local"]);
  });

  it("lists the bundled pipeline inventory from a freshly initialized project", async () => {
    const root = await emptyScratchDir();
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "init"], { from: "node" });
    await program.parseAsync(["node", "predit", "--json", "ls", "pipelines"], { from: "node" });

    const rows = parseLines(output().stdout).filter((row) => row.event === "pipeline_listed");
    expect(rows.map((row) => row.name)).toEqual(
      [...BUNDLED_MANIFEST_INVENTORY_SLUGS].sort((left, right) => left.localeCompare(right)),
    );
    expect(rows.every((row) => row.source === "bundled")).toBe(true);
    expect(rows.every((row) => typeof row.display_name === "string" && row.display_name.length > 0)).toBe(true);
    expect(rows.every((row) => typeof row.status === "string" && row.status.length > 0)).toBe(true);
  });

  it("lists starter metadata from the bundled cache", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, ".predit", "starters", "news-song", "inputs", "sample-episode"), {
      recursive: true,
    });
    await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
    await writePipeline(root, ".predit/pipelines", "news-song", { sample: true });
    await writeFile(path.join(root, ".predit", "starters", "news-song", "inputs", "sample-episode", "fixture.txt"), "ok\n");
    await writeFile(
      path.join(root, ".predit", "starters", "news-song", "show.yaml"),
      [
        "slug: news-song",
        'display_name: "News Song"',
        'description: "Audio-led news-song starter."',
        "created: 2026-05-14",
        "brand: ./brand/",
        "characters: ./characters/",
        "pipelines:",
        "  news-song:",
        "    playbook: news-song",
        "defaults:",
        "  pipeline: news-song",
        "starter:",
        "  expected_sample_duration_s: 15",
        "",
      ].join("\n"),
      "utf8",
    );
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "ls", "starters"], { from: "node" });

    const rows = parseLines(output().stdout);
    expect(rows).toEqual([
      expect.objectContaining({
        event: "starter_listed",
        kind: "starters",
        name: "news-song",
        description: "Audio-led news-song starter.",
        pipelines: ["news-song"],
        fixture_size: "3 B",
        fixture_size_bytes: 3,
        sample_duration_s: 15,
        sample_supported: true,
      }),
    ]);
  });

  it("reports starter sample support from referenced pipeline manifests", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
    await writePipeline(root, ".predit/pipelines", "sampled", { sample: true });
    await writePipeline(root, ".predit/pipelines", "unsampled");
    await writeStarter(root, "sampled-starter", "sampled");
    await writeStarter(root, "unsampled-starter", "unsampled");
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "ls", "starters"], { from: "node" });

    const rows = parseLines(output().stdout);
    expect(rows.map((row) => ({ name: row.name, sample_supported: row.sample_supported }))).toEqual([
      { name: "sampled-starter", sample_supported: true },
      { name: "unsampled-starter", sample_supported: false },
    ]);
  });

  it("uses starter metadata columns for human-readable starter lists", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, ".predit", "starters", "cinematic-trailer", "inputs"), { recursive: true });
    await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
    await writePipeline(root, ".predit/pipelines", "cinematic");
    await writeFile(
      path.join(root, ".predit", "starters", "cinematic-trailer", "show.yaml"),
      [
        "slug: cinematic-trailer",
        'display_name: "Cinematic Trailer"',
        'description: "Reference-image trailer starter."',
        "created: 2026-05-14",
        "pipelines:",
        "  cinematic:",
        "    playbook: clean-professional",
        "defaults:",
        "  pipeline: cinematic",
        "starter:",
        "  fixture_size_bytes: 1602",
        "  expected_sample_duration_s: 15",
        "",
      ].join("\n"),
      "utf8",
    );
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "ls", "starters"], { from: "node" });

    expect(output().stdout).toContain("name");
    expect(output().stdout).toContain("description");
    expect(output().stdout).toContain("pipelines");
    expect(output().stdout).toContain("fixture_size");
    expect(output().stdout).toContain("sample_duration_s");
    expect(output().stdout).toContain("sample_supported");
    expect(output().stdout).toContain("cinematic-trailer");
    expect(output().stdout).toContain("1.6 KB");
  });

  it("sorts tools by capability, provider, then name", async () => {
    const root = await scratchProject();
    const toolsDir = path.join(root, "empty-tools");
    await mkdir(toolsDir);
    process.chdir(root);
    const { io, output } = captureIo();
    const registry = new Registry({
      toolsDir,
      tools: [
        tool("beta", "tts", "z-provider"),
        tool("alpha", "image_generation", "z-provider"),
        tool("gamma", "image_generation", "a-provider"),
      ],
    });
    const command = { optsWithGlobals: () => ({ json: true }) };

    await createLsHandler(io, { registryFactory: () => registry })("tools", undefined, command as unknown as Command);

    const rows = parseLines(output().stdout);
    expect(rows.map((row) => row.name)).toEqual(["gamma", "alpha", "beta"]);
  });

  it("emits no decision rows when the decision log is absent", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "ls", "decisions", "show/episode"], { from: "node" });

    expect(parseLines(output().stdout)).toEqual([]);
  });
});

async function writePipeline(root: string, dir: string, slug: string, options: { sample?: boolean } = {}): Promise<void> {
  await writeFile(
    path.join(root, dir, `${slug}.yaml`),
    [
      `slug: ${slug}`,
      "display_name: Test Pipeline",
      "status: experimental",
      ...(options.sample
        ? ["sample:", "  duration_s_min: 10", "  duration_s_max: 15", "  hint: Test sample"]
        : []),
      "stages:",
      "  - slug: idea",
      `    skill: pipelines/${slug}/idea-director.md`,
      "    produces: brief",
      ...(options.sample ? ["    sample_mode_supported: true"] : []),
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeStarter(root: string, starter: string, pipeline: string): Promise<void> {
  const starterDir = path.join(root, ".predit", "starters", starter);
  await mkdir(path.join(starterDir, "inputs"), { recursive: true });
  await writeFile(
    path.join(starterDir, "show.yaml"),
    [
      `slug: ${starter}`,
      `display_name: "${starter}"`,
      "created: 2026-05-14",
      "pipelines:",
      `  ${pipeline}:`,
      "    playbook: clean-professional",
      "defaults:",
      `  pipeline: ${pipeline}`,
      "starter:",
      "  fixture_size_bytes: 0",
      "  expected_sample_duration_s: 15",
      "",
    ].join("\n"),
    "utf8",
  );
}

function tool(name: string, capability: string, provider: string): Tool {
  return {
    name,
    capability,
    provider,
    status: "experimental",
    integration: { kind: "library", package: name, install: `install ${name}` },
    best_for: "tests",
    input: z.object({}),
    output: z.object({}),
    async isAvailable() {
      return { available: true };
    },
    async execute() {
      return {};
    },
  };
}

function parseLines(output: string): Array<Record<string, unknown>> {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function captureProgram() {
  const io = captureIo();
  return {
    program: createProgram(io.io),
    output: io.output,
  };
}

function captureIo() {
  let stdout = "";
  let stderr = "";
  const io = {
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
  };

  return {
    io,
    output: () => ({ stdout, stderr }),
  };
}
