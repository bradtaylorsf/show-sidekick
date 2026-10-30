import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import {
  type Checkpoint,
  checkpointDir,
  checkpointFile,
  getNextStage,
  listCheckpoints,
  type NextStage,
  readCheckpoint,
  readState,
  type PipelineState,
} from "../checkpoints/index.js";
import { readDecisionLog } from "../decisions/store.js";
import type { Pipeline } from "../pipelines/manifest.js";
import { projectDir } from "../checkpoints/paths.js";
import { projectPaths } from "../paths/project.js";

export type QueueStatus = "review" | "needs_attention" | "failed" | "approved" | "rejected" | "in_progress";

/** Statuses a human has to act on. `showkick queue` lists only these unless `--all` is passed. */
export const ACTIONABLE_STATUSES: readonly QueueStatus[] = ["review", "needs_attention", "failed"];

export type QueueCreativeStage = {
  stage: string;
  status: Checkpoint["status"] | "missing";
  auto_approved: boolean;
  summary: string[];
};

export type QueueFinding = {
  stage: string;
  severity: string;
  title: string;
};

export type QueueRow = {
  event: "review_queue_item";
  target: string;
  show: string;
  episode: string;
  title: string;
  pipeline: string;
  status: QueueStatus;
  stage: string | null;
  updated: string | null;
  video: {
    path: string;
    exists: boolean;
    build: string | null;
    duration_s: number | null;
  } | null;
  final_review: string | null;
  creative: QueueCreativeStage[];
  findings: {
    critical: number;
    suggestions: number;
    nitpicks: number;
    open: QueueFinding[];
  };
  cost_usd: number;
  review: PipelineState["review"] | null;
};

export type QueueEpisodeInput = {
  projectRoot: string;
  show: string;
  episode: string;
  title: string;
  pipelineName: string;
  pipeline: Pipeline;
};

export async function loadQueueRow(input: QueueEpisodeInput): Promise<QueueRow | null> {
  const { projectRoot, show, episode, pipeline } = input;
  const state = await readState(projectRoot, show, episode);
  const checkpoints = new Set(await listCheckpoints(projectRoot, show, episode));
  if (state === undefined && checkpoints.size === 0) {
    return null;
  }

  const next = await getNextStage(projectRoot, show, episode, pipeline);
  const finalStage = pipeline.stages.at(-1);
  const finalCheckpoint =
    finalStage !== undefined && checkpoints.has(finalStage.slug)
      ? await readCheckpoint(projectRoot, show, episode, finalStage.slug)
      : undefined;
  const autoApproved = await autoApprovedStages(projectRoot, show, episode);

  const creative: QueueCreativeStage[] = [];
  const open: QueueFinding[] = [];
  const counts = { critical: 0, suggestions: 0, nitpicks: 0 };
  let updated: string | null = null;

  for (const stage of pipeline.stages) {
    if (!checkpoints.has(stage.slug)) {
      if (stage.human_approval === "required") {
        creative.push({ stage: stage.slug, status: "missing", auto_approved: false, summary: [] });
      }
      continue;
    }

    const checkpoint = await readCheckpoint(projectRoot, show, episode, stage.slug);
    if (updated === null || checkpoint.timestamp.localeCompare(updated) > 0) {
      updated = checkpoint.timestamp;
    }
    counts.critical += checkpoint.review_summary?.critical ?? 0;
    counts.suggestions += checkpoint.review_summary?.suggestions ?? 0;
    counts.nitpicks += checkpoint.review_summary?.nitpicks ?? 0;
    open.push(...openFindings(stage.slug, checkpoint));

    if (stage.human_approval === "required") {
      creative.push({
        stage: stage.slug,
        status: checkpoint.status,
        auto_approved: autoApproved.has(stage.slug),
        summary: summarizeForReview(checkpoint.artifact),
      });
    }
  }

  const finalArtifact = finalCheckpoint?.artifact;
  const video = await videoFor(projectRoot, show, episode, finalArtifact);

  return {
    event: "review_queue_item",
    target: `${show}/${episode}`,
    show,
    episode,
    title: input.title,
    pipeline: input.pipelineName,
    status: queueStatus(next, finalStage?.slug, state),
    stage: stageOf(next),
    updated,
    video,
    final_review: finalReviewStatus(finalArtifact),
    creative,
    findings: { ...counts, open: sortFindings(open) },
    cost_usd: state?.cost_total_usd ?? finalCheckpoint?.cost_snapshot?.total_so_far_usd ?? 0,
    review: state?.review ?? null,
  };
}

function queueStatus(next: NextStage, finalStage: string | undefined, state: PipelineState | undefined): QueueStatus {
  if (state?.review?.decision === "rejected") {
    return "rejected";
  }

  switch (next.kind) {
    case "awaiting_human":
      return next.stage.slug === finalStage ? "review" : "needs_attention";
    case "failed":
      return "failed";
    case "done":
      return "approved";
    default:
      return "in_progress";
  }
}

function stageOf(next: NextStage): string | null {
  return next.kind === "done" ? null : next.stage.slug;
}

/** First 8 hex of the file's md5: the id a review decision is pinned to, so a decision never lands on a newer cut. */
export async function buildId(filePath: string): Promise<string> {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex").slice(0, 8);
}

/** The build id of the episode's current cut, from the final stage's render report. Null when no cut exists. */
export async function currentBuildId(
  projectRoot: string,
  show: string,
  episode: string,
  pipeline: Pipeline,
): Promise<string | null> {
  const finalStage = pipeline.stages.at(-1);
  if (finalStage === undefined || !(await listCheckpoints(projectRoot, show, episode)).includes(finalStage.slug)) {
    return null;
  }

  const checkpoint = await readCheckpoint(projectRoot, show, episode, finalStage.slug);
  return (await videoFor(projectRoot, show, episode, checkpoint.artifact))?.build ?? null;
}

/** Refuses a decision made on a cut other than the one on disk now. */
export async function assertBuild(
  projectRoot: string,
  show: string,
  episode: string,
  pipeline: Pipeline,
  expected: string | undefined,
): Promise<string | null> {
  const current = await currentBuildId(projectRoot, show, episode, pipeline);
  if (expected === undefined) {
    return current;
  }

  if (current === null) {
    throw new Error(`--build ${expected}: ${show}/${episode} has no rendered cut to match`);
  }
  if (current !== expected.trim().toLowerCase()) {
    throw new Error(`--build ${expected} is stale: the current cut of ${show}/${episode} is build ${current}`);
  }

  return current;
}

async function videoFor(projectRoot: string, show: string, episode: string, artifact: unknown): Promise<QueueRow["video"]> {
  const report = isRecord(artifact) && isRecord(artifact.render_report) ? artifact.render_report : artifact;
  if (!isRecord(report) || typeof report.output_path !== "string" || report.output_path.length === 0) {
    return null;
  }

  const outputPath = report.output_path;
  const candidates = path.isAbsolute(outputPath)
    ? [outputPath]
    : [path.resolve(projectRoot, outputPath), path.resolve(projectDir(projectRoot, show, episode), outputPath)];
  const duration = typeof report.duration_s === "number" ? report.duration_s : null;

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return { path: candidate, exists: true, build: await buildId(candidate), duration_s: duration };
    }
  }

  return { path: candidates[0] ?? outputPath, exists: false, build: null, duration_s: duration };
}

function finalReviewStatus(artifact: unknown): string | null {
  const review = isRecord(artifact) && isRecord(artifact.final_review) ? artifact.final_review : undefined;
  return review !== undefined && typeof review.status === "string" ? review.status : null;
}

async function autoApprovedStages(projectRoot: string, show: string, episode: string): Promise<Set<string>> {
  const log = await readDecisionLog(`${show}/${episode}`, { root: projectRoot });
  return new Set(
    log
      .filter((entry) => entry.category === "downgrade_approval" && entry.picked === "auto_approve_until_final_review")
      .map((entry) => entry.stage),
  );
}

function openFindings(stage: string, checkpoint: Checkpoint): QueueFinding[] {
  return (checkpoint.review_summary?.findings ?? []).flatMap((finding) => {
    if (!isRecord(finding)) {
      return [];
    }
    const title = [finding.title, finding.description, finding.message].find(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    return title === undefined
      ? []
      : [{ stage, severity: typeof finding.severity === "string" ? finding.severity : "unknown", title }];
  });
}

const SEVERITY_ORDER = ["critical", "suggestion", "nitpick"];

function sortFindings(findings: QueueFinding[]): QueueFinding[] {
  const rank = (severity: string) => {
    const index = SEVERITY_ORDER.indexOf(severity);
    return index === -1 ? SEVERITY_ORDER.length : index;
  };
  return [...findings].sort((left, right) => rank(left.severity) - rank(right.severity));
}

/** A few human-readable lines from a creative artifact (idea, script, scene plan) for the review card. */
export function summarizeForReview(artifact: unknown): string[] {
  if (!isRecord(artifact)) {
    return [];
  }

  const lines = ["title", "logline", "summary", "concept", "hook", "description", "treatment"]
    .map((key) => artifact[key])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => clip(value.trim(), 400));

  for (const key of ["scenes", "shots", "sections", "beats"]) {
    const value = artifact[key];
    if (Array.isArray(value) && value.length > 0) {
      lines.push(`${value.length} ${key}`);
    }
  }

  return lines.slice(0, 6);
}

/**
 * Sends an episode back to `stage`: that stage's checkpoint and every later one move to
 * `checkpoints/superseded/<timestamp>/`, so the next build reruns from `stage` with fresh downstream artifacts.
 * Nothing is deleted. Returns the stages moved.
 */
export async function supersedeFrom(
  projectRoot: string,
  show: string,
  episode: string,
  pipeline: Pipeline,
  stage: string,
  timestamp: string,
): Promise<string[]> {
  const index = pipeline.stages.findIndex((candidate) => candidate.slug === stage);
  if (index === -1) {
    throw new Error(`unknown stage '${stage}' for pipeline (stages: ${pipeline.stages.map((s) => s.slug).join(", ")})`);
  }

  const present = new Set(await listCheckpoints(projectRoot, show, episode));
  const moving = pipeline.stages.slice(index).map((candidate) => candidate.slug).filter((slug) => present.has(slug));
  if (moving.length === 0) {
    return [];
  }

  const dest = path.join(checkpointDir(projectRoot, show, episode), "superseded", timestamp.replace(/[^0-9A-Za-z]/gu, ""));
  await mkdir(dest, { recursive: true });
  for (const slug of moving) {
    await rename(checkpointFile(projectRoot, show, episode, slug), path.join(dest, `${slug}.json`));
  }

  return moving;
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function listEpisodeSlugs(projectRoot: string, show: string): Promise<string[]> {
  try {
    const entries = await readdir(path.join(projectPaths(projectRoot).shows, show, "episodes"), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => path.basename(entry.name, ".yaml"))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
