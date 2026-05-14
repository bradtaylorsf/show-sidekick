import { exec } from "node:child_process";
import type { Command } from "commander";
import { Registry } from "../../registry/index.js";
import type { Integration } from "../../registry/tool.js";
import type { CliIo, GlobalOptions } from "./stub.js";

export type SetupDeps = {
  createRegistry: () => Promise<Registry>;
  runInstall: (command: string, options: { cwd: string }) => Promise<void>;
  commandExists: (binary: string, options: { cwd: string }) => Promise<boolean>;
  cwd: () => string;
};

type SetupEvent = {
  event: "tool_setup";
  tool: string;
  install: string;
  status: "completed";
};

const defaultDeps: SetupDeps = {
  createRegistry: createDefaultRegistry,
  runInstall: runShellCommand,
  commandExists: commandExists,
  cwd: () => process.cwd(),
};

export function createSetupHandler(io: CliIo, deps: SetupDeps = defaultDeps) {
  return async (toolName: string, command: Command): Promise<void> => {
    const options = command.optsWithGlobals<GlobalOptions>();
    const registry = await deps.createRegistry();
    const tool = registry.get(toolName);

    if (!tool) {
      throw new Error(`unknown tool "${toolName}"`);
    }

    const cwd = deps.cwd();
    const setupCommand = await commandForSetup(tool.integration, deps, cwd);
    await deps.runInstall(setupCommand, { cwd });

    if (options.json) {
      const event: SetupEvent = {
        event: "tool_setup",
        tool: tool.name,
        install: setupCommand,
        status: "completed",
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    io.stdout.write(`setup ${tool.name}: completed\n`);
  };
}

async function createDefaultRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

function runShellCommand(command: string, options: { cwd: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: options.cwd }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve();
    });
  });
}

function commandExists(binary: string, options: { cwd: string }): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`command -v ${shellQuote(binary)}`, { cwd: options.cwd }, (error) => {
      resolve(!error);
    });
  });
}

async function commandForSetup(
  integration: Integration,
  deps: SetupDeps,
  cwd: string,
): Promise<string> {
  if (integration.kind !== "cli" || integration.auth.mode !== "cli-login") {
    return integration.install;
  }

  if (!(await deps.commandExists(integration.binary, { cwd }))) {
    return integration.install;
  }

  return loginCommandFromInstall(integration.install, integration.binary) ?? integration.install;
}

function loginCommandFromInstall(command: string, binary: string): string | undefined {
  const loginPattern = new RegExp(`^${escapeRegExp(binary)}\\s+login(?:\\s|$)`);
  return command.split(/\s*(?:&&|;)\s*/u).find((segment) => loginPattern.test(segment.trim()))?.trim();
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
