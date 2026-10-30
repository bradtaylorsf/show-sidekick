import { readdir } from "node:fs/promises";
import type { Command } from "commander";
import { findProjectRoot, parseShowEpisode, projectPaths } from "../../paths/project.js";
import { ACTIONABLE_STATUSES, listEpisodeSlugs, loadQueueRow, type QueueRow } from "../../queue/queue.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget } from "./run-target.js";

type QueueOptions = GlobalOptions & {
  all?: boolean;
};

export function createQueueHandler(io: CliIo) {
  return async (target: string | undefined, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<QueueOptions>();
    const projectRoot = findProjectRoot();
    const rows = (await loadRows(projectRoot, target))
      .filter((row) => options.all === true || ACTIONABLE_STATUSES.includes(row.status))
      .sort((left, right) => (left.updated ?? "").localeCompare(right.updated ?? ""));

    if (options.json) {
      for (const row of rows) {
        io.stdout.write(`${JSON.stringify(row)}\n`);
      }
      return;
    }

    if (rows.length === 0) {
      io.stdout.write(options.all === true ? "queue: no episodes found\n" : "queue: nothing waiting on review\n");
      return;
    }

    io.stdout.write(rows.map(formatRow).join("\n\n") + "\n");
  };
}

async function loadRows(projectRoot: string, target: string | undefined): Promise<QueueRow[]> {
  const targets: string[] = [];
  if (target?.includes("/")) {
    const parsed = parseShowEpisode(target, projectRoot);
    targets.push(`${parsed.show}/${parsed.episode}`);
  } else {
    const shows = target === undefined ? await listShows(projectRoot) : [target];
    for (const show of shows) {
      for (const episode of await listEpisodeSlugs(projectRoot, show)) {
        targets.push(`${show}/${episode}`);
      }
    }
  }

  const rows: QueueRow[] = [];
  for (const each of targets) {
    const loaded = await loadRunTarget(each);
    const row = await loadQueueRow({
      projectRoot: loaded.projectRoot,
      show: loaded.showSlug,
      episode: loaded.episodeSlug,
      title: loaded.episode.title,
      pipelineName: loaded.pipelineName,
      pipeline: loaded.pipeline,
    });
    if (row !== null) {
      rows.push(row);
    }
  }
  return rows;
}

async function listShows(projectRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(projectPaths(projectRoot).shows, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function formatRow(row: QueueRow): string {
  const lines = [
    `queue: ${row.target} [${row.status}${row.stage ? ` at ${row.stage}` : ""}] ${row.title}`,
    `video: ${row.video ? `${row.video.path}${row.video.build ? ` (build ${row.video.build})` : " (missing)"}` : "none yet"}`,
  ];
  for (const stage of row.creative) {
    const summary = stage.summary[0] ?? "";
    lines.push(`${stage.stage}: ${stage.auto_approved ? "auto-approved" : stage.status}${summary ? ` - ${summary}` : ""}`);
  }
  lines.push(
    `findings: ${row.findings.critical} critical, ${row.findings.suggestions} suggestions, ${row.findings.nitpicks} nitpicks` +
      (row.final_review ? ` · final review ${row.final_review}` : ""),
  );
  lines.push(`cost: $${row.cost_usd.toFixed(2)}`);
  if (row.status === "review" && row.video?.build) {
    lines.push(
      `decide: showkick approve ${row.target} --build ${row.video.build}` +
        ` | showkick revise ${row.target} "<note>" --stage <stage> --build ${row.video.build}` +
        ` | showkick reject ${row.target} "<note>" --build ${row.video.build}`,
    );
  }
  return lines.join("\n");
}
