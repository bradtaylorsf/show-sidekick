import { exec, execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { ComfyClient } from "../../comfy/client.js";
import { ENGINES, type EngineId } from "../../comfy/models.js";
import { detectHardware } from "../../comfy/platform.js";
import { runComfySetup, type ComfySetupDeps, type ComfySetupOptions, type ComfySetupStep } from "../../comfy/setup.js";
import type { CliIo } from "./stub.js";

/** Tool names that route to the guided ComfyUI setup instead of a one-line install. */
export const COMFY_SETUP_NAMES = new Set(["comfy", "comfyui", "comfy_image", "comfy_video", "comfy_text_to_video", "comfy_upscale"]);

export type ComfySetupCliOptions = {
  engines?: string;
  skipModels?: boolean;
  workspace?: string;
  json?: boolean;
  dryRun?: boolean;
};

export type ComfySetupRunner = (options: ComfySetupCliOptions, io: CliIo) => Promise<ComfySetupStep[]>;

export function parseEngineList(value: string | undefined): EngineId[] | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }

  const ids = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const unknown = ids.filter((id) => !(id in ENGINES));
  if (unknown.length > 0) {
    throw new Error(`unknown ComfyUI engine ${unknown.join(", ")}; expected one of: ${Object.keys(ENGINES).join(", ")}`);
  }

  return ids as EngineId[];
}

export function createComfySetupRunner(overrides: Partial<ComfySetupDeps> & { isTty?: () => boolean } = {}): ComfySetupRunner {
  return async (options, io) => {
    const json = options.json === true;
    const isTty = overrides.isTty ?? (() => process.stdin.isTTY === true && process.stdout.isTTY === true);
    const setupOptions: ComfySetupOptions = {
      engines: parseEngineList(options.engines),
      skipModels: options.skipModels === true,
      workspace: options.workspace,
      // A yes can only come from a person at a terminal: --json, --dry-run and piped
      // runs print the plan and touch nothing.
      planOnly: json || options.dryRun === true || !isTty(),
    };
    const deps: ComfySetupDeps = {
      write: json ? () => undefined : (line) => io.stdout.write(`${line}\n`),
      confirm: overrides.confirm ?? confirmOnTty,
      run: overrides.run ?? runStreaming,
      capture: overrides.capture ?? runQuiet,
      commandExists: overrides.commandExists ?? commandExists,
      hardware: overrides.hardware ?? (() => detectHardware()),
      client: overrides.client ?? new ComfyClient(),
      sleep: overrides.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    };

    const steps = await runComfySetup(setupOptions, deps);
    if (json) {
      for (const step of steps) {
        io.stdout.write(`${JSON.stringify({ event: "comfy_setup_step", plan_only: setupOptions.planOnly, ...step })}\n`);
      }
    }
    return steps;
  };
}

async function confirmOnTty(question: string): Promise<boolean> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await readline.question(question)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    readline.close();
  }
}

function runStreaming(command: { command: string; args: string[] }): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(command.command, command.args, { stdio: "inherit" });
    child.once("error", () => resolve({ ok: false, stdout: "" }));
    child.once("exit", (code) => resolve({ ok: code === 0, stdout: "" }));
  });
}

function runQuiet(command: { command: string; args: string[] }): Promise<{ ok: boolean; stdout: string }> {
  return new Promise((resolve) => {
    execFile(command.command, command.args, { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve({ ok: error === null, stdout: String(stdout) });
    });
  });
}

function commandExists(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(`command -v '${binary.replace(/'/gu, "'\\''")}'`, (error) => resolve(error === null));
  });
}
