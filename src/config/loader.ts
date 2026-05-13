import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { ZodIssue, ZodType } from "zod";
import { ConfigError, type ConfigIssue } from "./errors.js";

type ErrorWithCode = Error & { code?: string };
type YamlErrorLike = Error & {
  linePos?: Array<{ line: number; col: number }>;
};

export async function loadYaml<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  const raw = await readConfigFile(filePath);
  let parsed: unknown;

  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const yamlError = error as YamlErrorLike;
    const position = yamlError.linePos?.[0];

    throw new ConfigError({
      filePath,
      line: position?.line,
      column: position?.col,
      issues: [{ path: "", message: yamlError.message }],
    });
  }

  return parseWithSchema(filePath, parsed, schema);
}

export async function loadJson<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  const raw = await readConfigFile(filePath);
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    const jsonError = error as Error;
    const position = parseJsonErrorPosition(jsonError.message);
    const location = position ? offsetToLineColumn(raw, position) : undefined;

    throw new ConfigError({
      filePath,
      line: location?.line,
      column: location?.column,
      issues: [{ path: "", message: jsonError.message }],
    });
  }

  return parseWithSchema(filePath, parsed, schema);
}

async function readConfigFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const fileError = error as ErrorWithCode;

    if (fileError.code === "ENOENT") {
      throw new ConfigError({
        filePath,
        issues: [{ path: "", message: "file not found" }],
      });
    }

    throw error;
  }
}

function parseWithSchema<T>(filePath: string, value: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ConfigError({
      filePath,
      issues: result.error.issues.map(toConfigIssue),
    });
  }

  return result.data;
}

function toConfigIssue(issue: ZodIssue): ConfigIssue {
  return {
    path: issue.path.join("."),
    message: issue.message,
  };
}

function parseJsonErrorPosition(message: string): number | undefined {
  const match = /position (\d+)/u.exec(message);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function offsetToLineColumn(value: string, offset: number): { line: number; column: number } {
  const before = value.slice(0, offset);
  const lines = before.split("\n");

  return {
    line: lines.length,
    column: lines.at(-1)?.length ?? 0,
  };
}
