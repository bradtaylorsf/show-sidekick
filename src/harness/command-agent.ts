import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectDir } from "../checkpoints/paths.js";
import { resolve as resolveProjectResource } from "../paths/project.js";
import type { StageContext } from "./context.js";
import type { Dispatcher } from "./dispatcher.js";
import { StageEventSchema, type StageEvent } from "./events.js";
import { StageResultSchema, type StageResult } from "./result.js";

export type CommandAgentDispatcherOptions = {
  /** Shell command that runs one headless agent turn, e.g. `claude -p --permission-mode acceptEdits`. */
  command: string;
  projectRoot: string;
  target: string;
  timeoutMs: number;
  emit?(event: StageEvent): void | Promise<void>;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
};

export class CommandAgentStageError extends Error {
  constructor(stage: string, message: string) {
    super(`stage '${stage}' agent failed: ${message}`);
    this.name = "CommandAgentStageError";
  }
}

const OUTPUT_TAIL_CHARS = 2000;

/**
 * Runs each stage by spawning a fresh headless agent process. The stage brief is
 * written to the process's stdin; the agent reports back with a `stage_completed`
 * (or `stage_failed`) NDJSON line on stdout, or by writing that event to the file
 * named in SHOWKICK_STAGE_RESULT_FILE.
 */
export function createCommandAgentDispatcher(options: CommandAgentDispatcherOptions): Dispatcher {
  return async (ctx) => {
    const startedEvent: StageEvent = {
      event: "stage_started",
      stage: ctx.stage.slug,
      timestamp: (options.now?.() ?? new Date()).toISOString(),
      payload: {
        stage: ctx.stage,
        sample: ctx.runOptions.sample,
        agent_command: options.command,
      },
    };
    await options.emit?.(startedEvent);

    const scratchDir = await mkdtemp(path.join(tmpdir(), "showkick-stage-"));
    const resultFile = path.join(scratchDir, "stage-result.json");

    try {
      const run = await runAgentProcess({
        command: options.command,
        cwd: options.projectRoot,
        stdin: buildStagePrompt(ctx, options, resultFile),
        timeoutMs: options.timeoutMs,
        env: {
          ...process.env,
          ...options.env,
          SHOWKICK_STAGE: ctx.stage.slug,
          SHOWKICK_TARGET: options.target,
          SHOWKICK_PROJECT_ROOT: options.projectRoot,
          SHOWKICK_STAGE_RESULT_FILE: resultFile,
        },
      });

      const event = (await readResultFile(resultFile, ctx.stage.slug)) ?? findStageEvent(run.stdout, ctx.stage.slug);

      if (event?.event === "stage_failed") {
        throw new CommandAgentStageError(ctx.stage.slug, failureMessage(event.payload));
      }

      if (event === undefined) {
        const reason = run.timedOut
          ? `timed out after ${Math.round(options.timeoutMs / 1000)}s`
          : `exited with code ${run.exitCode ?? "null"} without reporting a stage_completed event`;
        throw new CommandAgentStageError(ctx.stage.slug, `${reason}${outputTail(run)}`);
      }

      return parseStageResult(ctx.stage.slug, event.payload);
    } finally {
      await rm(scratchDir, { recursive: true, force: true });
    }
  };
}

export function buildStagePrompt(ctx: StageContext, options: Pick<CommandAgentDispatcherOptions, "projectRoot" | "target">, resultFile: string): string {
  const stage = ctx.stage;
  const artifactsDir = projectDir(options.projectRoot, ctx.show.slug, ctx.episode.slug);
  const budget = ctx.runOptions.budget_usd ?? ctx.pipeline.orchestration.budget_default_usd;
  const revisionNotes = ctx.revision_notes.length > 0 ? ctx.revision_notes.map((note) => `- ${note}`).join("\n") : "- none";

  return [
    `You are running stage '${stage.slug}' of the '${ctx.pipeline.slug}' pipeline for Show Sidekick episode ${options.target}.`,
    "Nobody is watching this run. Do the stage end to end without asking questions, then report the result.",
    "",
    "## Inputs",
    `- Project root (your working directory): ${options.projectRoot}`,
    `- Stage director skill: ${skillPath(stage.skill, options.projectRoot)}`,
    `- Prior artifacts directory: ${artifactsDir}`,
    `- Artifacts required in: ${stage.required_artifacts_in.join(", ") || "none"}`,
    `- Produces: ${stage.produces}${stage.produces_artifacts.length > 0 ? ` (${stage.produces_artifacts.join(", ")})` : ""}`,
    `- Tools available through the registry: ${stage.tools_available.join(", ") || "none"}`,
    `- Mode: ${ctx.runOptions.sample ? "sample" : "full"}; budget for the episode: $${budget}`,
    "- Revision notes for this stage:",
    revisionNotes,
    "",
    "## Steps",
    "1. Read the stage director skill in full, plus any skills it points to, before doing any work.",
    "2. Call generation tools through the registry, never directly. Stay inside the budget.",
    "3. Self-review the artifact against the stage's review_focus and success_criteria and revise once if needed.",
    "4. Do not write the produced artifact file or checkpoint yourself; the harness writes them from your result.",
    "",
    "## Reporting the result",
    "When finished, report exactly one JSON object on a single line, either as the last line of your output",
    `or written to ${resultFile}:`,
    "",
    `{"event":"stage_completed","stage":"${stage.slug}","timestamp":"<ISO-8601>","payload":{"artifact":<the ${stage.produces} artifact JSON>,"cost_used":{"stage_cost_usd":0,"total_so_far_usd":0,"budget_remaining_usd":${budget}},"decisions":[]}}`,
    "",
    `If the stage cannot be completed, report {"event":"stage_failed","stage":"${stage.slug}","timestamp":"<ISO-8601>","payload":{"message":"<why>"}} instead.`,
    "",
    "## Stage definition",
    "```json",
    JSON.stringify(stage, null, 2),
    "```",
    "",
  ].join("\n");
}

function skillPath(skill: string, projectRoot: string): string {
  try {
    return resolveProjectResource("skills", skill, projectRoot);
  } catch {
    return skill;
  }
}

type AgentRun = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

function runAgentProcess(input: {
  command: string;
  cwd: string;
  stdin: string;
  timeoutMs: number;
  env: NodeJS.ProcessEnv;
}): Promise<AgentRun> {
  return new Promise((resolvePromise, reject) => {
    // Detached so the shell and everything the agent starts share a process group we can kill on timeout.
    const detached = process.platform !== "win32";
    const child = spawn(input.command, { cwd: input.cwd, env: input.env, shell: true, detached, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const killAgent = (): void => killProcessTree(child.pid, detached, () => child.kill("SIGTERM"));
    const timer = setTimeout(() => {
      timedOut = true;
      killAgent();
    }, input.timeoutMs);
    // The detached group does not receive the terminal's Ctrl-C, so take it down when showkick exits.
    process.once("exit", killAgent);

    child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      process.off("exit", killAgent);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      process.off("exit", killAgent);
      resolvePromise({ stdout, stderr, exitCode, timedOut });
    });
    // An agent that ignores stdin closes the pipe early; that is not a failure.
    child.stdin.on("error", () => undefined);
    child.stdin.end(input.stdin);
  });
}

function killProcessTree(pid: number | undefined, grouped: boolean, fallback: () => void): void {
  if (pid === undefined || !grouped) {
    fallback();
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    fallback();
  }
}

async function readResultFile(file: string, stage: string): Promise<StageEvent | undefined> {
  if (!existsSync(file)) {
    return undefined;
  }

  const text = await readFile(file, "utf8");
  return findStageEvent(text, stage) ?? parseStageEventJson(text.trim(), stage);
}

/** Finds the last stage_completed / stage_failed event for this stage in free-form agent output. */
export function findStageEvent(output: string, stage: string): StageEvent | undefined {
  const lines = output.split("\n");

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const event = parseStageEventJson(lines[index]?.trim() ?? "", stage);
    if (event !== undefined) {
      return event;
    }
  }

  return undefined;
}

function parseStageEventJson(text: string, stage: string): StageEvent | undefined {
  if (!text.startsWith("{")) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }

  const event = StageEventSchema.safeParse(parsed);
  if (!event.success || event.data.stage !== stage || event.data.event === "stage_started") {
    return undefined;
  }

  return event.data;
}

function parseStageResult(stage: string, payload: unknown): StageResult {
  const parsed = StageResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new CommandAgentStageError(stage, `stage_completed payload is not a valid stage result: ${parsed.error.message}`);
  }

  return parsed.data;
}

function failureMessage(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }

  return "agent reported stage_failed";
}

function outputTail(run: AgentRun): string {
  const tail = (run.stderr.trim() || run.stdout.trim()).slice(-OUTPUT_TAIL_CHARS);
  return tail.length > 0 ? `\n--- agent output (tail) ---\n${tail}` : "";
}
