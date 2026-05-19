import { spawn } from "node:child_process";
import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { BRANDING } from "../../branding.js";
import { loadYaml } from "../../config/loader.js";
import { ProjectAlreadyInitializedError } from "../../paths/errors.js";
import { legacyCacheDir, publicCacheDir } from "../../paths/project.js";
import { ShowSchema, type Show } from "../../shows/show.js";
import { bundledRoot, computeBundledChecksum, copyBundledInto, syncAgentSkillMirrors } from "../../version/bundled.js";
import { writeCacheVersion } from "../../version/cache.js";
import { VERSION } from "../../version.js";
import { safeSlug, scaffoldShow } from "../scaffold/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type ErrorWithCode = Error & { code?: string };

type InitOptions = GlobalOptions & {
  git?: boolean;
  starter?: string;
  setupRuntimes?: boolean;
};

type InitEvent = {
  event: "project_initialized";
  path: string;
  starter?: string;
  git: boolean;
  setup_runtimes?: boolean;
};

export type RunGit = (args: string[], cwd: string) => Promise<void>;

export type InitHandlerDeps = {
  bundledRoot?: () => string;
  copyBundledInto?: (targetCacheDir: string) => Promise<void>;
  computeBundledChecksum?: () => Promise<string>;
  writeCacheVersion?: typeof writeCacheVersion;
  scaffoldShow?: typeof scaffoldShow;
  runGit?: RunGit;
  setupRuntimes?: (projectRoot: string) => Promise<void>;
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

    const setupRuntimes = shouldSetupRuntimes(options);
    if (setupRuntimes && deps.setupRuntimes === undefined) {
      await assertRuntimeSetupPrerequisites(projectRoot);
    }

    const cacheDir = publicCacheDir(projectRoot);
    await mkdir(cacheDir, { recursive: true });
    await mkdir(path.join(projectRoot, "shows"), { recursive: true });
    await mkdir(path.join(projectRoot, "projects"), { recursive: true });
    await mkdir(path.join(projectRoot, "music_library"), { recursive: true });
    await copyUserProjectTemplates(sourceBundledRoot, projectRoot);

    const copyCache = deps.copyBundledInto ?? ((targetCacheDir: string) => copyBundledInto(targetCacheDir, sourceBundledRoot));
    await copyCache(cacheDir);
    await syncAgentSkillMirrors(projectRoot);

    const bundledChecksum = await (deps.computeBundledChecksum ?? (() => computeBundledChecksum(sourceBundledRoot)))();
    await (deps.writeCacheVersion ?? writeCacheVersion)(projectRoot, {
      harness_version: VERSION,
      bundled_checksum: bundledChecksum,
      locked_at: (deps.now ?? (() => new Date()))().toISOString(),
    });

    if (starter) {
      await (deps.scaffoldShow ?? scaffoldShow)(projectRoot, { slug: starter, fromStarter: starter });
    }

    if (setupRuntimes) {
      await (deps.setupRuntimes ?? defaultSetupRuntimes)(projectRoot);
    }

    if (options.git) {
      const runGit = deps.runGit ?? defaultRunGit;
      await runGit(["init"], projectRoot);
      await runGit(["add", "."], projectRoot);
      await runGit(["commit", "-m", `Initial ${BRANDING.productDisplayName} project scaffold.`], projectRoot);
    }

    emitInitialized(io, options, {
      event: "project_initialized",
      path: projectRoot,
      starter,
      git: options.git === true,
      setup_runtimes: setupRuntimes,
    });
  };
}

async function assertNotInitialized(projectRoot: string): Promise<void> {
  if (
    (await exists(path.join(projectRoot, "AGENTS.md"))) ||
    (await exists(path.join(projectRoot, "CLAUDE.md"))) ||
    (await exists(publicCacheDir(projectRoot))) ||
    (await exists(legacyCacheDir(projectRoot)))
  ) {
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
  await copyTemplateFile(templateRoot, ".gitignore", path.join(projectRoot, ".gitignore"));
  await copyTemplateFile(templateRoot, ".env.example", path.join(projectRoot, ".env.example"));
  await copyTemplateFile(templateRoot, ".env.example", path.join(projectRoot, ".env"));
}

async function copyTemplateFile(templateRoot: string, sourceName: string, targetPath: string): Promise<void> {
  const sourcePath = await resolveTemplatePath(templateRoot, sourceName);
  await cp(sourcePath, targetPath, {
    errorOnExist: true,
    force: false,
  });
}

async function resolveTemplatePath(templateRoot: string, sourceName: string): Promise<string> {
  const dotfilePath = path.join(templateRoot, sourceName);
  if (await exists(dotfilePath)) {
    return dotfilePath;
  }

  const packedTemplatePath = path.join(templateRoot, packedTemplateName(sourceName));
  if (await exists(packedTemplatePath)) {
    return packedTemplatePath;
  }

  return dotfilePath;
}

function packedTemplateName(sourceName: string): string {
  switch (sourceName) {
    case ".env.example":
      return "env.example.template";
    case ".gitignore":
      return "gitignore.template";
    default:
      return sourceName;
  }
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

async function defaultSetupRuntimes(projectRoot: string): Promise<void> {
  await assertRuntimeSetupPrerequisites(projectRoot);
  await runCommand(
    [
      "install",
      "--save-dev",
      "remotion",
      "react",
      "react-dom",
      "@remotion/renderer",
      "@remotion/cli",
      "zod@4.3.6",
    ],
    projectRoot,
  );
  await runCommand(["install", "--save-dev", "hyperframes"], projectRoot);
}

async function assertRuntimeSetupPrerequisites(projectRoot: string): Promise<void> {
  const major = Number(process.versions.node.split(".")[0] ?? "0");
  if (!Number.isFinite(major) || major < 22) {
    throw new Error(
      `runtime setup requires Node 22+; current Node is ${process.versions.node}. ` +
        `Install or switch to Node 22+, then rerun \`${BRANDING.primaryCli} init\`. ` +
        "If an agent is helping, it should ask before installing system prerequisites.",
    );
  }

  try {
    await runCommand(["--version"], projectRoot);
  } catch (error) {
    throw new Error(
      "runtime setup requires npm on PATH so Remotion and HyperFrames can be installed locally. " +
        `Install Node 22+ from https://nodejs.org/ or through your preferred package manager, then rerun \`${BRANDING.primaryCli} init\`. ` +
        "If an agent is helping, it should ask before installing system prerequisites.",
      { cause: error },
    );
  }
}

async function runCommand(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npm", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
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

      reject(new Error(`npm ${args.join(" ")} failed${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

function shouldSetupRuntimes(options: InitOptions): boolean {
  return options.setupRuntimes !== false;
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
  const runtimes = event.setup_runtimes ? " and installed Remotion/HyperFrames" : "";
  const nextSteps = event.starter
    ? [
        "next:",
        "  edit .env with any provider keys you want to use",
        `  ${BRANDING.primaryCli} doctor --profile paid-demo`,
        ...(event.setup_runtimes
          ? []
          : [`  ${BRANDING.primaryCli} setup runtimes  # optional: install Remotion + HyperFrames locally`]),
        `  ${BRANDING.primaryCli} build ${event.starter}/sample-episode --sample`,
        `  ${BRANDING.primaryCli} export ${event.starter}/sample-episode --target premiere`,
      ]
    : [
        "next:",
        "  edit .env with any provider keys you want to use",
        `  ${BRANDING.primaryCli} doctor --profile paid-demo`,
        ...(event.setup_runtimes
          ? []
          : [`  ${BRANDING.primaryCli} setup runtimes  # optional: install Remotion + HyperFrames locally`]),
        `  ${BRANDING.primaryCli} ls starters`,
        `  ${BRANDING.primaryCli} new show first-video --from animated-explainer`,
      ];
  const agentPrompt = [
    `agent prompt: "Read AGENTS.md and ${BRANDING.cacheDir}/skills/meta/onboarding.md. Ask me what I do and what I want to make, suggest three personalized no-key first-video ideas, then render a 30-second animated ${BRANDING.productDisplayName} explainer with local TTS and Remotion when available."`,
  ];

  io.stdout.write(
    `init: scaffolded ${BRANDING.productDisplayName} project at ${event.path}${starter}${git}${runtimes}\n${[...nextSteps, ...agentPrompt].join("\n")}\n`,
  );
}
