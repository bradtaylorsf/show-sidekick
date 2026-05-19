import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DemoMatrixMode, DemoMatrixResult, ShowTypeLaneStatus } from "../demo-matrix.ts";
import type { ShowTypeCatalogResolution } from "./show-types-catalog.ts";

export type ShowTypeMatrixLaneReport = {
  readonly lane_id: string;
  readonly pipeline_slug: string;
  readonly starter_slug?: string;
  readonly sample_support: string;
  readonly status: ShowTypeLaneStatus;
  readonly note?: string;
  readonly demo_matrix_status?: string;
  readonly error?: string;
};

export type ShowTypeMatrixReport = {
  readonly event: "show_type_matrix_report";
  readonly status: "passed" | "failed";
  readonly mode: DemoMatrixMode;
  readonly generated_at: string;
  readonly working_dir: string;
  readonly demo_matrix_verification_report_path?: string;
  readonly summary: Record<ShowTypeLaneStatus, number>;
  readonly lanes: readonly ShowTypeMatrixLaneReport[];
};

export function buildShowTypeMatrixReport(input: {
  readonly mode: DemoMatrixMode;
  readonly workingDir: string;
  readonly resolutions: readonly ShowTypeCatalogResolution[];
  readonly laneReports: readonly ShowTypeMatrixLaneReport[];
  readonly matrixResult?: DemoMatrixResult;
  readonly now?: () => Date;
}): ShowTypeMatrixReport {
  const summary = emptySummary();
  for (const lane of input.laneReports) {
    summary[lane.status] += 1;
  }

  const failed = input.laneReports.some(
    (lane) => lane.status === "setup-missing" || lane.status === "build-failed" || lane.status === "export-failed",
  );

  return {
    event: "show_type_matrix_report",
    status: failed ? "failed" : "passed",
    mode: input.mode,
    generated_at: (input.now ?? (() => new Date()))().toISOString(),
    working_dir: input.workingDir,
    demo_matrix_verification_report_path: input.matrixResult?.verification_report_path,
    summary,
    lanes: input.laneReports,
  };
}

export async function writeShowTypeMatrixReports(input: {
  readonly report: ShowTypeMatrixReport;
  readonly outputDir: string;
}): Promise<{ readonly jsonPath: string; readonly markdownPath: string }> {
  await mkdir(input.outputDir, { recursive: true });
  const jsonPath = path.join(input.outputDir, "show-types-matrix-report.json");
  const markdownPath = path.join(input.outputDir, "show-types-matrix-report.md");
  await writeFile(jsonPath, `${JSON.stringify(input.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderShowTypeMatrixMarkdown(input.report), "utf8");
  return { jsonPath, markdownPath };
}

export function renderShowTypeMatrixMarkdown(report: ShowTypeMatrixReport): string {
  return [
    `# Show Type Matrix - ${report.mode}`,
    "",
    `Generated: ${report.generated_at}`,
    "",
    "| Status | Count |",
    "|---|---:|",
    ...Object.entries(report.summary).map(([status, count]) => `| ${status} | ${count} |`),
    "",
    "| lane_id | pipeline | starter | sample_support | status | note |",
    "|---|---|---|---|---|---|",
    ...report.lanes.map((lane) =>
      [
        lane.lane_id,
        lane.pipeline_slug,
        lane.starter_slug ?? "none",
        lane.sample_support,
        lane.status,
        lane.note ?? lane.error ?? "",
      ]
        .map(escapeMarkdownCell)
        .join(" | "),
    ).map((row) => `| ${row} |`),
    "",
  ].join("\n");
}

function emptySummary(): Record<ShowTypeLaneStatus, number> {
  return {
    "not-run": 0,
    unsupported: 0,
    "setup-missing": 0,
    "build-failed": 0,
    "export-failed": 0,
    verified: 0,
  };
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
