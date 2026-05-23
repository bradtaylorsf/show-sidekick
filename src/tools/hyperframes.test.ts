import { describe, expect, it, vi } from "vitest";
import { ComposeBlockerError } from "../compose/blocker.js";
import hyperframes, { type CommandResult } from "./hyperframes.js";

describe("hyperframes tool", () => {
  it("runs lint, validate, then render with npx hyperframes", async () => {
    const calls: string[][] = [];
    const runCommand = vi.fn(async (_binary: string, args: string[]): Promise<CommandResult> => {
      calls.push(args);
      return { stdout: "ok", stderr: "", exit_code: 0 };
    });

    const result = await hyperframes.execute(input(), testContext(runCommand));

    expect(calls).toEqual([
      ["hyperframes", "lint", "spec.json"],
      ["hyperframes", "validate", "spec.json"],
      ["hyperframes", "render", "spec.json"],
    ]);
    expect(result.validation_steps).toEqual([
      { name: "lint", status: "pass" },
      { name: "validate", status: "pass" },
      { name: "render", status: "pass" },
    ]);
  });

  it("short-circuits validate and render when lint fails", async () => {
    const runCommand = vi.fn(async (_binary: string, args: string[]): Promise<CommandResult> => {
      return args[1] === "lint"
        ? { stdout: "", stderr: "unknown token at line 4", exit_code: 1 }
        : { stdout: "should not run", stderr: "", exit_code: 0 };
    });

    await expect(hyperframes.execute(input(), testContext(runCommand))).rejects.toMatchObject({
      blocker: {
        type: "hyperframes_validation_failed",
        attempted: "hyperframes",
      },
      render_report: {
        validation_steps: [{ name: "lint", notes: "unknown token at line 4", status: "fail" }],
      },
    });

    expect(runCommand).toHaveBeenCalledOnce();
  });

  it("short-circuits render when validate fails after lint passes", async () => {
    const runCommand = vi.fn(async (_binary: string, args: string[]): Promise<CommandResult> => {
      return args[1] === "validate"
        ? { stdout: "", stderr: "missing timeline", exit_code: 1 }
        : { stdout: "ok", stderr: "", exit_code: 0 };
    });

    await expect(hyperframes.execute(input(), testContext(runCommand))).rejects.toBeInstanceOf(ComposeBlockerError);

    expect(runCommand.mock.calls.map((call) => call[1][1])).toEqual(["lint", "validate"]);
  });

  it("refuses runtime swaps before invoking HyperFrames", async () => {
    const runCommand = vi.fn(async (): Promise<CommandResult> => ({ stdout: "ok", stderr: "", exit_code: 0 }));

    await expect(
      hyperframes.execute(
        {
          ...input(),
          edit_decisions: {
            ...input().edit_decisions,
            render_runtime: "remotion" as const,
          },
        },
        testContext(runCommand),
      ),
    ).rejects.toThrow(/refuses runtime swap/u);
    expect(runCommand).not.toHaveBeenCalled();
  });
});

function input() {
  return {
    composition_spec_path: "spec.json",
    output_path: "renders/hyperframes.mp4",
    edit_decisions: {
      cuts: [{ start_s: 0, end_s: 4, asset_id: "hero" }],
      overlays: [],
      render_runtime: "hyperframes" as const,
      renderer_family: "animation-first" as const,
    },
  };
}

function testContext(runCommand: (binary: string, args: string[], options: { cwd: string }) => Promise<CommandResult>) {
  return {
    projectRoot: "/tmp/predit-hyperframes-test",
    runCommand,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
