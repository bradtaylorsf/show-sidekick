import { readFile } from "node:fs/promises";
import path from "node:path";
import { CostLogSchema, type CostLog } from "../artifacts/cost-log.js";
import type { Tool, ToolContext } from "../registry/tool.js";
import { AbortedByUser } from "./errors.js";
import { askForApproval, emitNdjson, isNonInteractive, type AnnounceIO, type InteractionMode, writeHuman } from "./io.js";

type UnknownRecord = Record<string, unknown>;

export type SampleOrBatch = "sample" | "batch";

export type AnnounceBlock = {
  tool: string;
  provider: string;
  model: string;
  reason: string;
  sample_or_batch: SampleOrBatch;
  estimate_usd: number | "unknown";
  cost_unit: string;
  units: number | "unknown";
  budget_remaining_usd?: number | "unknown";
};

export type AnnounceBeforeExecuteInput<I, O> = {
  tool: Tool<I, O>;
  params: I;
  ctx?: ToolContext;
  reason: string;
  sampleOrBatch?: SampleOrBatch;
  model?: string;
  units?: number;
  budgetUsd?: number;
  budgetRemainingUsd?: number | "unknown";
  costLog?: CostLog;
  projectRoot?: string;
  showEpisode?: string | { show: string; episode: string };
  mode?: InteractionMode;
  io?: AnnounceIO;
};

export async function announceBeforeExecute<I, O>(
  input: AnnounceBeforeExecuteInput<I, O>,
  execute?: () => Promise<O>,
): Promise<O> {
  const runner = execute ?? defaultRunner(input);

  if (input.tool.cost === undefined || input.tool.cost.usd === 0) {
    return await runner();
  }

  const block = await buildAnnounceBlock(input);

  if (isNonInteractive(input.mode)) {
    emitNdjson(input.io, "announce", block);
    return await runner();
  }

  writeHuman(input.io, formatAnnounceBlock(block));
  if (!(await askForApproval(input.io, "Proceed? [y/N] "))) {
    throw new AbortedByUser(`User aborted ${input.tool.name} execution before cost was incurred`);
  }

  return await runner();
}

async function buildAnnounceBlock<I, O>(input: AnnounceBeforeExecuteInput<I, O>): Promise<AnnounceBlock> {
  const units = input.units ?? inferUnits(input.params, input.tool.cost?.unit);
  const estimateUsd = units === "unknown" || input.tool.cost === undefined ? "unknown" : roundUsd(units * input.tool.cost.usd);
  const budgetRemainingUsd =
    input.budgetRemainingUsd ??
    budgetRemainingFromLog(input.budgetUsd, input.costLog) ??
    (await budgetRemainingFromDisk(input.projectRoot, input.showEpisode, input.budgetUsd));

  return {
    tool: input.tool.name,
    provider: input.tool.provider,
    model: input.model ?? inferString(input.params, ["model", "model_id", "modelId", "variant"]) ?? "unknown",
    reason: input.reason,
    sample_or_batch: input.sampleOrBatch ?? inferSampleOrBatch(input.params),
    estimate_usd: estimateUsd,
    cost_unit: input.tool.cost?.unit ?? "unknown",
    units,
    ...(budgetRemainingUsd === undefined ? {} : { budget_remaining_usd: budgetRemainingUsd }),
  };
}

function defaultRunner<I, O>(input: AnnounceBeforeExecuteInput<I, O>): () => Promise<O> {
  if (input.ctx === undefined) {
    throw new Error("announceBeforeExecute requires ctx when no execute callback is supplied");
  }

  return () => input.tool.execute(input.params, input.ctx as ToolContext);
}

function formatAnnounceBlock(block: AnnounceBlock): string {
  const estimate = block.estimate_usd === "unknown" ? "unknown" : `$${block.estimate_usd.toFixed(2)}`;
  const budget =
    block.budget_remaining_usd === undefined
      ? ""
      : `\nBudget remaining: ${
          block.budget_remaining_usd === "unknown" ? "unknown" : `$${block.budget_remaining_usd.toFixed(2)}`
        }.`;

  return [
    `Generating via the \`${block.tool}\` tool (provider: ${block.provider}, model: ${block.model}).`,
    `Reason: ${block.reason}`,
    `This is the ${block.sample_or_batch} run.`,
    `Estimated cost: ${estimate}.${budget}`,
  ].join("\n");
}

function inferUnits(params: unknown, costUnit: string | undefined): number | "unknown" {
  if (!isRecord(params)) {
    return "unknown";
  }

  const unitFields: Record<string, string[]> = {
    call: ["units", "calls", "count"],
    clip: ["units", "clips", "clip_count", "count"],
    image: ["units", "images", "image_count", "count"],
    minute: ["units", "minutes", "duration_minutes"],
    second: ["units", "seconds", "duration_s", "duration_seconds"],
    token: ["units", "tokens", "token_count"],
  };
  const fields = costUnit === undefined ? ["units", "count"] : unitFields[costUnit] ?? ["units", "count"];

  for (const field of fields) {
    const value = params[field];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return "unknown";
}

function inferSampleOrBatch(params: unknown): SampleOrBatch {
  if (!isRecord(params)) {
    return "batch";
  }

  const mode = inferString(params, ["mode", "run_mode", "sample_or_batch"]);
  if (mode === "sample") {
    return "sample";
  }

  if (params.sample === true || params.sample_required === true) {
    return "sample";
  }

  return "batch";
}

function budgetRemainingFromLog(budgetUsd: number | undefined, costLog: CostLog | undefined): number | undefined {
  if (budgetUsd === undefined || costLog === undefined) {
    return undefined;
  }

  return roundUsd(budgetUsd - costLog.reduce((sum, entry) => sum + entry.usd, 0));
}

async function budgetRemainingFromDisk(
  projectRoot: string | undefined,
  showEpisode: string | { show: string; episode: string } | undefined,
  budgetUsd: number | undefined,
): Promise<number | "unknown" | undefined> {
  if (projectRoot === undefined || showEpisode === undefined || budgetUsd === undefined) {
    return undefined;
  }

  const target =
    typeof showEpisode === "string"
      ? { show: showEpisode.split("/")[0] ?? "", episode: showEpisode.split("/")[1] ?? "" }
      : showEpisode;
  if (target.show.length === 0 || target.episode.length === 0) {
    return "unknown";
  }

  const candidates = [
    path.join(projectRoot, "projects", target.show, target.episode, "cost-log.json"),
    path.join(projectRoot, "projects", target.show, target.episode, "cost_log.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      const log = CostLogSchema.parse(JSON.parse(raw) as unknown);
      return budgetRemainingFromLog(budgetUsd, log);
    } catch (error) {
      if (!isMissingFile(error)) {
        return "unknown";
      }
    }
  }

  return undefined;
}

function inferString(params: unknown, fields: string[]): string | undefined {
  if (!isRecord(params)) {
    return undefined;
  }

  for (const field of fields) {
    const value = params[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
