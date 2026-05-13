import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLoggerMode } from "../log/mode.js";
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

afterEach(() => {
  vi.restoreAllMocks();
  resetLoggerMode();
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

  it("emits parseable NDJSON for stub commands in json mode", async () => {
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "build", "show/episode"], { from: "node" });

    const line = output().stdout.trim();
    const event = JSON.parse(line) as { event: string; command: string; args: { target: string } };

    expect(event).toEqual(
      expect.objectContaining({
        event: "stub",
        command: "build",
        args: { target: "show/episode" },
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
});
