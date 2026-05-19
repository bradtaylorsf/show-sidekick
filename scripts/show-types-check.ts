#!/usr/bin/env tsx

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateShowTypeCatalog } from "./lib/show-types-catalog.ts";

export type ShowTypesCheckResult = {
  readonly status: "passed" | "failed";
  readonly lane_count: number;
  readonly pipeline_lane_count: number;
  readonly starter_lane_count: number;
  readonly errors: readonly string[];
  readonly exitCode: number;
};

export type ShowTypesCheckOptions = {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly write?: (line: string) => void;
};

class UsageError extends Error {
  readonly exitCode = 2;
}

export async function runShowTypesCheck(options: ShowTypesCheckOptions = {}): Promise<ShowTypesCheckResult> {
  const args = parseArgs(options.argv ?? []);
  const repoRoot = path.resolve(options.repoRoot ?? findRepoRoot());
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const validation = await validateShowTypeCatalog({ repoRoot });
  const pipelineLaneCount = validation.catalog.rows.filter((row) => row.laneId.startsWith("pipeline:")).length;
  const starterLaneCount = validation.catalog.rows.filter((row) => row.laneId.startsWith("starter:")).length;
  const result: ShowTypesCheckResult = {
    status: validation.errors.length === 0 ? "passed" : "failed",
    lane_count: validation.catalog.rows.length,
    pipeline_lane_count: pipelineLaneCount,
    starter_lane_count: starterLaneCount,
    errors: validation.errors,
    exitCode: validation.errors.length === 0 ? 0 : 1,
  };

  if (args.json) {
    write(`${JSON.stringify(result)}\n`);
  } else if (result.status === "passed") {
    write(
      `show-types:check passed: ${result.lane_count} lanes (${result.pipeline_lane_count} pipelines, ${result.starter_lane_count} starters)\n`,
    );
  } else {
    write(`show-types:check failed with ${result.errors.length} issue(s):\n`);
    for (const error of result.errors) {
      write(`- ${error}\n`);
    }
  }

  return result;
}

function parseArgs(argv: readonly string[]): { readonly json: boolean } {
  let json = false;
  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usageText());
    }
    throw new UsageError(`unknown option '${arg}'\n${usageText()}`);
  }
  return { json };
}

function usageText(): string {
  return [
    "Usage: pnpm show-types:check [--json]",
    "",
    "Validates docs/show-types.md against bundled public pipeline and starter inventory without rendering.",
  ].join("\n");
}

function findRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runShowTypesCheck({ argv });
    process.exitCode = result.exitCode;
  } catch (error) {
    const exitCode = error instanceof UsageError ? error.exitCode : 1;
    process.stderr.write(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
    process.exitCode = exitCode;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url && process.env.VITEST_WORKER_ID === undefined) {
  await main();
}
