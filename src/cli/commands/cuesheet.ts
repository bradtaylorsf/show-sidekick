import path from "node:path";
import type { Command } from "commander";
import { CuesheetSchema, writeCuesheet, type Cuesheet } from "../../artifacts/cuesheet.js";
import { buildCuesheet } from "../../audio/cuesheet.js";
import { loadYaml } from "../../config/loader.js";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import { EpisodeSchema, type Episode } from "../../shows/episode.js";
import { defaultIo, type CliIo, type GlobalOptions } from "./stub.js";

export type CuesheetSummary = {
  event: "cuesheet";
  target: string;
  path: string;
  duration_s: number;
  section_count: number;
  bpm?: number;
  beat_count: number;
  climax_count: number;
};

export type CuesheetDeps = {
  findProjectRoot: typeof findProjectRoot;
  parseShowEpisode: typeof parseShowEpisode;
  loadEpisode: (filePath: string) => Promise<Episode>;
  buildCuesheet: typeof buildCuesheet;
  writeCuesheet: typeof writeCuesheet;
};

const defaultDeps: CuesheetDeps = {
  findProjectRoot,
  parseShowEpisode,
  loadEpisode: async (filePath) => EpisodeSchema.parse(await loadYaml(filePath, EpisodeSchema)),
  buildCuesheet,
  writeCuesheet,
};

export function createCuesheetHandler(io: CliIo = defaultIo, deps: CuesheetDeps = defaultDeps) {
  return async (target: string, command: Command): Promise<void> => {
    const options = command.optsWithGlobals<GlobalOptions>();
    const projectRoot = deps.findProjectRoot(process.cwd());
    const parsed = deps.parseShowEpisode(target, projectRoot);
    const episode = await deps.loadEpisode(parsed.episodeFile);
    const trackPath = readTrackPath(episode);
    const cuesheet = CuesheetSchema.parse(await deps.buildCuesheet(resolveTrackPath(projectRoot, trackPath), {
      master_clock: "audio",
      transcribe: true,
      detect_sections: true,
      detect_beats: true,
      detect_climax: true,
      projectRoot,
    }));
    const outputPath = await deps.writeCuesheet(projectRoot, parsed.show, parsed.episode, cuesheet);
    const summary = summarize(target, outputPath, cuesheet);

    if (options.json) {
      io.stdout.write(`${JSON.stringify(summary)}\n`);
      return;
    }

    io.stdout.write(formatSummary(summary));
  };
}

function readTrackPath(episode: Episode): string {
  const track = episode.inputs.track;

  if (typeof track !== "string" || track.trim() === "") {
    throw new Error("episode.inputs.track must be a non-empty audio path for `predit cuesheet`");
  }

  return track;
}

function resolveTrackPath(projectRoot: string, trackPath: string): string {
  return path.isAbsolute(trackPath) ? trackPath : path.resolve(projectRoot, trackPath);
}

function summarize(target: string, outputPath: string, cuesheet: Cuesheet): CuesheetSummary {
  return {
    event: "cuesheet",
    target,
    path: outputPath,
    duration_s: cuesheet.audio.duration_s,
    section_count: cuesheet.sections.length,
    ...(cuesheet.bpm === undefined ? {} : { bpm: cuesheet.bpm }),
    beat_count: cuesheet.beats.length,
    climax_count: cuesheet.climax.length,
  };
}

function formatSummary(summary: CuesheetSummary): string {
  const bpm = summary.bpm === undefined ? "unknown bpm" : `${Math.round(summary.bpm * 100) / 100} bpm`;

  return [
    `cuesheet written: ${summary.path}`,
    `duration: ${Math.round(summary.duration_s * 100) / 100}s`,
    `sections: ${summary.section_count}`,
    `tempo: ${bpm}`,
    `beats: ${summary.beat_count}`,
    `climax points: ${summary.climax_count}`,
  ].join("\n") + "\n";
}
