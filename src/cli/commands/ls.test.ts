import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { afterEach, describe, expect, it } from "vitest";
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

  it("sorts tools by capability, provider, then name", async () => {
    const root = await scratchProject();
    process.chdir(root);
    const { io, output } = captureIo();
    const registry = new Registry({
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

async function writePipeline(root: string, dir: string, slug: string): Promise<void> {
  await writeFile(
    path.join(root, dir, `${slug}.yaml`),
    [
      `slug: ${slug}`,
      "display_name: Test Pipeline",
      "status: experimental",
      "stages:",
      "  - slug: idea",
      `    skill: pipelines/${slug}/idea-director.md`,
      "    produces: brief",
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
