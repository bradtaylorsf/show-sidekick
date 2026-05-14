import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLoggerMode } from "../log/mode.js";
import { VERSION } from "../version.js";
import { computeBundledChecksum } from "../version/bundled.js";
import { commandNames, createProgram } from "./program.js";

function captureProgram() {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
    stdout: { write: (value: string) => { stdout += value; return true; } },
    stderr: { write: (value: string) => { stderr += value; return true; } },
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

    expect(build?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--reference"]));
  });

  it("defines init and update lifecycle options", () => {
    const { program } = captureProgram();
    const init = program.commands.find((command) => command.name() === "init");
    const update = program.commands.find((command) => command.name() === "update");

    expect(init?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--git", "--starter"]));
    expect(update?.options.map((option) => option.long)).toEqual(expect.arrayContaining(["--check"]));
  });

  it("emits parseable NDJSON for remaining stub commands in json mode", async () => {
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "doctor"], { from: "node" });

    const event = JSON.parse(output().stdout.trim()) as { event: string; command: string; args: Record<string, unknown> };

    expect(event).toEqual(
      expect.objectContaining({
        event: "stub",
        command: "doctor",
        args: {},
      }),
    );
  });

  it("writes debug output to stderr when verbose is enabled", async () => {
    const { program, output } = captureProgram();
    let stderr = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    });

    await program.parseAsync(["node", "predit", "--verbose", "doctor"], { from: "node" });

    expect(output().stderr).toBe("");
    expect(stderr).toContain("stub command invoked: doctor");
  });

  it("throws on unknown commands with a fuzzy suggestion", async () => {
    const { program, output } = captureProgram();
    program.exitOverride();

    await expect(program.parseAsync(["node", "predit", "buid"], { from: "node" })).rejects.toThrow(CommanderError);
    expect(output().stderr).toContain('unknown command "buid", did you mean "build"?');
  });

  it("warns before commands when .predit was locked by a different installed version", async () => {
    const root = await scratchProject({
      harness_version: sameMajorDifferentVersion(),
      bundled_checksum: "cached",
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "doctor"], { from: "node" });

    expect(output().stderr).toContain("run 'predit update'");
    expect(output().stdout).toContain("doctor: not yet implemented");
  });

  it("warns before commands when the bundled checksum is stale", async () => {
    const root = await scratchProject({
      harness_version: VERSION,
      bundled_checksum: "stale",
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "doctor"], { from: "node" });

    expect(output().stderr).toContain("checksum is stale");
    expect(output().stdout).toContain("doctor: not yet implemented");
  });

  it("does not warn before commands when cache version and checksum match", async () => {
    const root = await scratchProject({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(),
      locked_at: "2026-05-14T00:00:00.000Z",
    });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "doctor"], { from: "node" });

    expect(output().stderr).toBe("");
    expect(output().stdout).toContain("doctor: not yet implemented");
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
