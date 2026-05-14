import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Registry, type Tool } from "../../registry/index.js";
import { createSetupHandler } from "./setup.js";

function io() {
  let stdout = "";
  return {
    io: {
      stdout: { write: (value: string) => { stdout += value; return true; } },
      stderr: { write: () => true },
    },
    stdout: () => stdout,
  };
}

function command(options: Record<string, unknown> = {}): Command {
  return { optsWithGlobals: () => options } as unknown as Command;
}

function tool(name: string, install: string): Tool {
  return {
    name,
    capability: "image_to_video",
    provider: name,
    status: "production",
    integration: {
      kind: "cli",
      binary: name,
      auth: { mode: "cli-login", check: `${name} whoami` },
      install,
    },
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

describe("setup command", () => {
  it("runs the selected tool's install/login command", async () => {
    const capture = io();
    const runInstall = vi.fn(async () => undefined);
    const registry = new Registry({
      tools: [tool("higgsfield", "npm i -g @higgsfield/cli && higgsfield login")],
    });

    await createSetupHandler(capture.io, {
      createRegistry: async () => registry,
      runInstall,
      cwd: () => "/project",
    })("higgsfield", command());

    expect(runInstall).toHaveBeenCalledWith("npm i -g @higgsfield/cli && higgsfield login", { cwd: "/project" });
    expect(capture.stdout()).toBe("setup higgsfield: completed\n");
  });

  it("emits a machine-readable completion event in json mode", async () => {
    const capture = io();
    const registry = new Registry({ tools: [tool("higgsfield", "higgsfield login")] });

    await createSetupHandler(capture.io, {
      createRegistry: async () => registry,
      runInstall: async () => undefined,
      cwd: () => "/project",
    })("higgsfield", command({ json: true }));

    expect(JSON.parse(capture.stdout())).toEqual({
      event: "tool_setup",
      tool: "higgsfield",
      install: "higgsfield login",
      status: "completed",
    });
  });
});
