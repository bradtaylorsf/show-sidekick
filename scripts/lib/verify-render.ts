import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { AssetManifestSchema, CostLogSchema, DecisionLogSchema, EditDecisionsSchema, RenderReportSchema } from "../../src/artifacts/index.js";
import { ffprobe, type FfprobeResult } from "../../src/audio/ffprobe.js";
import { BRANDING } from "../../src/branding.js";
import { projectDir } from "../../src/checkpoints/paths.js";
import { costLogFile } from "../../src/cost/paths.js";
import { decisionsPath } from "../../src/decisions/store.js";
import { exportArtifactPaths } from "../../src/export/load-artifacts.js";
import { PipelineManifestSchema, type PipelineManifest } from "../../src/pipelines/index.js";
import { commandLine, type SpawnCommand } from "./spawn-cli.ts";

const FRAME_SAMPLE_COUNT = 4;
const DURATION_TOLERANCE_S = 0.5;
const FRAMERATE_TOLERANCE = 0.1;

const ExportTargetSchema = z.enum(["premiere", "edl"]);
type VerifiedExportTarget = z.infer<typeof ExportTargetSchema>;

export type ArtifactPresence = {
  readonly artifact: string;
  readonly expected: boolean;
  readonly path: string;
  readonly exists: boolean;
  readonly valid: boolean;
  readonly status: "present" | "missing" | "invalid" | "skipped";
  readonly error?: string;
};

export type FfprobeVerification = {
  readonly status: "passed" | "failed" | "skipped";
  readonly render_path: string;
  readonly expected_duration_s?: number;
  readonly actual_duration_s?: number;
  readonly duration_tolerance_s: number;
  readonly expected_resolution?: { readonly width: number; readonly height: number };
  readonly actual_resolution?: { readonly width?: number; readonly height?: number };
  readonly expected_aspect?: string;
  readonly expected_framerate?: number;
  readonly actual_framerate?: number;
  readonly audio_expected: boolean;
  readonly audio_present: boolean;
  readonly probe?: FfprobeResult;
  readonly errors: readonly string[];
};

export type ExportVerification = {
  readonly target: VerifiedExportTarget;
  readonly status: "completed" | "failed" | "skipped_unsupported";
  readonly command?: string;
  readonly exit_code?: number;
  readonly package_path?: string;
  readonly timeline_path?: string;
  readonly error?: string;
};

export type FrameSample = {
  readonly index: number;
  readonly time_s: number;
  readonly path: string;
};

export type FrameSampleSummary = {
  readonly status: "completed" | "failed" | "skipped";
  readonly render_path: string;
  readonly contact_sheet_path?: string;
  readonly frame_summary_path?: string;
  readonly frames: readonly FrameSample[];
  readonly error?: string;
};

export type LaneVerification = {
  readonly status: "passed" | "failed" | "skipped";
  readonly slug: string;
  readonly pipeline: string;
  readonly target: string;
  readonly project_dir: string;
  readonly generated_at: string;
  readonly artifact_presence: readonly ArtifactPresence[];
  readonly ffprobe_probe?: FfprobeVerification;
  readonly export_results: readonly ExportVerification[];
  readonly frame_summary?: FrameSampleSummary;
  readonly errors: readonly string[];
};

export type DemoMatrixVerificationReport = {
  readonly event: "demo_matrix_verification";
  readonly status: "passed" | "failed";
  readonly mode: string;
  readonly generated_at: string;
  readonly working_dir: string;
  readonly summary: {
    readonly total_lanes: number;
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly lanes: readonly LaneVerification[];
};

export type VerifyLaneInput = {
  readonly slug: string;
  readonly showSlug: string;
  readonly pipeline: string;
  readonly target: string;
  readonly projectDir: string;
  readonly cli: {
    readonly command: string;
    readonly baseArgs: readonly string[];
  };
  readonly runCommand: SpawnCommand;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly probeMedia?: (filePath: string) => Promise<FfprobeResult>;
  readonly runFfmpeg?: (args: readonly string[], options: { readonly cwd: string }) => Promise<void>;
};

type VerificationContext = {
  readonly show: string;
  readonly episode: string;
  readonly episodeDir: string;
  readonly pipeline: PipelineManifest;
  readonly showConfig: Record<string, unknown>;
  readonly episodeConfig: Record<string, unknown>;
};

type LoadedArtifacts = {
  readonly renderReport: z.infer<typeof RenderReportSchema>;
  readonly assetManifest: z.infer<typeof AssetManifestSchema>;
  readonly editDecisions: z.infer<typeof EditDecisionsSchema>;
};

export async function verifyLane(input: VerifyLaneInput): Promise<LaneVerification> {
  const generatedAt = (input.now ?? (() => new Date()))().toISOString();
  const errors: string[] = [];
  const exportResults: ExportVerification[] = [];
  let ffprobeProbe: FfprobeVerification | undefined;
  let frameSummary: FrameSampleSummary | undefined;
  let artifactPresence: ArtifactPresence[] = [];

  try {
    const ctx = await loadVerificationContext(input);
    artifactPresence = await verifyArtifactPresence(input.projectDir, ctx);
    const artifactErrors = artifactPresence
      .filter((artifact) => artifact.expected && artifact.status !== "present")
      .map((artifact) => `${artifact.artifact}: ${artifact.error ?? artifact.status}`);
    errors.push(...artifactErrors);

    const artifacts = artifactErrors.length === 0 ? await loadArtifacts(input.projectDir, ctx) : undefined;
    if (artifacts !== undefined) {
      ffprobeProbe = await verifyFfprobe(input, ctx, artifacts);
      errors.push(...ffprobeProbe.errors);

      exportResults.push(
        ...(await verifyExports({
          input,
          pipeline: ctx.pipeline,
        })),
      );
      errors.push(
        ...exportResults
          .filter((result) => result.status === "failed")
          .map((result) => `${result.target} export: ${result.error ?? "failed"}`),
      );

      frameSummary =
        ffprobeProbe.status === "passed"
          ? await sampleFrames(input, ctx, artifacts, ffprobeProbe.actual_duration_s ?? artifacts.renderReport.duration_s)
          : {
              status: "skipped",
              render_path: projectRelative(input.projectDir, resolveProjectPath(input.projectDir, artifacts.renderReport.output_path)),
              frames: [],
              error: "ffprobe validation failed",
            };
      if (frameSummary.status === "failed" && frameSummary.error !== undefined) {
        errors.push(`frame samples: ${frameSummary.error}`);
      }
    }
  } catch (error) {
    errors.push(errorMessage(error));
  }

  return {
    status: errors.length === 0 ? "passed" : "failed",
    slug: input.slug,
    pipeline: input.pipeline,
    target: input.target,
    project_dir: input.projectDir,
    generated_at: generatedAt,
    artifact_presence: artifactPresence,
    ffprobe_probe: ffprobeProbe,
    export_results: exportResults,
    frame_summary: frameSummary,
    errors,
  };
}

export async function writeDemoMatrixVerificationReport(input: {
  readonly mode: string;
  readonly workingDir: string;
  readonly lanes: readonly LaneVerification[];
  readonly now?: () => Date;
}): Promise<{ readonly path: string; readonly report: DemoMatrixVerificationReport }> {
  const report = buildDemoMatrixVerificationReport(input);
  const reportPath = path.join(input.workingDir, "demo-matrix-verification.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { path: reportPath, report };
}

export function buildDemoMatrixVerificationReport(input: {
  readonly mode: string;
  readonly workingDir: string;
  readonly lanes: readonly LaneVerification[];
  readonly now?: () => Date;
}): DemoMatrixVerificationReport {
  const passed = input.lanes.filter((lane) => lane.status === "passed").length;
  const failed = input.lanes.filter((lane) => lane.status === "failed").length;
  const skipped = input.lanes.filter((lane) => lane.status === "skipped").length;

  return {
    event: "demo_matrix_verification",
    status: failed === 0 ? "passed" : "failed",
    mode: input.mode,
    generated_at: (input.now ?? (() => new Date()))().toISOString(),
    working_dir: input.workingDir,
    summary: {
      total_lanes: input.lanes.length,
      passed,
      failed,
      skipped,
    },
    lanes: input.lanes,
  };
}

export function skippedVerification(input: {
  readonly slug: string;
  readonly pipeline: string;
  readonly target: string;
  readonly projectDir: string;
  readonly reason: string;
  readonly now?: () => Date;
}): LaneVerification {
  return {
    status: "skipped",
    slug: input.slug,
    pipeline: input.pipeline,
    target: input.target,
    project_dir: input.projectDir,
    generated_at: (input.now ?? (() => new Date()))().toISOString(),
    artifact_presence: [],
    export_results: [],
    errors: [input.reason],
  };
}

async function loadVerificationContext(input: VerifyLaneInput): Promise<VerificationContext> {
  const [show, episode] = parseTarget(input.target);
  const showConfig = await readYamlRecord(path.join(input.projectDir, "shows", show, "show.yaml"));
  const episodeConfig = await readYamlRecord(path.join(input.projectDir, "shows", show, "episodes", `${episode}.yaml`));
  const pipeline = PipelineManifestSchema.parse(
    await readYamlRecord(path.join(input.projectDir, BRANDING.cacheDir, "pipelines", `${input.pipeline}.yaml`)),
  );

  return {
    show,
    episode,
    episodeDir: projectDir(input.projectDir, show, episode),
    pipeline,
    showConfig,
    episodeConfig,
  };
}

async function verifyArtifactPresence(projectRoot: string, ctx: VerificationContext): Promise<ArtifactPresence[]> {
  const expected = expectedArtifacts(ctx.pipeline);
  const exportPaths = exportArtifactPaths(projectRoot, ctx.show, ctx.episode);
  const checks: Array<{ artifact: string; expected: boolean; path: string; schema?: z.ZodTypeAny; requireEntries?: boolean }> = [
    { artifact: "render_report", expected: expected.has("render_report"), path: exportPaths.render_report, schema: RenderReportSchema },
    { artifact: "asset_manifest", expected: expected.has("asset_manifest"), path: exportPaths.asset_manifest, schema: AssetManifestSchema },
    { artifact: "edit_decisions", expected: expected.has("edit_decisions"), path: exportPaths.edit_decisions, schema: EditDecisionsSchema },
    { artifact: "cuesheet", expected: expected.has("cuesheet"), path: exportPaths.cuesheet },
    { artifact: "cost_log", expected: true, path: costLogFile(projectRoot, ctx.show, ctx.episode), schema: CostLogSchema },
    {
      artifact: "decision_log",
      expected: true,
      path: decisionsPath({ show: ctx.show, episode: ctx.episode }, { root: projectRoot }),
      schema: DecisionLogSchema,
      requireEntries: true,
    },
  ];

  return Promise.all(
    checks.map(async (check) => {
      if (!check.expected) {
        return {
          artifact: check.artifact,
          expected: false,
          path: projectRelative(projectRoot, check.path),
          exists: await exists(check.path),
          valid: true,
          status: "skipped" as const,
        };
      }

      return verifyOneArtifact(projectRoot, check);
    }),
  );
}

async function verifyOneArtifact(
  projectRoot: string,
  check: { readonly artifact: string; readonly path: string; readonly schema?: z.ZodTypeAny; readonly requireEntries?: boolean },
): Promise<ArtifactPresence> {
  if (!(await exists(check.path))) {
    return {
      artifact: check.artifact,
      expected: true,
      path: projectRelative(projectRoot, check.path),
      exists: false,
      valid: false,
      status: "missing",
      error: "file does not exist",
    };
  }

  if (check.schema === undefined) {
    return {
      artifact: check.artifact,
      expected: true,
      path: projectRelative(projectRoot, check.path),
      exists: true,
      valid: true,
      status: "present",
    };
  }

  try {
    const parsed = check.schema.parse(JSON.parse(await readFile(check.path, "utf8"))) as unknown;
    if (check.requireEntries === true && Array.isArray(parsed) && parsed.length === 0) {
      return {
        artifact: check.artifact,
        expected: true,
        path: projectRelative(projectRoot, check.path),
        exists: true,
        valid: false,
        status: "invalid",
        error: "decision log has no entries",
      };
    }

    return {
      artifact: check.artifact,
      expected: true,
      path: projectRelative(projectRoot, check.path),
      exists: true,
      valid: true,
      status: "present",
    };
  } catch (error) {
    return {
      artifact: check.artifact,
      expected: true,
      path: projectRelative(projectRoot, check.path),
      exists: true,
      valid: false,
      status: "invalid",
      error: errorMessage(error),
    };
  }
}

async function loadArtifacts(projectRoot: string, ctx: VerificationContext): Promise<LoadedArtifacts> {
  const paths = exportArtifactPaths(projectRoot, ctx.show, ctx.episode);
  const [renderReport, assetManifest, editDecisions] = await Promise.all([
    readJson(paths.render_report, RenderReportSchema),
    readJson(paths.asset_manifest, AssetManifestSchema),
    readJson(paths.edit_decisions, EditDecisionsSchema),
  ]);

  return { renderReport, assetManifest, editDecisions };
}

async function verifyFfprobe(
  input: VerifyLaneInput,
  ctx: VerificationContext,
  artifacts: LoadedArtifacts,
): Promise<FfprobeVerification> {
  const renderPath = resolveProjectPath(input.projectDir, artifacts.renderReport.output_path);
  const probe = await (input.probeMedia ?? ffprobe)(renderPath);
  const videoStream = probe.streams.find((stream) => stream.codec_type === "video");
  const audioPresent = probe.streams.some((stream) => stream.codec_type === "audio");
  const actualResolution = { width: videoStream?.width, height: videoStream?.height };
  const expectedDuration = expectedSampleDurationS(ctx);
  const expectedAspect = expectedAspectRatio(input.pipeline, ctx);
  const audioExpected = expectsAudio(ctx.pipeline, artifacts);
  const errors: string[] = [];

  if (expectedDuration !== undefined && Math.abs(probe.format.duration_s - expectedDuration) > DURATION_TOLERANCE_S) {
    errors.push(`duration ${probe.format.duration_s.toFixed(3)}s is outside +/-${DURATION_TOLERANCE_S}s of expected ${expectedDuration}s`);
  }

  if (
    videoStream?.width !== artifacts.renderReport.resolution.width ||
    videoStream?.height !== artifacts.renderReport.resolution.height
  ) {
    errors.push(
      `resolution ${videoStream?.width ?? "unknown"}x${videoStream?.height ?? "unknown"} does not match render_report ${artifacts.renderReport.resolution.width}x${artifacts.renderReport.resolution.height}`,
    );
  }

  if (
    expectedAspect !== undefined &&
    videoStream?.width !== undefined &&
    videoStream.height !== undefined &&
    !resolutionMatchesAspect(videoStream.width, videoStream.height, expectedAspect)
  ) {
    errors.push(`resolution ${videoStream.width}x${videoStream.height} does not match expected aspect ${expectedAspect}`);
  }

  if (videoStream?.frame_rate === undefined) {
    errors.push("video stream did not report a frame rate");
  } else if (Math.abs(videoStream.frame_rate - artifacts.renderReport.framerate) > FRAMERATE_TOLERANCE) {
    errors.push(`framerate ${videoStream.frame_rate.toFixed(3)} does not match render_report ${artifacts.renderReport.framerate}`);
  }

  if (audioExpected && !audioPresent) {
    errors.push("audio stream is expected but not present");
  }

  return {
    status: errors.length === 0 ? "passed" : "failed",
    render_path: projectRelative(input.projectDir, renderPath),
    expected_duration_s: expectedDuration,
    actual_duration_s: probe.format.duration_s,
    duration_tolerance_s: DURATION_TOLERANCE_S,
    expected_resolution: artifacts.renderReport.resolution,
    actual_resolution: actualResolution,
    expected_aspect: expectedAspect,
    expected_framerate: artifacts.renderReport.framerate,
    actual_framerate: videoStream?.frame_rate,
    audio_expected: audioExpected,
    audio_present: audioPresent,
    probe,
    errors,
  };
}

async function verifyExports(input: {
  readonly input: VerifyLaneInput;
  readonly pipeline: PipelineManifest;
}): Promise<ExportVerification[]> {
  return Promise.all(
    ExportTargetSchema.options.map(async (target) => {
      if (!pipelineSupportsExportTarget(input.pipeline, target)) {
        return {
          target,
          status: "skipped_unsupported" as const,
          error: `pipeline '${input.pipeline.slug}' does not declare support for '${target}'`,
        };
      }

      const exportArgs =
        target === "edl"
          ? [...input.input.cli.baseArgs, "--json", "export", input.input.target, "--format", "edl", "--out", "exports", "--overwrite"]
          : [...input.input.cli.baseArgs, "--json", "export", input.input.target, "--target", target, "--out", "exports", "--overwrite"];
      const result = await input.input.runCommand(input.input.cli.command, exportArgs, {
        cwd: input.input.projectDir,
        env: input.input.env,
      });
      const exported = result.exitCode === 0 && result.lastEvent?.event === "exported";

      return {
        target,
        status: exported ? "completed" : "failed",
        command: commandLine(result.command, result.args),
        exit_code: result.exitCode,
        package_path: stringField(result.lastEvent, "package_path"),
        timeline_path: stringField(result.lastEvent, "timeline_path"),
        error: exported ? undefined : result.stderr.trim() || `export command exited ${result.exitCode}`,
      };
    }),
  );
}

async function sampleFrames(
  input: VerifyLaneInput,
  ctx: VerificationContext,
  artifacts: LoadedArtifacts,
  durationS: number,
): Promise<FrameSampleSummary> {
  const renderPath = resolveProjectPath(input.projectDir, artifacts.renderReport.output_path);
  const verificationDir = path.join(ctx.episodeDir, "verification");
  const framesDir = path.join(verificationDir, "frames");
  const contactSheetPath = path.join(verificationDir, "contact-sheet.png");
  const frameSummaryPath = path.join(verificationDir, "frame_summary.json");
  const times = uniformSampleTimes(durationS, FRAME_SAMPLE_COUNT);
  const frames: FrameSample[] = [];

  await mkdir(framesDir, { recursive: true });

  try {
    for (const [index, time] of times.entries()) {
      const outputPath = path.join(framesDir, `frame_${String(index).padStart(4, "0")}.png`);
      await runFfmpeg(input, ["-hide_banner", "-loglevel", "error", "-y", "-ss", time.toFixed(3), "-i", renderPath, "-frames:v", "1", outputPath]);
      frames.push({
        index,
        time_s: roundSeconds(time),
        path: projectRelative(input.projectDir, outputPath),
      });
    }

    await runFfmpeg(input, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      "1",
      "-i",
      path.join(framesDir, "frame_%04d.png"),
      "-vf",
      "tile=2x2",
      "-frames:v",
      "1",
      contactSheetPath,
    ]);

    const summary = {
      render_path: projectRelative(input.projectDir, renderPath),
      sample_count: frames.length,
      sample_times_s: frames.map((frame) => frame.time_s),
      frames,
      contact_sheet_path: projectRelative(input.projectDir, contactSheetPath),
    };
    await writeFile(frameSummaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

    return {
      status: "completed",
      render_path: summary.render_path,
      contact_sheet_path: summary.contact_sheet_path,
      frame_summary_path: projectRelative(input.projectDir, frameSummaryPath),
      frames,
    };
  } catch (error) {
    return {
      status: "failed",
      render_path: projectRelative(input.projectDir, renderPath),
      frames,
      error: errorMessage(error),
    };
  }
}

function expectedArtifacts(pipeline: PipelineManifest): ReadonlySet<string> {
  const produced = new Set<string>();
  for (const stage of pipeline.stages) {
    if (stage.produces.trim().length > 0) {
      produced.add(stage.produces);
    }
    for (const artifact of stage.produces_artifacts) {
      produced.add(artifact);
    }
  }

  return produced;
}

function expectedSampleDurationS(ctx: VerificationContext): number | undefined {
  return numberAtPath(ctx.episodeConfig, ["starter", "expected_sample_duration_s"])
    ?? numberAtPath(ctx.episodeConfig, ["expected_sample_duration_s"])
    ?? numberAtPath(ctx.showConfig, ["starter", "expected_sample_duration_s"])
    ?? ctx.pipeline.sample?.duration_s_min;
}

function expectedAspectRatio(pipelineName: string, ctx: VerificationContext): string | undefined {
  const episodeAspect = stringAtPath(ctx.episodeConfig, ["aspect"]);
  if (episodeAspect !== undefined) {
    return episodeAspect;
  }

  return stringAtPath(ctx.showConfig, ["pipelines", pipelineName, "aspect"]);
}

function expectsAudio(pipeline: PipelineManifest, artifacts: LoadedArtifacts): boolean {
  return (
    pipeline.master_clock === "audio" ||
    pipeline.master_clock === "voiceover" ||
    artifacts.editDecisions.audio?.music?.track_path !== undefined
  );
}

function pipelineSupportsExportTarget(pipeline: PipelineManifest, target: VerifiedExportTarget): boolean {
  return pipeline.export?.supported_targets?.includes(target) === true;
}

function resolutionMatchesAspect(width: number, height: number, aspect: string): boolean {
  const [rawWidth, rawHeight] = aspect.split(":");
  const aspectWidth = Number(rawWidth);
  const aspectHeight = Number(rawHeight);
  if (!Number.isFinite(aspectWidth) || !Number.isFinite(aspectHeight) || aspectWidth <= 0 || aspectHeight <= 0) {
    return true;
  }

  const expected = aspectWidth / aspectHeight;
  const actual = width / height;
  return Math.abs(actual - expected) <= 0.01;
}

function uniformSampleTimes(durationS: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (durationS <= 0) {
    return Array.from({ length: count }, () => 0);
  }

  return Array.from({ length: count }, (_value, index) => {
    const midpoint = ((index + 0.5) / count) * durationS;
    return Math.min(durationS, Math.max(0, midpoint));
  });
}

async function runFfmpeg(input: VerifyLaneInput, args: readonly string[]): Promise<void> {
  if (input.runFfmpeg !== undefined) {
    await input.runFfmpeg(args, { cwd: input.projectDir });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    execFile("ffmpeg", [...args], { cwd: input.projectDir, maxBuffer: 10 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve();
    });
  });
}

async function readJson<T extends z.ZodTypeAny>(filePath: string, schema: T): Promise<z.infer<T>> {
  return schema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

async function readYamlRecord(filePath: string): Promise<Record<string, unknown>> {
  const parsed = YAML.parse(await readFile(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`expected YAML object at ${filePath}`);
  }

  return parsed;
}

function parseTarget(target: string): [show: string, episode: string] {
  const [show, episode, ...extra] = target.split("/");
  if (show === undefined || episode === undefined || extra.length > 0 || show.length === 0 || episode.length === 0) {
    throw new Error(`expected target '<show>/<episode>', received '${target}'`);
  }

  return [show, episode];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveProjectPath(projectRoot: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
}

function projectRelative(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringAtPath(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  const value = valueAtPath(record, keys);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberAtPath(record: Record<string, unknown>, keys: readonly string[]): number | undefined {
  const value = valueAtPath(record, keys);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function valueAtPath(record: Record<string, unknown>, keys: readonly string[]): unknown {
  let current: unknown = record;
  for (const key of keys) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
