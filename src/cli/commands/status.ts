import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { type Checkpoint, listCheckpoints, readCheckpoint, readState, type PipelineState } from "../../checkpoints/index.js";
import { aggregateCosts } from "../../cost/aggregate.js";
import { readCostLog } from "../../cost/tracker.js";
import { findProjectRoot, parseShowEpisode, projectPaths } from "../../paths/project.js";
import { loadShow } from "../../shows/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type ErrorWithCode = Error & { code?: string };

type LastDecision = {
  stage: string;
  decision: string;
};

type StatusRow = {
  event: "episode_status";
  target: string;
  show: string;
  episode: string;
  state: PipelineState | null;
  cost: {
    sample_total: number;
    full_total: number;
    total_so_far_usd: number;
  };
  last_decision: LastDecision | null;
};

export function createStatusHandler(io: CliIo) {
  return async (target: string | undefined, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>();
    const projectRoot = findProjectRoot();
    const rows = await loadStatusRows(projectRoot, target);

    if (options.json) {
      for (const row of rows) {
        io.stdout.write(`${JSON.stringify(row)}\n`);
      }
      return;
    }

    if (rows.length === 0) {
      io.stdout.write("status: no episodes found\n");
      return;
    }

    io.stdout.write(rows.map(formatStatusRow).join("\n") + "\n");
  };
}

async function loadStatusRows(projectRoot: string, target: string | undefined): Promise<StatusRow[]> {
  if (target === undefined) {
    const shows = await listShows(projectRoot);
    const nested = await Promise.all(shows.map((show) => loadShowRows(projectRoot, show)));
    return nested.flat();
  }

  if (target.includes("/")) {
    const parsed = parseShowEpisode(target, projectRoot);
    await loadShow(projectRoot, parsed.show);
    await ensureEpisodeExists(parsed.episodeFile);
    return [await loadEpisodeStatus(projectRoot, parsed.show, parsed.episode)];
  }

  const show = parseShowSlug(target);
  await loadShow(projectRoot, show);
  return loadShowRows(projectRoot, show);
}

async function loadShowRows(projectRoot: string, show: string): Promise<StatusRow[]> {
  const episodes = await listEpisodes(projectRoot, show);
  return Promise.all(episodes.map((episode) => loadEpisodeStatus(projectRoot, show, episode)));
}

async function loadEpisodeStatus(projectRoot: string, show: string, episode: string): Promise<StatusRow> {
  const state = await readState(projectRoot, show, episode);
  const costAggregate = aggregateCosts(await readCostLog(projectRoot, show, episode));
  const lastDecision = await findLastDecision(projectRoot, show, episode);
  const total = costAggregate.sample_total + costAggregate.full_total;

  return {
    event: "episode_status",
    target: `${show}/${episode}`,
    show,
    episode,
    state: state ?? null,
    cost: {
      sample_total: costAggregate.sample_total,
      full_total: costAggregate.full_total,
      total_so_far_usd: total,
    },
    last_decision: lastDecision,
  };
}

async function findLastDecision(projectRoot: string, show: string, episode: string): Promise<LastDecision | null> {
  const candidates: Array<{ stage: string; checkpoint: Checkpoint }> = [];

  for (const stage of await listCheckpoints(projectRoot, show, episode)) {
    const checkpoint = await readCheckpoint(projectRoot, show, episode, stage);
    if (
      (checkpoint.status === "completed" || checkpoint.status === "awaiting_human") &&
      checkpoint.review_summary?.decision
    ) {
      candidates.push({ stage, checkpoint });
    }
  }

  const latest = candidates.reduce<Array<{ stage: string; checkpoint: Checkpoint }>[number] | undefined>(
    (current, candidate) => {
      if (!current) {
        return candidate;
      }

      return checkpointTime(candidate.checkpoint) > checkpointTime(current.checkpoint) ? candidate : current;
    },
    undefined,
  );

  if (!latest?.checkpoint.review_summary?.decision) {
    return null;
  }

  return {
    stage: latest.stage,
    decision: latest.checkpoint.review_summary.decision,
  };
}

async function listShows(projectRoot: string): Promise<string[]> {
  const showsDir = projectPaths(projectRoot).shows;
  try {
    const entries = await readdir(showsDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listEpisodes(projectRoot: string, show: string): Promise<string[]> {
  const episodesDir = path.join(projectPaths(projectRoot).shows, show, "episodes");
  try {
    const entries = await readdir(episodesDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => path.basename(entry.name, ".yaml"))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function ensureEpisodeExists(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      throw new Error(`episode not found at ${filePath}`);
    }
    throw error;
  }
}

function parseShowSlug(value: string): string {
  if (
    value === "" ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error(`invalid show '${value}'`);
  }

  return value;
}

function formatStatusRow(row: StatusRow): string {
  const state = row.state
    ? `current_stage=${row.state.current_stage ?? "none"} last_status=${row.state.last_status ?? "unknown"}`
    : "missing";
  const decision = row.last_decision
    ? `${row.last_decision.stage} -> ${row.last_decision.decision}`
    : "none";

  return [
    `status: ${row.target}`,
    `state: ${state}`,
    `cost: sample ${formatMoney(row.cost.sample_total)}, full ${formatMoney(row.cost.full_total)}, total ${formatMoney(
      row.cost.total_so_far_usd,
    )}`,
    `last decision: ${decision}`,
  ].join("\n");
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function checkpointTime(checkpoint: Checkpoint): number {
  const time = Date.parse(checkpoint.timestamp);
  return Number.isNaN(time) ? 0 : time;
}
