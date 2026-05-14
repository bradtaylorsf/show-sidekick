import { existsSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VideoAnalysisBriefSchema, type VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { atomicWrite } from "../checkpoints/index.js";
import { projectDir } from "../checkpoints/paths.js";
import type { CliIo } from "../cli/commands/stub.js";
import { projectPaths } from "../paths/project.js";
import type { Registry } from "../registry/index.js";
import type { ToolLogger } from "../registry/tool.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";

export type ReferenceSource =
  | {
      kind: "url";
      original: string;
      url: string;
    }
  | {
      kind: "file";
      original: string;
      absolutePath: string;
    };

export type ResolveReferenceSourceOptions = {
  projectRoot: string;
  cwd?: string;
};

export class ReferenceSourceNotFoundError extends Error {
  readonly code = "reference_source_not_found";

  constructor(
    readonly reference: string,
    readonly candidates: string[],
  ) {
    super(`reference source '${reference}' was not found; checked: ${candidates.join(", ")}`);
    this.name = "ReferenceSourceNotFoundError";
  }
}

export class ReferenceAnalyzerMissingError extends Error {
  readonly code = "reference_analyzer_missing";

  constructor() {
    super("reference workflow requires the 'video_analyzer' tool, but it is not registered");
    this.name = "ReferenceAnalyzerMissingError";
  }
}

export type AnalyzeReferenceOptions = {
  source: ReferenceSource;
  registry: Registry;
  projectRoot: string;
  show: LoadedShow | string;
  episode: LoadedEpisode | string;
  io: CliIo;
  json?: boolean;
  now?: () => Date;
};

export function resolveReferenceSource(
  value: string | undefined,
  options: ResolveReferenceSourceOptions,
): ReferenceSource | undefined {
  const reference = value?.trim();
  if (reference === undefined || reference.length === 0) {
    return undefined;
  }

  const url = parseReferenceUrl(reference);
  if (url !== undefined) {
    return {
      kind: "url",
      original: reference,
      url: url.href,
    };
  }

  const candidates = referenceFileCandidates(reference, options);
  const existing = candidates.find(isExistingFile);
  if (existing !== undefined) {
    return {
      kind: "file",
      original: reference,
      absolutePath: existing,
    };
  }

  throw new ReferenceSourceNotFoundError(reference, candidates);
}

export async function analyzeReference(options: AnalyzeReferenceOptions): Promise<VideoAnalysisBrief> {
  const analyzer = options.registry.get<{ path: string }, unknown>("video_analyzer");
  if (analyzer === undefined) {
    throw new ReferenceAnalyzerMissingError();
  }

  const rawBrief = await analyzer.execute(
    { path: toolPathForReferenceSource(options.source) },
    {
      projectRoot: options.projectRoot,
      logger: referenceWorkflowLogger(),
      registry: options.registry,
    },
  );
  const brief = VideoAnalysisBriefSchema.parse(rawBrief);
  const artifactPath = await writeVideoAnalysisBrief({
    projectRoot: options.projectRoot,
    show: slugOf(options.show),
    episode: slugOf(options.episode),
    brief,
  });

  emitReferenceAnalysis(options.io, {
    json: options.json === true,
    source: options.source,
    artifactPath,
    brief,
    timestamp: (options.now?.() ?? new Date()).toISOString(),
  });

  return brief;
}

function parseReferenceUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:") {
      return url;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function referenceFileCandidates(value: string, options: ResolveReferenceSourceOptions): string[] {
  if (path.isAbsolute(value)) {
    return [path.resolve(value)];
  }

  const cwd = path.resolve(options.cwd ?? process.cwd());
  const musicLibrary = projectPaths(options.projectRoot).musicLibrary;
  const candidates = [path.resolve(cwd, value)];
  const musicCandidate = path.resolve(musicLibrary, value);

  if (isInsideOrEqual(musicCandidate, musicLibrary)) {
    candidates.push(musicCandidate);
  }

  return [...new Set(candidates)];
}

function isExistingFile(candidate: string): boolean {
  if (!existsSync(candidate)) {
    return false;
  }

  try {
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function toolPathForReferenceSource(source: ReferenceSource): string {
  if (source.kind === "file") {
    return source.absolutePath;
  }

  const url = new URL(source.url);
  return url.protocol === "file:" ? fileURLToPath(url) : source.url;
}

async function writeVideoAnalysisBrief(input: {
  projectRoot: string;
  show: string;
  episode: string;
  brief: VideoAnalysisBrief;
}): Promise<string> {
  const artifactDir = path.join(projectDir(input.projectRoot, input.show, input.episode), "artifacts");
  const artifactPath = path.join(artifactDir, "video_analysis_brief.json");

  await mkdir(artifactDir, { recursive: true });
  await atomicWrite(artifactPath, `${JSON.stringify(input.brief, null, 2)}\n`);
  return artifactPath;
}

function emitReferenceAnalysis(
  io: CliIo,
  input: {
    json: boolean;
    source: ReferenceSource;
    artifactPath: string;
    brief: VideoAnalysisBrief;
    timestamp: string;
  },
): void {
  const fiveAspectBreakdown = input.brief.scenes.map((scene, index) => ({
    scene_ref: scene.scene_ref ?? `scene-${index}`,
    subject: scene.subject,
    subject_motion: scene.subject_motion,
    scene: scene.scene,
    spatial_framing: scene.spatial_framing,
    camera: scene.camera,
    motion_type: scene.motion_type,
    flow_variance: scene.flow_variance,
  }));

  if (input.json) {
    io.stdout.write(
      `${JSON.stringify({
        event: "reference_analysis",
        artifact: "video_analysis_brief",
        timestamp: input.timestamp,
        source_kind: input.source.kind,
        source: input.source.kind === "url" ? input.source.url : input.source.absolutePath,
        artifact_path: input.artifactPath,
        scene_count: input.brief.scenes.length,
        scenes: fiveAspectBreakdown.map((scene) => ({
          scene_ref: scene.scene_ref,
          motion_type: scene.motion_type,
          flow_variance: scene.flow_variance,
        })),
        five_aspect_breakdown: fiveAspectBreakdown,
        pacing_style: input.brief.pacing_style,
        promise_elements: input.brief.promise_elements,
        required_next_steps: [
          "present_5_aspect_breakdown",
          "ask_critical_questions",
          "propose_2_to_3_differentiated_concepts",
          "sample_first_before_full_pipeline",
        ],
      })}\n`,
    );
    return;
  }

  const pacing = input.brief.pacing_style ?? "unspecified";
  const promises = input.brief.promise_elements.length > 0 ? input.brief.promise_elements.join(", ") : "none captured";
  const breakdownLines = fiveAspectBreakdown.flatMap((scene) => [
    `- ${scene.scene_ref}`,
    `  Subject: ${joinAspect(scene.subject)}`,
    `  Subject Motion: ${joinAspect(scene.subject_motion)}`,
    `  Scene: ${joinAspect(scene.scene)}`,
    `  Spatial Framing: ${joinAspect(scene.spatial_framing)}`,
    `  Camera: ${joinAspect(scene.camera)}`,
  ]);
  io.stdout.write(
    [
      `reference analysis: ${input.brief.scenes.length} scenes, pacing=${pacing}`,
      `promise elements: ${promises}`,
      "5-aspect breakdown:",
      ...breakdownLines,
      `video_analysis_brief: ${input.artifactPath}`,
      "next: present the 5-aspect breakdown, ask the critical questions, propose 2-3 differentiated concepts, then enter the pipeline after sample approval.",
      "",
    ].join("\n"),
  );
}

function slugOf(value: LoadedShow | LoadedEpisode | string): string {
  return typeof value === "string" ? value : value.slug;
}

function joinAspect(values: string[]): string {
  return values.length > 0 ? values.join("; ") : "N/A";
}

function referenceWorkflowLogger(): ToolLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}
