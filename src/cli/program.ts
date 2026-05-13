import { Command } from "commander";
import { type CliIo, createStubHandler, defaultIo } from "./commands/stub.js";
import { suggest } from "./fuzzy.js";
import { configure } from "../log/mode.js";

const CLI_VERSION = "0.0.0";
const CLI_DESCRIPTION = "AI pre-production for video - build the rough cut, finish in your NLE.";

const COMMAND_NAMES = [
  "init",
  "doctor",
  "new",
  "build",
  "resume",
  "status",
  "approve",
  "revise",
  "ls",
  "show",
  "export",
  "import",
  "watch",
  "setup",
  "tools",
  "update",
] as const;

type UnknownCommandPatch = Command & {
  unknownCommand: () => void;
};

export function createProgram(io: CliIo = defaultIo): Command {
  const program = new Command();

  program
    .name("predit")
    .description(CLI_DESCRIPTION)
    .version(CLI_VERSION)
    .option("--json", "emit machine-readable NDJSON")
    .option("--dry-run", "plan without spending")
    .option("-v, --verbose", "enable debug logging")
    .option("--no-color", "strip ANSI color")
    .option("--config <path>", "override show.yaml location")
    .configureOutput({
      writeOut: (value) => io.stdout.write(value),
      writeErr: (value) => io.stderr.write(value),
    });

  program.hook("preAction", (_thisCommand, actionCommand) => {
    const options = actionCommand.optsWithGlobals<{ json?: boolean; verbose?: boolean; color?: boolean }>();

    configure({
      json: options.json === true,
      verbose: options.verbose === true,
      color: options.color !== false,
    });
  });

  registerUnknownCommandSuggestion(program);
  registerCommands(program, io);

  return program;
}

export function commandNames(): readonly string[] {
  return COMMAND_NAMES;
}

function registerUnknownCommandSuggestion(program: Command): void {
  const patched = program as UnknownCommandPatch;
  patched.unknownCommand = function unknownCommand() {
    const input = this.args[0] as string;
    const match = suggest(input, COMMAND_NAMES);
    const suffix = match ? `, did you mean "${match}"?` : "";

    this.error(`unknown command "${input}"${suffix}`, { code: "commander.unknownCommand" });
  };
}

function registerCommands(program: Command, io: CliIo): void {
  program
    .command("init")
    .description("scaffold a new predit project in cwd")
    .action(createStubHandler("init", [], io));

  program
    .command("doctor")
    .description("registry and tool preflight")
    .action(createStubHandler("doctor", [], io));

  const newCommand = program.command("new").description("create shows, episodes, pipelines, or playbooks");
  newCommand.action(createStubHandler("new", [], io));
  newCommand
    .command("show <slug>")
    .description("scaffold shows/<slug>/")
    .action(createStubHandler("new show", ["slug"], io));
  newCommand
    .command("episode <show> [slug]")
    .description("scaffold an episode under a show")
    .action(createStubHandler("new episode", ["show", "slug"], io));
  newCommand
    .command("pipeline <slug>")
    .description("scaffold a new pipeline and director skills")
    .action(createStubHandler("new pipeline", ["slug"], io));
  newCommand
    .command("playbook <slug>")
    .description("scaffold a new style playbook")
    .action(createStubHandler("new playbook", ["slug"], io));

  program
    .command("build <target>")
    .description("run a pipeline")
    .option("--sample", "run a 15-20s sample")
    .option("--from <stage>", "start at a stage")
    .option("--only <stage>", "run only one stage")
    .option("--to <stage>", "stop after a stage")
    .option("--budget <usd>", "set a budget in USD")
    .action(createStubHandler("build", ["target"], io));

  program
    .command("resume <target>")
    .description("resume at the next checkpoint")
    .action(createStubHandler("resume", ["target"], io));

  program
    .command("status [target]")
    .description("show state, cost, and last decision")
    .action(createStubHandler("status", ["target"], io));

  program
    .command("approve <target>")
    .description("advance past awaiting_human")
    .action(createStubHandler("approve", ["target"], io));

  program
    .command("revise <target> <note>")
    .description("loop the current stage with a note")
    .action(createStubHandler("revise", ["target", "note"], io));

  program
    .command("ls <kind> [arg]")
    .description("list shows, episodes, pipelines, playbooks, tools, or decisions")
    .action(createStubHandler("ls", ["kind", "arg"], io));

  program
    .command("show <target>")
    .description("dump episode state")
    .action(createStubHandler("show", ["target"], io));

  program
    .command("export <target>")
    .description("export an editor handoff")
    .option("--target <nle>", "premiere, capcut, or davinci")
    .option("--format <format>", "export format such as edl")
    .action(createStubHandler("export", ["target"], io));

  program
    .command("import <path>")
    .description("scaffold an episode from a dropped folder")
    .option("--as <target>", "target show/episode")
    .action(createStubHandler("import", ["path"], io));

  program
    .command("watch")
    .description("detect drops and suggest imports")
    .action(createStubHandler("watch", [], io));

  program
    .command("setup <tool>")
    .description("run tool native login or install")
    .action(createStubHandler("setup", ["tool"], io));

  program
    .command("tools <name>")
    .description("show tool details")
    .action(createStubHandler("tools", ["name"], io));

  program
    .command("update")
    .description("refresh the local .predit cache")
    .action(createStubHandler("update", [], io));
}
