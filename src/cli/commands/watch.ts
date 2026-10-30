import { existsSync } from "node:fs";
import { watch as fsWatch } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { BRANDING } from "../../branding.js";
import { findProjectRoot } from "../../paths/project.js";
import {
  deriveSlug,
  loadAllShowIngest,
  projectRelativePath,
  resolveDropMatch,
  type ResolvedDropMatch,
  type ShowIngestWatchEntry,
} from "../../shows/ingest.js";
import { episodeFilePath } from "../../shows/load.js";
import { writeEpisodeFromDrop } from "../scaffold/from-drop.js";
import type { CliIo, GlobalOptions } from "./stub.js";

export type WatchEvent = {
  eventType: string;
  filename: string | Buffer | null;
};

export type WatchFactory = (
  rootPath: string,
  options: { recursive: boolean; signal?: AbortSignal },
) => AsyncIterable<WatchEvent>;

type WatchDeps = {
  cwd?: () => string;
  now?: () => number;
  signal?: AbortSignal;
  watch?: WatchFactory;
};

type DropDetectedEvent = {
  event: "drop_detected";
  show: string;
  pipeline: string;
  path: string;
  suggested_command: string;
};

type WatchOptions = GlobalOptions & {
  /** Write the episode YAML for each new drop instead of only suggesting `import`. */
  import?: boolean;
};

type WatchImportEvent =
  | { event: "episode_imported"; show: string; episode: string; pipeline: string; path: string; source: string }
  | { event: "episode_exists"; show: string; episode: string; path: string; source: string };

type WatchIdleEvent = {
  event: "watch_idle";
  reason: "no_ingest_watch_entries";
};

export function createWatchHandler(io: CliIo, deps: WatchDeps = {}) {
  return async (...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<WatchOptions>();
    const cwd = deps.cwd?.() ?? process.cwd();
    const projectRoot = findProjectRoot(cwd);
    const entries = await loadAllShowIngest(projectRoot);

    if (entries.length === 0) {
      emitIdle(io, options);
      return;
    }

    const watch = deps.watch ?? defaultWatch;
    const grouped = groupByWatchRoot(entries);
    const seen = new Map<string, number>();

    try {
      await Promise.all(
        Array.from(grouped.entries()).map(([watchRoot, watchEntries]) =>
          watchRootForDrops({
            io,
            options,
            projectRoot,
            watch,
            watchRoot,
            watchEntries,
            seen,
            now: deps.now ?? Date.now,
            signal: deps.signal,
          }),
        ),
      );
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      throw error;
    }
  };
}

const defaultWatch: WatchFactory = (rootPath, options) =>
  fsWatch(rootPath, options) as AsyncIterable<WatchEvent>;

async function watchRootForDrops(input: {
  io: CliIo;
  options: WatchOptions;
  projectRoot: string;
  watch: WatchFactory;
  watchRoot: string;
  watchEntries: ShowIngestWatchEntry[];
  seen: Map<string, number>;
  now: () => number;
  signal?: AbortSignal;
}): Promise<void> {
  const iterator = input.watch(input.watchRoot, { recursive: true, signal: input.signal });

  for await (const event of iterator) {
    const eventPath = resolveEventPath(input.watchRoot, event.filename);
    if (!eventPath) {
      continue;
    }

    const match = await resolveDropMatch(eventPath, input.watchEntries);
    if (!match || wasRecentlySeen(match.matchedFilePath, input.seen, input.now())) {
      continue;
    }

    if (input.options.import === true && match.watchEntry.slug_from !== "prompt") {
      await importDrop(input.io, input.options, input.projectRoot, match);
      continue;
    }

    emitDrop(input.io, input.options, input.projectRoot, match);
  }
}

function emitDrop(
  io: CliIo,
  options: GlobalOptions,
  projectRoot: string,
  match: ResolvedDropMatch,
): void {
  const relativePath = projectRelativePath(projectRoot, match.matchedFilePath);
  const slug = deriveSlug(match.matchedFilePath, match.watchEntry);
  const target = `${match.show.slug}/${slug}`;
  const suggestedCommand = `${BRANDING.primaryCli} import ${shellQuote(relativePath)} --as ${shellQuote(target)}`;

  if (options.json) {
    const event: DropDetectedEvent = {
      event: "drop_detected",
      show: match.show.slug,
      pipeline: match.watchEntry.pipeline,
      path: relativePath,
      suggested_command: suggestedCommand,
    };
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write(`${suggestedCommand}\n`);
}

async function importDrop(
  io: CliIo,
  options: WatchOptions,
  projectRoot: string,
  match: ResolvedDropMatch,
): Promise<void> {
  const slug = deriveSlug(match.matchedFilePath, match.watchEntry);
  const source = projectRelativePath(projectRoot, match.matchedFilePath);
  const episodeFile = episodeFilePath(match.show, slug);
  let event: WatchImportEvent;

  if (existsSync(episodeFile)) {
    event = { event: "episode_exists", show: match.show.slug, episode: slug, path: episodeFile, source };
  } else {
    const written = await writeEpisodeFromDrop(match.show, slug, match);
    event = { event: "episode_imported", show: match.show.slug, episode: slug, pipeline: written.pipeline, path: written.path, source };
  }

  if (options.json) {
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write(
    event.event === "episode_imported"
      ? `watch: imported ${source} -> ${event.path}; next: ${BRANDING.primaryCli} build ${match.show.slug}/${slug}\n`
      : `watch: ${match.show.slug}/${slug} already exists (${event.path}); skipped ${source}\n`,
  );
}

function emitIdle(io: CliIo, options: GlobalOptions): void {
  if (options.json) {
    const event: WatchIdleEvent = {
      event: "watch_idle",
      reason: "no_ingest_watch_entries",
    };
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write("watch: no ingest.watch entries configured\n");
}

function groupByWatchRoot(entries: ShowIngestWatchEntry[]): Map<string, ShowIngestWatchEntry[]> {
  const grouped = new Map<string, ShowIngestWatchEntry[]>();

  for (const entry of entries) {
    const existing = grouped.get(entry.absolutePath);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(entry.absolutePath, [entry]);
    }
  }

  return grouped;
}

function resolveEventPath(watchRoot: string, filename: string | Buffer | null): string | null {
  if (filename === null) {
    return null;
  }

  const value = Buffer.isBuffer(filename) ? filename.toString("utf8") : filename;
  if (value.trim() === "") {
    return null;
  }

  return path.isAbsolute(value) ? value : path.join(watchRoot, value);
}

function wasRecentlySeen(absolutePath: string, seen: Map<string, number>, now: number): boolean {
  const previous = seen.get(absolutePath);
  if (previous !== undefined && now - previous < 200) {
    return true;
  }

  seen.set(absolutePath, now);
  return false;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value)) {
    return value;
  }

  return `'${value.replace(/'/gu, "'\\''")}'`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
