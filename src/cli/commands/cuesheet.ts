import path from "node:path";
import type { Command } from "commander";
import type { DecisionEntry } from "../../artifacts/decision-log.js";
import { CuesheetSchema, writeCuesheet, type Cuesheet } from "../../artifacts/cuesheet.js";
import { buildCuesheet } from "../../audio/cuesheet.js";
import { recordDecision, type DecisionStoreOptions, type ShowEpisodeTarget } from "../../decisions/store.js";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import { Registry, type Capability, type Tool } from "../../registry/index.js";
import { loadEpisode, loadShow, type LoadedEpisode } from "../../shows/load.js";
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
  loadShow: typeof loadShow;
  loadEpisode: typeof loadEpisode;
  createRegistry: () => Promise<Registry>;
  buildCuesheet: typeof buildCuesheet;
  writeCuesheet: typeof writeCuesheet;
  recordDecision: (
    showEpisode: ShowEpisodeTarget,
    entry: DecisionEntry,
    options?: DecisionStoreOptions,
  ) => Promise<DecisionEntry[]>;
};

const defaultDeps: CuesheetDeps = {
  findProjectRoot,
  parseShowEpisode,
  loadShow,
  loadEpisode,
  createRegistry: createDefaultRegistry,
  buildCuesheet,
  writeCuesheet,
  recordDecision,
};

export function createCuesheetHandler(io: CliIo = defaultIo, deps: CuesheetDeps = defaultDeps) {
  return async (target: string, command: Command): Promise<void> => {
    const options = command.optsWithGlobals<GlobalOptions>();
    const projectRoot = deps.findProjectRoot(process.cwd());
    const parsed = deps.parseShowEpisode(target, projectRoot);
    const show = await deps.loadShow(projectRoot, parsed.show);
    const episode = await deps.loadEpisode(show, parsed.episode);
    const trackPath = readTrackPath(episode);
    const registry = await deps.createRegistry();
    const preflight = await preflightAudioTools(registry);

    writePreflight(preflight, options, io);

    const cuesheet = CuesheetSchema.parse(await deps.buildCuesheet(resolveTrackPath(projectRoot, trackPath), {
      master_clock: "audio",
      transcribe: true,
      detect_sections: true,
      detect_beats: true,
      detect_climax: true,
      registry,
      projectRoot,
      recordDecision: async (entry) => {
        await deps.recordDecision({ show: parsed.show, episode: parsed.episode }, entry, { root: projectRoot });
      },
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

async function createDefaultRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

function readTrackPath(episode: LoadedEpisode): string {
  const track = episode.inputs.track;

  if (typeof track !== "string" || track.trim() === "") {
    throw new Error("episode.inputs.track must be a non-empty audio path for `predit cuesheet`");
  }

  return track;
}

function resolveTrackPath(projectRoot: string, trackPath: string): string {
  if (looksLikeUrl(trackPath)) {
    return trackPath;
  }

  return path.isAbsolute(trackPath) ? trackPath : path.resolve(projectRoot, trackPath);
}

async function preflightAudioTools(registry: Registry): Promise<Array<{ capability: Capability; tool: string }>> {
  await registry.refreshAvailability();

  return (["whisper", "beats"] as const).map((capability) => {
    const candidates = registry.byCapability(capability);
    const selected = candidates.find((tool) => registry.getAvailability(tool.name)?.available === true);

    if (selected === undefined) {
      throw new Error(`audio preflight failed: ${formatUnavailableCapability(capability, candidates, registry)}`);
    }

    return { capability, tool: selected.name };
  });
}

function formatUnavailableCapability(capability: Capability, candidates: Tool[], registry: Registry): string {
  if (candidates.length === 0) {
    return `no tool registered for capability "${capability}"`;
  }

  const details = candidates.map((tool) => {
    const availability = registry.getAvailability(tool.name);
    const reason = availability?.available === false ? availability.reason : "not available";
    return `${tool.name}: ${reason}. Install: ${tool.integration.install}`;
  });

  return `no available tool for capability "${capability}" (${details.join("; ")})`;
}

function writePreflight(
  preflight: Array<{ capability: Capability; tool: string }>,
  options: GlobalOptions,
  io: CliIo,
): void {
  if (options.json) {
    io.stdout.write(`${JSON.stringify({ event: "audio_preflight", tools: preflight })}\n`);
    return;
  }

  io.stderr.write(`audio preflight: ${preflight.map((item) => `${item.capability}=${item.tool}`).join(", ")}\n`);
}

function looksLikeUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
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
