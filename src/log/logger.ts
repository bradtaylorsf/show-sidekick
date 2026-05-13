import pc from "picocolors";
import { current } from "./mode.js";

type LogLevel = "info" | "warn" | "error" | "debug";
type JsonLog = {
  ts: string;
  level: LogLevel | "event";
  msg?: string;
  name?: string;
  meta?: unknown;
  payload?: unknown;
};

export function info(msg: string, meta?: unknown): void {
  writeMessage("info", msg, meta);
}

export function warn(msg: string, meta?: unknown): void {
  writeMessage("warn", msg, meta);
}

export function error(msg: string, meta?: unknown): void {
  writeMessage("error", msg, meta);
}

export function debug(msg: string, meta?: unknown): void {
  if (!current().verbose) {
    return;
  }

  writeMessage("debug", msg, meta);
}

export function event(name: string, payload?: unknown): void {
  process.stdout.write(`${JSON.stringify(serializeEvent(name, payload))}\n`);
}

function writeMessage(level: LogLevel, msg: string, meta?: unknown): void {
  const mode = current();

  if (mode.json) {
    const line = `${JSON.stringify(serializeMessage(level, msg, meta))}\n`;
    const stream = level === "error" || level === "debug" ? process.stderr : process.stdout;
    stream.write(line);
    return;
  }

  const line = `${formatHuman(level, msg, meta, mode.color)}\n`;
  const stream = level === "info" ? process.stdout : process.stderr;
  stream.write(line);
}

function serializeMessage(level: LogLevel, msg: string, meta?: unknown): JsonLog {
  return {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta === undefined ? {} : { meta }),
  };
}

function serializeEvent(name: string, payload?: unknown): JsonLog {
  return {
    ts: new Date().toISOString(),
    level: "event",
    name,
    ...(payload === undefined ? {} : { payload }),
  };
}

function formatHuman(level: LogLevel, msg: string, meta: unknown, useColor: boolean): string {
  const colors = pc.createColors(useColor);
  const suffix = meta === undefined ? "" : ` ${JSON.stringify(meta)}`;

  switch (level) {
    case "info":
      return `${colors.cyan("info")} ${msg}${suffix}`;
    case "warn":
      return `${colors.yellow("warn")} ${msg}${suffix}`;
    case "error":
      return `${colors.red("error")} ${msg}${suffix}`;
    case "debug":
      return `${colors.dim("debug")} ${msg}${suffix}`;
  }
}
