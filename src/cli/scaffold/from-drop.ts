import { access, readdir } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { atomicWrite } from "../../checkpoints/io.js";
import { loadYaml } from "../../config/loader.js";
import { EpisodeSchema, validateEpisodeAgainstShow, type Episode } from "../../shows/episode.js";
import {
  deriveInputs,
  deriveSlug,
  showIngestWatchEntries,
  type ResolvedDropMatch,
  type ShowIngestWatchEntry,
} from "../../shows/ingest.js";
import { episodeFilePath, type LoadedShow } from "../../shows/load.js";
import { titleize, today } from "./index.js";

export type MaterializedEpisode = {
  path: string;
  pipeline: string;
  inputs: Record<string, string>;
  source: string;
};

/** Builds and writes `episodes/<slug>.yaml` from a matched ingest drop (what `import` does). */
export async function writeEpisodeFromDrop(show: LoadedShow, slug: string, match: ResolvedDropMatch): Promise<MaterializedEpisode> {
  const pipeline = match.watchEntry.pipeline;
  const template = await loadEpisodeTemplate(show);
  const inputs = await deriveInputs(match.matchedFilePath, match, {
    templateInputs: template?.inputs,
  });
  const episode = {
    slug,
    title: titleize(slug),
    created: today(),
    pipeline,
    inputs,
    cast: template?.cast ?? [],
    tags: [...new Set([pipeline, ...(template?.tags ?? [])])],
  };
  const parsed = EpisodeSchema.parse(episode);
  const validation = validateEpisodeAgainstShow(parsed, show);

  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }

  const filePath = episodeFilePath(show, slug);
  await atomicWrite(filePath, YAML.stringify(episode));

  return { path: filePath, pipeline, inputs, source: match.matchedFilePath };
}

/**
 * Finds a file under the show's `ingest.watch` roots whose derived slug is `slug`.
 * `slug_from: prompt` entries never match because their slug is not derivable.
 */
export async function findWatchedDrop(show: LoadedShow, slug: string): Promise<ResolvedDropMatch | null> {
  for (const entry of showIngestWatchEntries(show)) {
    if (entry.watchEntry.slug_from === "prompt") {
      continue;
    }

    for await (const filePath of walkFiles(entry.absolutePath)) {
      const relative = path.relative(entry.absolutePath, filePath);
      if (!entry.matcher(relative) || deriveSlug(filePath, entry.watchEntry) !== slug) {
        continue;
      }

      return toMatch(entry, filePath, relative);
    }
  }

  return null;
}

/**
 * When `episodes/<slug>.yaml` is missing but a watched drop derives to `slug`,
 * writes the episode from that drop. Returns null when the episode already exists
 * or nothing matches.
 */
export async function materializeEpisodeFromIngest(show: LoadedShow, slug: string): Promise<MaterializedEpisode | null> {
  const filePath = episodeFilePath(show, slug);
  if (await exists(filePath)) {
    return null;
  }

  const match = await findWatchedDrop(show, slug);
  return match === null ? null : writeEpisodeFromDrop(show, slug, match);
}

async function loadEpisodeTemplate(show: LoadedShow): Promise<Episode | undefined> {
  if (show.ingest?.episode_template === undefined) {
    return undefined;
  }

  const template = await loadYaml(path.resolve(show.rootDir, show.ingest.episode_template), EpisodeSchema);
  return EpisodeSchema.parse(template);
}

function toMatch(entry: ShowIngestWatchEntry, filePath: string, relative: string): ResolvedDropMatch {
  return {
    ...entry,
    matchedFilePath: path.resolve(filePath),
    matchedRelativePath: relative.replace(/\\/gu, "/"),
  };
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath);
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
