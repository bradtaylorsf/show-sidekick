import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { resetLoggerMode } from "../log/mode.js";
import { defineTool, Registry, type Availability, type Integration } from "../registry/index.js";
import { VERSION } from "../version.js";
import { computeBundledChecksum } from "../version/bundled.js";
import { readCacheVersion } from "../version/cache.js";
import { commandNames, createProgram, type ProgramOptions } from "./program.js";

function captureProgram(options: Omit<ProgramOptions, "io"> = {}) {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
    ...options,
    io: {
      stdout: { write: (value: string) => { stdout += value; return true; } },
      stderr: { write: (value: string) => { stderr += value; return true; } },
    },
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  resetLoggerMode();
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("createProgram", () => {
  it("registers every top-level command from the CLI spec", () => {
    const { program } = captureProgram();
    const names = program.commands.map((command) => command.name());

    expect(names).toEqual(expect.arrayContaining([...commandNames()]));
  });

  it("defines the global flags", () => {
    const { program } = captureProgram();
    const flags = program.options.map((option) => option.long);

    expect(flags).toEqual(expect.arrayContaining(["--json", "--dry-run", "--verbose", "--no-color", "--config"]));
  });

  it("defines the build reference option", () => {
    const { program } = captureProgram();
    const build = program.commands.find((command) => command.name() === "build");

    expect(build?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--reference", "--provider-profile"]),
    );
  });

  it("defines the doctor profile option", () => {
    const { program } = captureProgram();
    const doctor = program.commands.find((command) => command.name() === "doctor");

    expect(doctor?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--profile"]));
  });

  it("emits doctor NDJSON through the real Commander action signature", async () => {
    const root = await scratchCurrentProject();
    process.chdir(root);
    const probe = vi.fn(async (integration: Integration): Promise<Availability> => {
      if (integration.kind === "api") {
        return { available: false, reason: `missing env: ${integration.env.join(", ")}`, fix: "env" };
      }
      return { available: true };
    });
    const { program, output } = captureProgram({
      doctor: {
        createRegistry: async () => paidDemoRegistry(),
        probeIntegration: probe,
      },
    });

    await program.parseAsync(["node", "predit", "--json", "doctor", "--profile", "paid-demo"], { from: "node" });

    const events = output().stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({
      event: "doctor",
      profile: "paid-demo",
      check: "OPENAI_API_KEY",
      status: "missing",
    });
    expect(events.at(-1)).toMatchObject({ check: "ffprobe", status: "ok" });
  });

  it("loads project .env before doctor checks provider availability", async () => {
    const root = await scratchCurrentProject();
    process.chdir(root);
    await writeFile(
      path.join(root, ".env"),
      "OPENAI_API_KEY=predit-dotenv-openai\nELEVENLABS_API_KEY=predit-dotenv-eleven\n",
      "utf8",
    );
    const originalOpenAi = process.env.OPENAI_API_KEY;
    const originalElevenLabs = process.env.ELEVENLABS_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;

    try {
      const { program, output } = captureProgram({
        doctor: {
          createRegistry: async () => paidDemoRegistry(),
          probeIntegration: async (integration) => {
            if (integration.kind !== "api") {
              return { available: true };
            }

            const missing = integration.env.filter((name) => {
              const value = process.env[name];
              return value === undefined || value.trim() === "";
            });
            return missing.length === 0
              ? { available: true }
              : { available: false, reason: `missing env: ${missing.join(", ")}`, fix: "env" };
          },
        },
      });

      await program.parseAsync(["node", "predit", "--json", "doctor", "--profile", "paid-demo"], { from: "node" });

      const events = output().stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(events.find((event) => event.check === "OPENAI_API_KEY")).toMatchObject({ status: "ok" });
      expect(events.find((event) => event.check === "ELEVENLABS_API_KEY")).toMatchObject({ status: "ok" });
    } finally {
      restoreEnv("OPENAI_API_KEY", originalOpenAi);
      restoreEnv("ELEVENLABS_API_KEY", originalElevenLabs);
    }
  });

  it("defines init and update lifecycle options", () => {
    const { program } = captureProgram();
    const init = program.commands.find((command) => command.name() === "init");
    const update = program.commands.find((command) => command.name() === "update");

    expect(init?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--git", "--starter"]));
    expect(update?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--check"]));
  });

  it("defines export package options", () => {
    const { program } = captureProgram();
    const exportCommand = program.commands.find((command) => command.name() === "export");

    expect(exportCommand?.options.map((option) => option.long)).toEqual(
      expect.arrayContaining(["--target", "--format", "--asset-link-mode", "--out", "--overwrite"]),
    );
  });

  it("emits parseable NDJSON for remaining stub commands in json mode", async () => {
    const root = await scratchCurrentProject();
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "tools", "fixture"], { from: "node" });

    const event = JSON.parse(output().stdout.trim()) as { event: string; command: string; args: Record<string, unknown> };

    expect(event).toEqual(
      expect.objectContaining({
        event: "stub",
        command: "tools",
        args: { name: "fixture" },
      }),
    );
  });

  it("writes debug output to stderr when verbose is enabled", async () => {
    const root = await scratchCurrentProject();
    process.chdir(root);
    const { program, output } = captureProgram();
    let stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });

    await program.parseAsync(["node", "predit", "--verbose", "tools", "fixture"], { from: "node" });

    expect(output().stderr).toBe("");
    expect(stderr).toContain("stub command invoked: tools");
  });

  it("requires a project root before non-init commands run", async () => {
    const root = await scratchDir();
    process.chdir(root);
    const { program } = captureProgram();

    await expect(program.parseAsync(["node", "predit", "doctor"], { from: "node" })).rejects.toThrow("predit init");
  });

  it("allows init to run outside an existing project", async () => {
    const root = await scratchDir();
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "init"], { from: "node" });

    expect(output().stdout).toContain("init: scaffolded predit project at");
    await expect(access(path.join(root, ".predit", "version.json"))).resolves.toBeUndefined();
  });

  it("throws on unknown commands with a fuzzy suggestion", async () => {
    const { program, output } = captureProgram();
    program.exitOverride();

    await expect(program.parseAsync(["node", "predit", "buid"], { from: "node" })).rejects.toThrow(CommanderError);
    expect(output().stderr).toContain('unknown command "buid", did you mean "build"?');
  });

  it("refreshes the project cache before commands when .predit was locked by a different installed version", async () => {
    const root = await scratchProject({
      harness_version: sameMajorDifferentVersion(),
      bundled_checksum: "cached",
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "tools", "fixture"], { from: "node" });

    expect(output().stderr).toContain("refreshed .predit cache");
    expect(output().stdout).toContain("tools: not yet implemented");
    await expect(readCacheVersion(root)).resolves.toMatchObject({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(),
    });
  });

  it("refreshes the project cache before commands when the bundled checksum is stale", async () => {
    const root = await scratchProject({
      harness_version: VERSION,
      bundled_checksum: "stale",
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "tools", "fixture"], { from: "node" });

    expect(output().stderr).toContain("refreshed stale .predit bundled cache");
    expect(output().stdout).toContain("tools: not yet implemented");
    await expect(readCacheVersion(root)).resolves.toMatchObject({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(),
    });
  });

  it("restores the gitignored .predit cache before commands in a shared scaffold clone", async () => {
    const root = await scratchSharedProjectWithoutCache();
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "tools", "fixture"], { from: "node" });

    expect(output().stderr).toContain("refreshed");
    expect(output().stderr).toContain(".predit");
    expect(output().stdout).toContain("tools: not yet implemented");
    await expect(readCacheVersion(root)).resolves.toMatchObject({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(),
    });
  });

  it("does not warn before commands when cache version and checksum match", async () => {
    const root = await scratchProject({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(),
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "tools", "fixture"], { from: "node" });

    expect(output().stderr).toBe("");
    expect(output().stdout).toContain("tools: not yet implemented");
  });

  it("refuses commands when .predit was locked by an incompatible major version", async () => {
    const incompatibleVersion = differentMajorVersion();
    const root = await scratchProject({
      harness_version: incompatibleVersion,
      bundled_checksum: "cached",
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program } = captureProgram();

    await expect(program.parseAsync(["node", "predit", "doctor"], { from: "node" })).rejects.toThrow(
      `pnpm i -g predit@${incompatibleVersion}`,
    );
  });
});

async function scratchProject(version: {
  harness_version: string;
  bundled_checksum: string;
  locked_at: string;
}): Promise<string> {
  const root = path.join(tmpdir(), `predit-program-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  await writeFile(path.join(root, ".predit", "version.json"), `${JSON.stringify(version, null, 2)}\n`, "utf8");
  return root;
}

async function scratchCurrentProject(): Promise<string> {
  return scratchProject({
    harness_version: VERSION,
    bundled_checksum: await computeBundledChecksum(),
    locked_at: "2026-05-14T00:00:00.000Z",
  });
}

async function scratchSharedProjectWithoutCache(): Promise<string> {
  const root = path.join(tmpdir(), `predit-program-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  await writeFile(path.join(root, "AGENTS.md"), "# agents\n", "utf8");
  await writeFile(path.join(root, ".env.example"), "OPENAI_API_KEY=\n", "utf8");
  return root;
}

async function scratchDir(): Promise<string> {
  const root = path.join(tmpdir(), `predit-program-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function sameMajorDifferentVersion(): string {
  const parts = VERSION.split(".");
  const major = Number(parts[0] ?? "0");
  const minor = Number(parts[1] ?? "0");
  const patch = Number(parts[2] ?? "0");
  return `${major}.${minor}.${patch + 1}`;
}

function differentMajorVersion(): string {
  const major = Number(VERSION.split(".")[0] ?? "0");
  return `${major + 1}.0.0`;
}

function paidDemoRegistry(): Registry {
  return new Registry({
    tools: ["openai_image", "openai_tts", "elevenlabs_tts", "higgsfield", "ffmpeg", "source_media_review"].map((name) =>
      defineTool({
        name,
        capability: "research",
        provider: "test",
        status: "beta",
        integration: { kind: "library", package: "test", install: "none" },
        best_for: "doctor program tests",
        input: z.object({}),
        output: z.object({}),
        async execute() {
          return {};
        },
      }),
    ),
  });
}
