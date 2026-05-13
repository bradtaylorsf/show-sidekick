import type { Command } from "commander";
import { debug } from "../../log/logger.js";

export type CliIo = {
  stdout: Pick<NodeJS.WriteStream, "write">;
  stderr: Pick<NodeJS.WriteStream, "write">;
};

export type GlobalOptions = {
  json?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  color?: boolean;
  config?: string;
};

export const defaultIo: CliIo = {
  stdout: process.stdout,
  stderr: process.stderr,
};

type StubEvent = {
  event: "stub";
  command: string;
  args: Record<string, unknown>;
  options: GlobalOptions;
};

export function createStubHandler(
  commandName: string,
  argNames: readonly string[] = [],
  io: CliIo = defaultIo,
) {
  return (...actionArgs: unknown[]): void => {
    const command = actionArgs.at(-1) as Command;
    const values = actionArgs.slice(0, -1);
    const options = command.optsWithGlobals<GlobalOptions>();

    if (options.verbose) {
      debug(`stub command invoked: ${commandName}`);
    }

    if (options.json) {
      const event: StubEvent = {
        event: "stub",
        command: commandName,
        args: Object.fromEntries(
          argNames.map((name, index) => [name, values[index]]).filter((entry) => entry[1] !== undefined),
        ),
        options,
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    io.stdout.write(`${commandName}: not yet implemented\n`);
  };
}
