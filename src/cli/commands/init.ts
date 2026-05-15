import { spawn } from "node:child_process";
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { loadYaml } from "../../config/loader.js";
import { ProjectAlreadyInitializedError } from "../../paths/errors.js";
import { ShowSchema, type Show } from "../../shows/show.js";
import { bundledRoot, computeBundledChecksum, copyBundledInto } from "../../version/bundled.js";
import { writeCacheVersion } from "../../version/cache.js";
import { VERSION } from "../../version.js";
import { safeSlug, scaffoldShow } from "../scaffold/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type ErrorWithCode = Error & { code?: string };

type InitOptions = GlobalOptions & {
  git?: boolean;
  starter?: string;
};

type InitEvent = {
  event: "project_initialized";
  path: string;
  starter?: string;
  git: boolean;
};

export type RunGit = (args: string[], cwd: string) => Promise<void>;

export type InitHandlerDeps = {
  bundledRoot?: () => string;
  copyBundledInto?: (targetPreditDir: string) => Promise<void>;
  computeBundledChecksum?: () => Promise<string>;
  writeCacheVersion?: typeof writeCacheVersion;
  scaffoldShow?: typeof scaffoldShow;
  runGit?: RunGit;
  now?: () => Date;
  cwd?: () => string;
};

export function createInitHandler(io: CliIo, deps: InitHandlerDeps = {}) {
  return async (...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<InitOptions>();
    const projectRoot = path.resolve((deps.cwd ?? process.cwd)());
    const sourceBundledRoot = (deps.bundledRoot ?? bundledRoot)();
    const starter = options.starter ? safeSlug(options.starter, "starter") : undefined;

    await assertNotInitialized(projectRoot);
    if (starter) {
      await assertStarterExists(sourceBundledRoot, starter);
      await assertStarterPipelinesResolve(sourceBundledRoot, starter);
    }

    await mkdir(path.join(projectRoot, ".predit"), { recursive: true });
    await mkdir(path.join(projectRoot, "shows"), { recursive: true });
    await mkdir(path.join(projectRoot, "projects"), { recursive: true });
    await mkdir(path.join(projectRoot, "music_library"), { recursive: true });
    await copyUserProjectTemplates(sourceBundledRoot, projectRoot);

    const copyCache = deps.copyBundledInto ?? ((targetPreditDir: string) => copyBundledInto(targetPreditDir, sourceBundledRoot));
    await copyCache(path.join(projectRoot, ".predit"));

    const bundledChecksum = await (deps.computeBundledChecksum ?? (() => computeBundledChecksum(sourceBundledRoot)))();
    await (deps.writeCacheVersion ?? writeCacheVersion)(projectRoot, {
      harness_version: VERSION,
      bundled_checksum: bundledChecksum,
      locked_at: (deps.now ?? (() => new Date()))().toISOString(),
    });

    if (starter) {
      await (deps.scaffoldShow ?? scaffoldShow)(projectRoot, { slug: starter, fromStarter: starter });
    }

    if (options.git) {
      const runGit = deps.runGit ?? defaultRunGit;
      await runGit(["init"], projectRoot);
      await runGit(["add", "."], projectRoot);
      await runGit(["commit", "-m", "Initial predit project scaffold."], projectRoot);
    }

    emitInitialized(io, options, {
      event: "project_initialized",
      path: projectRoot,
      starter,
      git: options.git === true,
    });
  };
}

async function assertNotInitialized(projectRoot: string): Promise<void> {
  if ((await exists(path.join(projectRoot, "CLAUDE.md"))) || (await exists(path.join(projectRoot, ".predit")))) {
    throw new ProjectAlreadyInitializedError(projectRoot);
  }
}

async function assertStarterExists(sourceBundledRoot: string, starter: string): Promise<void> {
  const showPath = path.join(sourceBundledRoot, "starters", starter, "show.yaml");
  if (!(await exists(showPath))) {
    throw new Error(`starter '${starter}' not found at ${showPath}`);
  }
}

export class StarterPipelineMissingError extends Error {
  constructor(starter: string, pipeline: string, manifestPath: string) {
    super(
      `starter '${starter}' references bundled pipeline '${pipeline}', but no bundled manifest exists at ${manifestPath}. ` +
        "Update the starter show.yaml to use a real bundled pipeline slug or remove the starter from the bundled set.",
    );
    this.name = "StarterPipelineMissingError";
  }
}

async function assertStarterPipelinesResolve(sourceBundledRoot: string, starter: string): Promise<void> {
  const showPath = path.join(sourceBundledRoot, "starters", starter, "show.yaml");
  const show = (await loadYaml(showPath, ShowSchema)) as Show;

  for (const pipeline of Object.keys(show.pipelines)) {
    const manifestPath = path.join(sourceBundledRoot, "pipelines", `${pipeline}.yaml`);
    if (!(await exists(manifestPath))) {
      throw new StarterPipelineMissingError(starter, pipeline, manifestPath);
    }
  }
}

async function copyUserProjectTemplates(sourceBundledRoot: string, projectRoot: string): Promise<void> {
  const templateRoot = path.join(sourceBundledRoot, "templates", "user-project");

  await cp(path.join(templateRoot, "CLAUDE.md"), path.join(projectRoot, "CLAUDE.md"), {
    errorOnExist: true,
    force: false,
  });
  await cp(path.join(templateRoot, "AGENTS.md"), path.join(projectRoot, "AGENTS.md"), {
    errorOnExist: true,
    force: false,
  });
  await cp(path.join(templateRoot, ".gitignore"), path.join(projectRoot, ".gitignore"), {
    errorOnExist: true,
    force: false,
  });
}

async function defaultRunGit(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git ${args.join(" ")} failed${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function emitInitialized(io: CliIo, options: InitOptions, event: InitEvent): void {
  if (options.json) {
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  const starter = event.starter ? ` with starter '${event.starter}'` : "";
  const git = event.git ? " and initialized git" : "";
  io.stdout.write(`init: scaffolded predit project at ${event.path}${starter}${git}\n`);
}
