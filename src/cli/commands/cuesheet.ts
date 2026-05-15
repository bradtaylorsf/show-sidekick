import path from "node:path";
import type { Command } from "commander";
import { readFile } from "node:fs/promises";
import type { DecisionEntry } from "../../artifacts/decision-log.js";
import { CuesheetSchema, writeCuesheet, type Cuesheet } from "../../artifacts/cuesheet.js";
import { projectDir } from "../../checkpoints/paths.js";
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
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>();
    const projectRoot = deps.findProjectRoot(process.cwd());
    const parsed = deps.parseShowEpisode(target, projectRoot);
    const show = await deps.loadShow(projectRoot, parsed.show);
    const episode = await deps.loadEpisode(show, parsed.episode);
    const trackPath = readTrackPath(episode);
    const cuesheet =
      trackPath === undefined
        ? await deriveVoiceoverCuesheet(projectRoot, parsed.show, parsed.episode)
        : await buildAudioCuesheet({
            target: { show: parsed.show, episode: parsed.episode },
            projectRoot,
            trackPath,
            options,
            io,
            deps,
          });
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

async function buildAudioCuesheet(input: {
  target: ShowEpisodeTarget;
  projectRoot: string;
  trackPath: string;
  options: GlobalOptions;
  io: CliIo;
  deps: CuesheetDeps;
}): Promise<Cuesheet> {
  const registry = await input.deps.createRegistry();
  const preflight = await preflightAudioTools(registry);

  writePreflight(preflight, input.options, input.io);

  return CuesheetSchema.parse(
    await input.deps.buildCuesheet(resolveTrackPath(input.projectRoot, input.trackPath), {
      master_clock: "audio",
      transcribe: true,
      detect_sections: true,
      detect_beats: true,
      detect_climax: true,
      registry,
      projectRoot: input.projectRoot,
      recordDecision: async (entry) => {
        await input.deps.recordDecision(input.target, entry, { root: input.projectRoot });
      },
    }),
  );
}

function readTrackPath(episode: LoadedEpisode): string | undefined {
  const track = episode.inputs.track;

  return typeof track === "string" && track.trim() !== "" ? track : undefined;
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

async function deriveVoiceoverCuesheet(projectRoot: string, show: string, episode: string): Promise<Cuesheet> {
  const dir = projectDir(projectRoot, show, episode);
  const [script, scenePlan, editDecisions, renderReport] = await Promise.all([
    readJsonRecord(path.join(dir, "script.json")),
    readJsonRecord(path.join(dir, "scene_plan.json")),
    readJsonRecord(path.join(dir, "edit_decisions.json")),
    readJsonRecord(path.join(dir, "render_report.json")),
  ]).catch((error: unknown) => {
    throw new Error(
      `episode.inputs.track is missing and no completed voiceover artifacts were found to derive a cuesheet: ${errorMessage(error)}`,
    );
  });
  const durationS = positiveNumber(renderReport.duration_s) ?? maxSectionEnd(script) ?? maxSceneEnd(scenePlan);
  const audioPath = audioTrackPath(editDecisions);

  if (durationS === undefined || audioPath === undefined) {
    throw new Error(
      "episode.inputs.track is missing and completed artifacts do not include render duration plus an audio track for `predit cuesheet`",
    );
  }

  const sections = scriptSections(script, durationS);
  const segments = sections.map((section) => ({
    start_s: section.start_s,
    end_s: section.end_s,
    text: section.text,
    words: wordTimings(section.text, section.start_s, section.end_s),
  }));
  const sceneAnchors = scenePlanScenes(scenePlan, sections).map((scene, index) => ({
    scene_id: scene.slug,
    start_s: scene.start_s,
    end_s: scene.end_s,
    snapped_to: "manual" as const,
    source: { word_id: segments[index]?.words[0]?.text },
  }));

  return CuesheetSchema.parse({
    audio: {
      path: audioPath,
      duration_s: durationS,
      sample_rate: 48000,
      channels: 2,
    },
    master_clock: "voiceover",
    transcription_confidence: {
      average: 1,
      low_confidence: false,
    },
    words: segments.flatMap((segment) => segment.words),
    segments,
    sections: sections.map((section, index) => ({
      label: section.slug || `section-${index + 1}`,
      start_s: section.start_s,
      end_s: section.end_s,
      kind: "vocal",
      energy: section.role === "hook" ? 1 : section.role === "resolution" ? 0.78 : 0.86,
    })),
    beats: sections.map((section, index) => ({
      time_s: section.start_s,
      strength: index === 0 ? 1 : 0.8,
      is_downbeat: true,
    })),
    climax: [
      {
        time_s: roundTime(sections[Math.min(1, sections.length - 1)]?.start_s ?? durationS * 0.66),
        type: "arrival",
        intensity: 0.9,
        source: "agent",
      },
    ],
    scene_anchors: sceneAnchors,
  });
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

type RecordValue = Record<string, unknown>;

type DerivedSection = {
  slug: string;
  role?: string;
  start_s: number;
  end_s: number;
  text: string;
};

type DerivedScene = {
  slug: string;
  start_s: number;
  end_s: number;
};

async function readJsonRecord(filePath: string): Promise<RecordValue> {
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return parsed as RecordValue;
}

function scriptSections(script: RecordValue, durationS: number): DerivedSection[] {
  const rawSections = Array.isArray(script.sections) ? script.sections : [];
  const sections = rawSections.flatMap((value, index) => {
    if (!isRecord(value)) {
      return [];
    }
    const startS = nonnegativeNumber(value.start_s);
    const endS = positiveNumber(value.end_s);
    const narration = typeof value.narration === "string" ? value.narration.trim() : "";
    if (startS === undefined || endS === undefined || endS <= startS || narration === "") {
      return [];
    }

    return [
      {
        slug: typeof value.slug === "string" && value.slug.trim() !== "" ? value.slug : `section-${index + 1}`,
        role: typeof value.role === "string" ? value.role : undefined,
        start_s: startS,
        end_s: endS,
        text: narration,
      },
    ];
  });

  if (sections.length > 0) {
    return sections;
  }

  return [
    {
      slug: "voiceover",
      start_s: 0,
      end_s: durationS,
      text: "Voiceover timing derived from render duration.",
    },
  ];
}

function scenePlanScenes(scenePlan: RecordValue, fallback: DerivedSection[]): DerivedScene[] {
  const scenes = Array.isArray(scenePlan.scenes)
    ? scenePlan.scenes.flatMap((value, index) => {
        if (!isRecord(value)) {
          return [];
        }
        const startS = nonnegativeNumber(value.start_s);
        const endS = positiveNumber(value.end_s);
        if (startS === undefined || endS === undefined || endS <= startS) {
          return [];
        }
        return [
          {
            slug: typeof value.slug === "string" && value.slug.trim() !== "" ? value.slug : `scene-${index + 1}`,
            start_s: startS,
            end_s: endS,
          },
        ];
      })
    : [];

  return scenes.length > 0
    ? scenes
    : fallback.map((section) => ({ slug: section.slug, start_s: section.start_s, end_s: section.end_s }));
}

function wordTimings(text: string, startS: number, endS: number): Cuesheet["segments"][number]["words"] {
  const words = text.match(/[A-Za-z0-9']+/gu) ?? [];
  if (words.length === 0) {
    return [];
  }

  const duration = Math.max(0.001, endS - startS);
  const wordDuration = duration / words.length;

  return words.map((word, index) => ({
    text: word,
    start_s: roundTime(startS + index * wordDuration),
    end_s: roundTime(index === words.length - 1 ? endS : startS + (index + 1) * wordDuration),
    confidence: 1,
  }));
}

function audioTrackPath(editDecisions: RecordValue): string | undefined {
  const audio = recordValue(editDecisions.audio);
  const music = recordValue(audio?.music);
  const trackPath = music?.track_path;

  return typeof trackPath === "string" && trackPath.trim() !== "" ? trackPath : undefined;
}

function maxSectionEnd(script: RecordValue): number | undefined {
  const values = Array.isArray(script.sections) ? script.sections : [];
  return maxEnd(values);
}

function maxSceneEnd(scenePlan: RecordValue): number | undefined {
  const values = Array.isArray(scenePlan.scenes) ? scenePlan.scenes : [];
  return maxEnd(values);
}

function maxEnd(values: unknown[]): number | undefined {
  const ends = values.flatMap((value) => {
    if (!isRecord(value)) {
      return [];
    }
    const endS = positiveNumber(value.end_s);
    return endS === undefined ? [] : [endS];
  });

  return ends.length === 0 ? undefined : Math.max(...ends);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function nonnegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function recordValue(value: unknown): RecordValue | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
