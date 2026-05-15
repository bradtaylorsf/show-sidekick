import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Registry, type Integration, type Tool } from "../../registry/index.js";
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
  return toolWithIntegration(name, {
    kind: "cli",
    binary: name,
    auth: { mode: "cli-login", check: `${name} whoami` },
    install,
  });
}

function toolWithIntegration(name: string, integration: Integration): Tool {
  return {
    name,
    capability: "image_to_video",
    provider: name,
    status: "production",
    integration,
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
      tools: [tool("higgsfield", "npm i -g @higgsfield/cli && higgsfield auth login")],
    });

    await createSetupHandler(capture.io, {
      createRegistry: async () => registry,
      runInstall,
      commandExists: async () => false,
      cwd: () => "/project",
    })("higgsfield", command());

    expect(runInstall).toHaveBeenCalledWith("npm i -g @higgsfield/cli && higgsfield auth login", { cwd: "/project" });
    expect(capture.stdout()).toBe("setup higgsfield: completed\n");
  });

  it("refreshes CLI login without reinstalling when the binary is already present", async () => {
    const capture = io();
    const runInstall = vi.fn(async () => undefined);
    const registry = new Registry({
      tools: [tool("higgsfield", "npm i -g @higgsfield/cli && higgsfield auth login")],
    });

    await createSetupHandler(capture.io, {
      createRegistry: async () => registry,
      runInstall,
      commandExists: async () => true,
      cwd: () => "/project",
    })("higgsfield", command());

    expect(runInstall).toHaveBeenCalledWith("higgsfield auth login", { cwd: "/project" });
    expect(capture.stdout()).toBe("setup higgsfield: completed\n");
  });

  it("installs both rich composition runtimes through the runtimes alias", async () => {
    const capture = io();
    const runInstall = vi.fn(async () => undefined);
    const registry = new Registry({
      tools: [
        toolWithIntegration("remotion", {
          kind: "library",
          package: "remotion",
          install: "npm install --save-dev remotion react react-dom @remotion/renderer",
        }),
        toolWithIntegration("hyperframes", {
          kind: "cli",
          binary: "npx",
          auth: { mode: "none" },
          install: "npm install --save-dev hyperframes",
        }),
      ],
    });

    await createSetupHandler(capture.io, {
      createRegistry: async () => registry,
      runInstall,
      commandExists: async () => true,
      cwd: () => "/project",
    })("runtimes", command());

    expect(runInstall.mock.calls).toEqual([
      ["npm install --save-dev remotion react react-dom @remotion/renderer", { cwd: "/project" }],
      ["npm install --save-dev hyperframes", { cwd: "/project" }],
    ]);
    expect(capture.stdout()).toBe("setup remotion: completed\nsetup hyperframes: completed\n");
  });

  it("emits a machine-readable completion event in json mode", async () => {
    const capture = io();
    const registry = new Registry({ tools: [tool("higgsfield", "higgsfield auth login")] });

    await createSetupHandler(capture.io, {
      createRegistry: async () => registry,
      runInstall: async () => undefined,
      commandExists: async () => false,
      cwd: () => "/project",
    })("higgsfield", command({ json: true }));

    expect(JSON.parse(capture.stdout())).toEqual({
      event: "tool_setup",
      tool: "higgsfield",
      install: "higgsfield auth login",
      status: "completed",
    });
  });
});
