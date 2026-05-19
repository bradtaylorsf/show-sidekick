import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BRANDING, LEGACY_BRANDING } from "../branding.js";
import { LegacyEnvVarError, MissingEnvError } from "./errors.js";
import { findProjectRoot } from "./project.js";

export function loadEnv(command?: string, root: string = findProjectRoot()): Record<string, string> {
  const files = [
    path.join(root, ".env"),
    ...(command ? [path.join(root, `.env.${command}`)] : []),
    path.join(root, ".env.local"),
  ];
  const values: Record<string, string> = {};

  for (const filePath of files) {
    if (!existsSync(filePath)) {
      continue;
    }

    Object.assign(values, parseEnv(readFileSync(filePath, "utf8")));
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      values[key] = value;
    }
  }

  return values;
}

export function loadEnvIntoProcess(command?: string, root: string = findProjectRoot()): Record<string, string> {
  const values = loadEnv(command, root);

  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }

  return values;
}

export function requireEnv(name: string, command?: string, root?: string): string {
  const value = optionalEnv(name, command, root);

  if (value === undefined) {
    throw new MissingEnvError(name);
  }

  return value;
}

export function requireProcessEnv(name: string): string {
  const value = optionalProcessEnv(name);

  if (value === undefined || value.trim() === "") {
    throw new MissingEnvError(name);
  }

  return value;
}

export function optionalProcessEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value !== undefined) {
    return value;
  }

  const legacyName = legacyNameForPublicEnv(name);
  if (legacyName !== undefined && process.env[legacyName] !== undefined) {
    throw new LegacyEnvVarError(legacyName, name);
  }

  return undefined;
}

export function optionalEnv(name: string, command?: string, root?: string): string | undefined {
  const values = loadEnv(command, root);
  const value = values[name];
  if (value !== undefined) {
    return value;
  }

  const legacyName = legacyNameForPublicEnv(name);
  if (legacyName !== undefined && values[legacyName] !== undefined) {
    throw new LegacyEnvVarError(legacyName, name);
  }

  return undefined;
}

export function legacyNameForPublicEnv(name: string): string | undefined {
  if (!name.startsWith(BRANDING.envPrefix)) {
    return undefined;
  }

  return `${LEGACY_BRANDING.envPrefix}${name.slice(BRANDING.envPrefix.length)}`;
}

function parseEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/u)) {
    const parsed = parseEnvLine(line);

    if (parsed) {
      values[parsed.key] = parsed.value;
    }
  }

  return values;
}

function parseEnvLine(line: string): { key: string; value: string } | undefined {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trimStart() : trimmed;
  const separator = withoutExport.indexOf("=");

  if (separator <= 0) {
    return undefined;
  }

  const key = withoutExport.slice(0, separator).trim();
  const rawValue = withoutExport.slice(separator + 1).trim();

  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) {
    return undefined;
  }

  return {
    key,
    value: unquote(rawValue),
  };
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
