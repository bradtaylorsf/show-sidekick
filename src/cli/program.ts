import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Command } from "commander";
import { createApproveHandler } from "./commands/approve.js";
import { createBuildHandler, type BuildHandlerOptions } from "./commands/build.js";
import { createCuesheetHandler } from "./commands/cuesheet.js";
import { createDoctorHandler, type DoctorDeps } from "./commands/doctor.js";
import { createExportHandler } from "./commands/export.js";
import { createInitHandler } from "./commands/init.js";
import { createImportHandler } from "./commands/import.js";
import { lsDecisions } from "./commands/ls-decisions.js";
import { createLsHandler } from "./commands/ls.js";
import { createNewHandlers } from "./commands/new.js";
import { createResumeHandler } from "./commands/resume.js";
import { createReviseHandler } from "./commands/revise.js";
import { createSetupHandler } from "./commands/setup.js";
import { createStatusHandler } from "./commands/status.js";
import { type CliIo, createStubHandler, defaultIo, type GlobalOptions } from "./commands/stub.js";
import { createUpdateHandler } from "./commands/update.js";
import { createWatchHandler } from "./commands/watch.js";
import { suggest } from "./fuzzy.js";
import { BRANDING, LEGACY_BRANDING } from "../branding.js";
import { configure } from "../log/mode.js";
import { loadEnvIntoProcess } from "../paths/env.js";
import { ProjectRootNotFoundError } from "../paths/errors.js";
import { findProjectRoot, migrateLegacyProjectCache, publicCacheDir } from "../paths/project.js";
import { BUNDLED_CACHE_DIRS, bundledRoot, computeBundledChecksum, copyBundledInto } from "../version/bundled.js";
import { compareVersions, readCacheVersion, writeCacheVersion } from "../version/cache.js";
import { VERSION } from "../version.js";

const CLI_DESCRIPTION = `${BRANDING.productDisplayName}: AI pre-production for video - build the rough cut, finish in your NLE.`;

const COMMAND_NAMES = [
  "init",
  "doctor",
  "new",
  "build",
  "cuesheet",
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

export type ProgramOptions = {
  io?: CliIo;
  build?: BuildHandlerOptions;
  doctor?: DoctorDeps;
};

export function createProgram(input: CliIo | ProgramOptions = defaultIo): Command {
  const { io, build, doctor } = normalizeProgramOptions(input);
  const program = new Command();

  program
    .name(BRANDING.primaryCli)
    .description(CLI_DESCRIPTION)
    .version(VERSION)
    .option("--json", "emit machine-readable NDJSON")
    .option("--dry-run", "plan without spending")
    .option("-v, --verbose", "enable debug logging")
    .option("--no-color", "strip ANSI color")
    .option("--config <path>", "override show.yaml location")
    .configureOutput({
      writeOut: (value) => io.stdout.write(value),
      writeErr: (value) => io.stderr.write(value),
    });

  program.hook("preAction", async (_thisCommand, actionCommand) => {
    const options = actionCommand.optsWithGlobals<{ json?: boolean; verbose?: boolean; color?: boolean }>();

    configure({
      json: options.json === true,
      verbose: options.verbose === true,
      color: options.color !== false,
    });

    const commandName = topLevelCommandName(actionCommand);
    const projectRoot = requireProjectRoot(commandName);
    if (projectRoot !== null) {
      loadEnvIntoProcess(commandName, projectRoot);
    }
    await checkProjectCache(commandName, projectRoot, io);
  });

  registerUnknownCommandSuggestion(program);
  registerCommands(program, io, { build, doctor });

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
    const suffix = match ? `, did you mean "${match}"` : "";

    this.error(`unknown command "${input}"${suffix}. Run '${BRANDING.primaryCli} --help'.`, {
      code: "commander.unknownCommand",
    });
  };
}

type RegisterCommandOptions = {
  build?: BuildHandlerOptions;
  doctor?: DoctorDeps;
};

function registerCommands(program: Command, io: CliIo, options: RegisterCommandOptions = {}): void {
  program
    .command("init")
    .description(`scaffold a new ${BRANDING.productDisplayName} project in cwd`)
    .option("--git", "initialize git and commit the scaffold")
    .option("--starter <name>", "clone a bundled starter show into shows/<name>/")
    .option("--setup-runtimes", "install Remotion, Remotion CLI deps, and HyperFrames during init")
    .option("--no-setup-runtimes", "skip runtime dependency installation during init")
    .action(createInitHandler(io));

  program
    .command("doctor")
    .description("registry and tool preflight")
    .option("--profile <name>", "provider profile to preflight")
    .action(createDoctorHandler(io, options.doctor));

  const newCommand = program.command("new").description("create shows, episodes, pipelines, or playbooks");
  const newHandlers = createNewHandlers(io);
  newCommand.action(createStubHandler("new", [], io));
  newCommand
    .command("show <slug>")
    .description("scaffold shows/<slug>/")
    .option("--from <starter>", `starter to copy from ${BRANDING.cacheDir}/starters`)
    .option("--pipelines <list>", "comma-separated pipeline slugs")
    .action(newHandlers.show);
  newCommand
    .command("episode <show> [slug]")
    .description("scaffold an episode under a show")
    .option("--pipeline <name>", "pipeline key from show.pipelines")
    .option("--from <path>", "copy a source file or folder into inputs/<show>/<episode>/ and infer episode inputs")
    .action(newHandlers.episode);
  newCommand
    .command("pipeline <slug>")
    .description("scaffold a new pipeline and director skills")
    .action(newHandlers.pipeline);
  newCommand
    .command("playbook <slug>")
    .description("scaffold a new style playbook")
    .action(newHandlers.playbook);

  program
    .command("build <target>")
    .description("run a pipeline")
    .option("--sample", "run a 15-20s sample")
    .option("--from <stage>", "start at a stage, reusing completed checkpoints")
    .option("--only <stage>", "run only one stage")
    .option("--to <stage>", "stop after a stage")
    .option("--budget <usd>", "set a budget in USD")
    .option("--cost-drift-threshold <multiplier>", "override the cumulative cost drift review threshold")
    .option("--reference <url-or-path>", "analyze a reference video URL or local file before running")
    .option("--provider-profile <name>", "record a named provider profile selection for this run")
    .option("--non-interactive", "pause at required approvals and exit")
    .action(createBuildHandler(io, options.build));

  program
    .command("cuesheet <target>")
    .description("build and cache the audio cuesheet")
    .action(createCuesheetHandler(io));

  program
    .command("resume <target>")
    .description("resume at the next checkpoint")
    .action(createResumeHandler(io));

  program
    .command("status [target]")
    .description("show state, cost, and last decision")
    .action(createStatusHandler(io));

  program
    .command("approve <target>")
    .description("advance past awaiting_human")
    .option("--force <reason>", "force-approve a failed final review and log an audited downgrade approval")
    .action(createApproveHandler(io));

  program
    .command("revise <target> <note>")
    .description("loop the current stage with a note")
    .action(createReviseHandler(io));

  program
    .command("ls <kind> [arg]")
    .description("list shows, episodes, pipelines, playbooks, starters, tools, or decisions")
    .action(async (...actionArgs: unknown[]) => {
      const kind = actionArgs[0] as string;
      const arg = typeof actionArgs[1] === "string" ? actionArgs[1] : undefined;
      const command = actionArgs.at(-1) as Command;

      if (kind === "decisions") {
        if (arg === undefined) {
          command.error("missing required argument 'show/episode' for ls decisions");
          return;
        }

        await lsDecisions(arg, command.optsWithGlobals<GlobalOptions>(), io);
        return;
      }

      await createLsHandler(io)(kind, arg, command);
    });

  program
    .command("show <target>")
    .description("dump episode state")
    .action(createStubHandler("show", ["target"], io));

  program
    .command("export <target>")
    .description("export an editor handoff")
    .option("--target <nle>", "premiere, davinci, capcut, or edl")
    .option("--format <format>", "export format such as edl")
    .option("--asset-link-mode <mode>", "copy, symlink, or reference")
    .option("--out <dir>", "export root directory (defaults to exports/)")
    .option("--overwrite", "replace an existing export package")
    .action(createExportHandler(io));

  program
    .command("import <path>")
    .description("scaffold an episode from a dropped folder")
    .option("--as <target>", "target show/episode")
    .action(createImportHandler(io));

  program
    .command("watch")
    .description("detect drops and suggest imports")
    .action(createWatchHandler(io));

  program
    .command("setup <tool>")
    .description("run tool native login/install, or setup runtimes")
    .action(createSetupHandler(io));

  program
    .command("tools <name>")
    .description("show tool details")
    .action(createStubHandler("tools", ["name"], io));

  program
    .command("update")
    .description(`refresh the local ${BRANDING.cacheDir} cache`)
    .option("--check", `check whether ${BRANDING.cacheDir} is current without writing`)
    .action(createUpdateHandler(io));
}

async function checkProjectCache(commandName: string, projectRoot: string | null, io: CliIo): Promise<void> {
  if (projectRoot === null) {
    return;
  }

  const migration = await migrateLegacyProjectCache(projectRoot);
  if (migration === "migrated") {
    io.stderr.write(
      `warning: migrated legacy ${LEGACY_BRANDING.cacheDir} cache to ${BRANDING.cacheDir}; legacy cache compatibility ends in v0.2.0\n`,
    );
  } else if (migration === "legacy-ignored") {
    io.stderr.write(
      `warning: ignored legacy ${LEGACY_BRANDING.cacheDir} cache because ${BRANDING.cacheDir} already exists; remove ${LEGACY_BRANDING.cacheDir} after verifying the project\n`,
    );
  }

  const cached = await readCacheVersion(projectRoot);
  if (cached === null) {
    if (commandName !== "update" && !existsSync(publicCacheDir(projectRoot))) {
      await refreshProjectCache(projectRoot);
      io.stderr.write(`info: refreshed ${projectRoot}/${BRANDING.cacheDir} for ${BRANDING.packageName} v${VERSION}\n`);
      return;
    }

    io.stderr.write(
      `warning: ${projectRoot}/${BRANDING.cacheDir}/${BRANDING.cacheVersionFileName} is missing; run '${BRANDING.primaryCli} update'\n`,
    );
    return;
  }

  const comparison = compareVersions(VERSION, cached);
  const sourceBundledRoot = bundledRoot();
  const bundledChecksum = await computeBundledChecksum(sourceBundledRoot);
  if (comparison === "match" && cached.bundled_checksum === bundledChecksum) {
    return;
  }

  if (comparison === "mismatch") {
    if (commandName !== "update") {
      await refreshProjectCache(projectRoot, sourceBundledRoot, bundledChecksum);
      io.stderr.write(
        `info: refreshed ${BRANDING.cacheDir} cache from ${BRANDING.packageName} v${cached.harness_version} to installed v${VERSION}\n`,
      );
    }
    return;
  }

  if (comparison === "match") {
    if (commandName !== "update") {
      await refreshProjectCache(projectRoot, sourceBundledRoot, bundledChecksum);
      io.stderr.write(`info: refreshed stale ${BRANDING.cacheDir} bundled cache\n`);
    }
    return;
  }

  const message = [
    `${BRANDING.cacheDir} cache is incompatible with installed ${BRANDING.packageName}: project has v${cached.harness_version}, installed is v${VERSION}.`,
    `Run '${BRANDING.primaryCli} update' to refresh the project cache, or install a matching harness with`,
    `'npm install -g ${BRANDING.packageName}@${cached.harness_version}'.`,
  ].join(" ");

  if (commandName === "update") {
    io.stderr.write(`warning: ${message}\n`);
    return;
  }

  throw new Error(message);
}

async function refreshProjectCache(
  projectRoot: string,
  sourceBundledRoot: string = bundledRoot(),
  bundledChecksum?: string,
): Promise<void> {
  const cacheDir = publicCacheDir(projectRoot);

  for (const dirname of BUNDLED_CACHE_DIRS) {
    await rm(path.join(cacheDir, dirname), { recursive: true, force: true });
  }

  await copyBundledInto(cacheDir, sourceBundledRoot);
  await writeCacheVersion(projectRoot, {
    harness_version: VERSION,
    bundled_checksum: bundledChecksum ?? (await computeBundledChecksum(sourceBundledRoot)),
    locked_at: new Date().toISOString(),
  });
}

function requireProjectRoot(commandName: string): string | null {
  if (commandName === "init") {
    return null;
  }

  try {
    return findProjectRoot();
  } catch (error) {
    if (error instanceof ProjectRootNotFoundError) {
      throw new Error(error.message);
    }
    throw error;
  }
}

function topLevelCommandName(command: Command): string {
  let current = command;

  while (current.parent && current.parent.name() !== BRANDING.primaryCli) {
    current = current.parent;
  }

  return current.name();
}

function normalizeProgramOptions(input: CliIo | ProgramOptions): ProgramOptions & { io: CliIo } {
  if ("stdout" in input && "stderr" in input) {
    return { io: input };
  }

  return {
    io: input.io ?? defaultIo,
    build: input.build,
    doctor: input.doctor,
  };
}
