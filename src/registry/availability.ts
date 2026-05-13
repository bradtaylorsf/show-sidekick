import { exec, execFile } from "node:child_process";
import { createRequire } from "node:module";
import type { Availability, Integration } from "./tool.js";

export const DEFAULT_PROBE_TIMEOUT_MS = 3_000;
export const DEFAULT_AVAILABILITY_CONCURRENCY = 8;

type ProbeOptions = {
  timeoutMs?: number;
};

type CommandResult = {
  ok: boolean;
  timedOut: boolean;
};

const requireFromRegistry = createRequire(import.meta.url);

export async function probe(integration: Integration, options: ProbeOptions = {}): Promise<Availability> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

  switch (integration.kind) {
    case "cli":
      return probeCli(integration, timeoutMs);
    case "api":
      return envAvailability(integration.env);
    case "binary":
      return probeBinary(integration.binary, timeoutMs);
    case "library":
      return probeLibrary(integration.package);
  }
}

export async function withConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index] as T, index);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`probe timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function probeCli(integration: Extract<Integration, { kind: "cli" }>, timeoutMs: number): Promise<Availability> {
  const binary = await probeBinary(integration.binary, timeoutMs);

  if (!binary.available) {
    return binary;
  }

  if (integration.auth.mode === "none") {
    return { available: true };
  }

  if (integration.auth.mode === "env") {
    return envAvailability(integration.auth.env);
  }

  const authTimeoutMs = integration.auth.timeoutMs ?? timeoutMs;
  const result = await runShell(integration.auth.check, authTimeoutMs);

  if (result.ok) {
    return { available: true };
  }

  if (result.timedOut) {
    return { available: false, reason: "auth check timed out", fix: "cli-login" };
  }

  return { available: false, reason: "not-authenticated", fix: "cli-login" };
}

async function probeBinary(binary: string, timeoutMs: number): Promise<Availability> {
  const result = await runFile("which", [binary], timeoutMs);

  if (result.ok) {
    return { available: true };
  }

  return { available: false, reason: `binary not on PATH: ${binary}`, fix: "install" };
}

function probeLibrary(packageName: string): Availability {
  try {
    requireFromRegistry.resolve(packageName);
    return { available: true };
  } catch {
    return { available: false, reason: `package not installed: ${packageName}`, fix: "install" };
  }
}

function envAvailability(env: string[]): Availability {
  const missing = env.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });

  if (missing.length === 0) {
    return { available: true };
  }

  return { available: false, reason: `missing env: ${missing.join(", ")}`, fix: "env" };
}

function runFile(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = execFile(command, args, (error) => {
      resolve({ ok: error === null, timedOut });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.once("exit", () => clearTimeout(timeout));
  });
}

function runShell(command: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve) => {
    let timedOut = false;
    const child = exec(command, (error) => {
      resolve({ ok: error === null, timedOut });
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.once("exit", () => clearTimeout(timeout));
  });
}
