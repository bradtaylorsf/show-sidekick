#!/usr/bin/env tsx

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  classifyShowTypeLaneStatus,
  parseDemoMatrixArgs,
  runDemoMatrix,
  type DemoMatrixResult,
  type DemoMatrixRunOptions,
  type ShowTypeLaneStatus,
} from "./demo-matrix.ts";
import {
  sampleSupportAllowsMode,
  validateShowTypeCatalog,
  type ShowTypeCatalogResolution,
} from "./lib/show-types-catalog.ts";
import {
  buildShowTypeMatrixReport,
  renderShowTypeMatrixMarkdown,
  writeShowTypeMatrixReports,
  type ShowTypeMatrixLaneReport,
  type ShowTypeMatrixReport,
} from "./lib/show-types-report.ts";

export type ShowTypeMatrixResult = {
  readonly report: ShowTypeMatrixReport;
  readonly json_report_path: string;
  readonly markdown_report_path: string;
  readonly demo_matrix?: DemoMatrixResult;
  readonly exitCode: number;
};

export type ShowTypeMatrixOptions = DemoMatrixRunOptions;

export async function runShowTypeMatrix(options: ShowTypeMatrixOptions = {}): Promise<ShowTypeMatrixResult> {
  const args = parseDemoMatrixArgs(options.argv ?? []);
  const repoRoot = path.resolve(options.repoRoot ?? findRepoRoot());
  const now = options.now ?? (() => new Date());
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const validation = await validateShowTypeCatalog({ repoRoot });
  if (validation.errors.length > 0) {
    throw new Error(`show type catalog is invalid:\n${validation.errors.map((error) => `- ${error}`).join("\n")}`);
  }

  const requested = new Set(args.only);
  const matches = new Map<string, ShowTypeCatalogResolution[]>();
  for (const resolution of validation.resolutions) {
    for (const key of laneMatchKeys(resolution)) {
      const existing = matches.get(key) ?? [];
      existing.push(resolution);
      matches.set(key, existing);
    }
  }
  const missing = [...requested].filter((key) => !matches.has(key));
  if (missing.length > 0) {
    throw new Error(`unknown show type lane: ${missing.join(", ")}`);
  }

  const plans = validation.resolutions.map((resolution) => {
    const selected = requested.size === 0 || laneMatchKeys(resolution).some((key) => requested.has(key));
    const runnable = selected && resolution.starter !== undefined && sampleSupportAllowsMode(resolution.starter.sampleSupport, args.mode);
    return {
      resolution,
      selected,
      runnable,
      note: lanePlanNote(resolution, selected, runnable, args.mode),
    };
  });
  const runnableLaneIds = plans.filter((plan) => plan.runnable).map((plan) => plan.resolution.row.laneId);
  let matrixResult: DemoMatrixResult | undefined;
  let outputDir: string | undefined;

  if (runnableLaneIds.length > 0) {
    const matrixArgv = [
      args.mode === "paid-demo" ? "--paid-demo" : "--zero-key",
      "--from-show-types",
      "--keep-workdir",
      ...runnableLaneIds.flatMap((laneId) => ["--only", laneId]),
      ...(args.cliPath === undefined ? [] : ["--cli-path", args.cliPath]),
    ];
    matrixResult = await runDemoMatrix({
      ...options,
      argv: matrixArgv,
      write: () => undefined,
    });
    outputDir = matrixResult.working_dir;
  } else {
    outputDir = await mkdtemp(path.join(path.resolve(options.tempRoot ?? tmpdir()), "show-types-matrix-"));
  }

  const resultByLaneId = new Map(matrixResult?.results.map((result) => [result.slug, result]) ?? []);
  const laneReports: ShowTypeMatrixLaneReport[] = plans.map((plan) => {
    const result = resultByLaneId.get(plan.resolution.row.laneId);
    const status = classifyShowTypeLaneStatus({
      selected: plan.selected,
      runnable: plan.runnable,
      result,
    });
    return laneReport(plan.resolution, status, plan.note, result);
  });
  const report = buildShowTypeMatrixReport({
    mode: args.mode,
    workingDir: outputDir,
    resolutions: validation.resolutions,
    laneReports,
    matrixResult,
    now,
  });
  const reportPaths = await writeShowTypeMatrixReports({ report, outputDir });

  if (args.json) {
    write(`${JSON.stringify({ ...report, json_report_path: reportPaths.jsonPath, markdown_report_path: reportPaths.markdownPath })}\n`);
  } else {
    write(renderShowTypeMatrixMarkdown(report));
    write(`Reports:\n- ${reportPaths.jsonPath}\n- ${reportPaths.markdownPath}\n`);
  }

  const hardFailure = laneReports.some(isHardFailure);
  return {
    report,
    json_report_path: reportPaths.jsonPath,
    markdown_report_path: reportPaths.markdownPath,
    demo_matrix: matrixResult,
    exitCode: hardFailure ? 2 : 0,
  };
}

function laneReport(
  resolution: ShowTypeCatalogResolution,
  status: ShowTypeLaneStatus,
  note: string | undefined,
  result: DemoMatrixResult["results"][number] | undefined,
): ShowTypeMatrixLaneReport {
  return {
    lane_id: resolution.row.laneId,
    pipeline_slug: resolution.row.pipelineSlug,
    starter_slug: resolution.row.starterSlug,
    sample_support: resolution.row.sampleSupport,
    status,
    note,
    demo_matrix_status: result?.status,
    error: result?.error,
  };
}

function lanePlanNote(
  resolution: ShowTypeCatalogResolution,
  selected: boolean,
  runnable: boolean,
  mode: "zero-key" | "paid-demo",
): string | undefined {
  if (!selected) {
    return "not selected by --only";
  }
  if (runnable) {
    return undefined;
  }
  if (resolution.starter === undefined) {
    return "no bundled starter sample is available for this lane";
  }
  return `sample_support ${resolution.starter.sampleSupport} is not runnable in ${mode} mode`;
}

function laneMatchKeys(resolution: ShowTypeCatalogResolution): string[] {
  return [
    resolution.row.laneId,
    resolution.row.pipelineSlug,
    ...(resolution.row.starterSlug === undefined ? [] : [resolution.row.starterSlug]),
  ];
}

function isHardFailure(lane: ShowTypeMatrixLaneReport): boolean {
  return lane.status === "setup-missing" || lane.status === "build-failed" || lane.status === "export-failed";
}

function findRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runShowTypeMatrix({ argv });
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url && process.env.VITEST_WORKER_ID === undefined) {
  await main();
}
