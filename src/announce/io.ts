import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { current, type LoggerMode } from "../log/mode.js";

export type InteractionMode = "interactive" | "non_interactive" | Pick<LoggerMode, "json">;

export type AnnounceIO = {
  write?: (message: string) => void;
  event?: (event: string, payload: unknown) => void;
  prompt?: (message: string) => boolean | string | Promise<boolean | string>;
};

export function isNonInteractive(mode?: InteractionMode): boolean {
  if (mode === "non_interactive") {
    return true;
  }

  if (mode === "interactive") {
    return false;
  }

  return mode?.json ?? current().json;
}

export function writeHuman(io: AnnounceIO | undefined, message: string): void {
  if (io?.write !== undefined) {
    io.write(message);
    return;
  }

  process.stderr.write(`${message}\n`);
}

export function emitNdjson(io: AnnounceIO | undefined, event: string, payload: unknown): void {
  if (io?.event !== undefined) {
    io.event(event, payload);
    return;
  }

  process.stdout.write(`${JSON.stringify({ event, ...objectPayload(payload) })}\n`);
}

export async function askForApproval(io: AnnounceIO | undefined, message: string): Promise<boolean> {
  const answer = io?.prompt === undefined ? await promptOnStdin(message) : await io.prompt(message);

  if (typeof answer === "boolean") {
    return answer;
  }

  return isAffirmative(answer);
}

function objectPayload(payload: unknown): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload) ? (payload as Record<string, unknown>) : { payload };
}

async function promptOnStdin(message: string): Promise<string> {
  const readline = createInterface({ input, output });
  try {
    return await readline.question(message);
  } finally {
    readline.close();
  }
}

function isAffirmative(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "y" || normalized === "yes" || normalized === "approve" || normalized === "approved" || normalized === "confirm";
}
