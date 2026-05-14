import { exec } from "node:child_process";
import type { Command } from "commander";
import { Registry } from "../../registry/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

export type SetupDeps = {
  createRegistry: () => Promise<Registry>;
  runInstall: (command: string, options: { cwd: string }) => Promise<void>;
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

    await deps.runInstall(tool.integration.install, { cwd: deps.cwd() });

    if (options.json) {
      const event: SetupEvent = {
        event: "tool_setup",
        tool: tool.name,
        install: tool.integration.install,
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
