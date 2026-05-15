import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { AssetManifest, PublishLog, PublishLogOutput } from "../artifacts/index.js";
import { atomicWrite } from "../checkpoints/io.js";
import type { Pipeline } from "../pipelines/index.js";
import type { LoadedShow } from "../shows/index.js";
import { linkAsset, parseAssetLinkMode, resolveAssetSourcePath, type AssetLinkMode } from "./asset-linkage.js";
import { exportCapcut } from "./capcut.js";
import { exportDavinci } from "./davinci.js";
import { exportEdl } from "./edl.js";
import type { LinkedAudioTrack, LinkedTimelineAsset } from "./fcp7-xml.js";
import { loadExportArtifacts } from "./load-artifacts.js";
import { exportPremiere } from "./premiere.js";

export const EXPORT_TARGETS = ["premiere", "davinci", "capcut", "edl"] as const;
export const XML_EXPORT_TARGETS = EXPORT_TARGETS;

export type ExportTarget = (typeof EXPORT_TARGETS)[number];
export type XmlExportTarget = ExportTarget;

export type AssembleExportPackageOptions = {
  projectRoot: string;
  show: LoadedShow;
  showSlug: string;
  episodeSlug: string;
  pipeline: Pipeline;
  target: string;
  assetLinkMode?: string;
  outDir?: string;
  overwrite?: boolean;
  now?: Date;
};

export type AssembleExportPackageResult = {
  target: ExportTarget;
  assetLinkMode: AssetLinkMode;
  packageDir: string;
  timelinePath: string;
  readmePath: string;
  captionsPath: string;
  publishLog: PublishLog;
};

export async function assembleExportPackage(
  options: AssembleExportPackageOptions,
): Promise<AssembleExportPackageResult> {
  validatePipelineSupportsTarget(options.pipeline, options.target);
  const target = parseExportTarget(options.target);
  const assetLinkMode = resolvePackageAssetLinkMode(options.assetLinkMode, options.show);
  const artifacts = await loadExportArtifacts(options.projectRoot, options.showSlug, options.episodeSlug);
  const packageDir = packageDirectory(options.projectRoot, options.outDir, options.showSlug, options.episodeSlug, target);
  const assetsDir = path.join(packageDir, "assets");
  const captionsDir = path.join(packageDir, "captions");

  await preparePackageDirectory(packageDir, options.overwrite === true);
  await mkdir(assetsDir, { recursive: true });
  await mkdir(captionsDir, { recursive: true });

  const linkedAssets = await linkTimelineAssets({
    projectRoot: options.projectRoot,
    assetsDir,
    mode: assetLinkMode,
    assets: artifacts.assetManifest.assets,
  });
  const audioTracks = await linkAudioTracks({
    projectRoot: options.projectRoot,
    assetsDir,
    mode: assetLinkMode,
    cuesheetAudio: artifacts.cuesheet.audio,
    musicTrackPath: artifacts.editDecisions.audio?.music?.track_path,
    renderDurationS: artifacts.renderReport.duration_s,
  });
  const captionsPath = path.join(captionsDir, "word_timings.json");
  await atomicWrite(captionsPath, `${JSON.stringify(cuesheetWords(artifacts.cuesheet), null, 2)}\n`);

  const exporterOptions = {
    packageDir,
    projectName: `${options.showSlug}/${options.episodeSlug}`,
    editDecisions: artifacts.editDecisions,
    cuesheet: artifacts.cuesheet,
    renderReport: artifacts.renderReport,
    assets: linkedAssets,
    audioTracks,
  };
  const exported = await exportForTarget(target, exporterOptions);
  const publishLog = buildPublishLog({
    target,
    assetLinkMode,
    show: options.showSlug,
    episode: options.episodeSlug,
    pipeline: options.pipeline.slug,
    packageDir,
    timelinePath: exported.timelinePath,
    readmePath: exported.readmePath,
    captionsPath,
    sourceManifestPath: artifacts.paths.asset_manifest,
    renderOutputPath: resolveAssetSourcePath(options.projectRoot, artifacts.renderReport.output_path),
    exportedAt: (options.now ?? new Date()).toISOString(),
    linkedAssetCount: linkedAssets.length,
    audioTrackCount: audioTracks.length,
  });

  return {
    target,
    assetLinkMode,
    packageDir,
    timelinePath: exported.timelinePath,
    readmePath: exported.readmePath,
    captionsPath,
    publishLog,
  };
}

export function validatePipelineSupportsTarget(pipeline: Pipeline, target: string): void {
  const supported = pipeline.export?.supported_targets;
  if (supported === undefined || supported.length === 0) {
    throw new Error(`pipeline '${pipeline.slug}' does not declare export.supported_targets`);
  }

  if (!supported.includes(target)) {
    throw new Error(`pipeline '${pipeline.slug}' does not support export target '${target}'; supported targets: ${supported.join(", ")}`);
  }
}

async function preparePackageDirectory(packageDir: string, overwrite: boolean): Promise<void> {
  if (!(await exists(packageDir))) {
    return;
  }

  if (!overwrite) {
    throw new Error(`export package already exists at ${packageDir}; pass --overwrite to replace it`);
  }

  await rm(packageDir, { recursive: true, force: true });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    const fileError = error as { code?: string };
    if (fileError.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function parseExportTarget(target: string): ExportTarget {
  if (EXPORT_TARGETS.includes(target as ExportTarget)) {
    return target as ExportTarget;
  }

  throw new Error(`export target '${target}' is not implemented yet; implemented targets: ${EXPORT_TARGETS.join(", ")}`);
}

export function parseXmlExportTarget(target: string): ExportTarget {
  return parseExportTarget(target);
}

export function resolvePackageAssetLinkMode(cliValue: string | undefined, show: LoadedShow): AssetLinkMode {
  return parseAssetLinkMode(cliValue) ?? parseAssetLinkMode(show.export?.asset_link_mode, "show.export.asset_link_mode") ?? "copy";
}

function packageDirectory(
  projectRoot: string,
  outDir: string | undefined,
  show: string,
  episode: string,
  target: ExportTarget,
): string {
  const root = outDir === undefined ? path.join(projectRoot, "exports") : path.resolve(projectRoot, outDir);
  return path.join(root, `${show}__${episode}.${target}`);
}

async function linkTimelineAssets(options: {
  projectRoot: string;
  assetsDir: string;
  mode: AssetLinkMode;
  assets: AssetManifest["assets"];
}): Promise<LinkedTimelineAsset[]> {
  const linked: LinkedTimelineAsset[] = [];

  for (const [index, asset] of options.assets.entries()) {
    const source = resolveAssetSourcePath(options.projectRoot, asset.path);
    const destination = path.join(options.assetsDir, packageAssetFileName(index, asset.id, source));
    const linkedPath = await linkAsset(source, destination, options.mode);

    linked.push({
      ...asset,
      linked_path: linkedPath,
    });
  }

  return linked;
}

async function linkAudioTracks(options: {
  projectRoot: string;
  assetsDir: string;
  mode: AssetLinkMode;
  cuesheetAudio: {
    path: string;
    duration_s: number;
    sample_rate: number;
    channels: number;
  };
  musicTrackPath?: string;
  renderDurationS: number;
}): Promise<LinkedAudioTrack[]> {
  const tracks: LinkedAudioTrack[] = [];
  const seen = new Set<string>();

  const addTrack = async (input: {
    id: string;
    name: string;
    sourcePath: string;
    duration_s: number;
    sample_rate?: number;
    channels?: number;
  }) => {
    const source = resolveAssetSourcePath(options.projectRoot, input.sourcePath);
    const normalizedSource = path.normalize(source);
    if (seen.has(normalizedSource)) {
      return;
    }
    seen.add(normalizedSource);

    const destination = path.join(options.assetsDir, `audio_${packageAssetFileName(tracks.length, input.name, source)}`);
    const linkedPath = await linkAsset(source, destination, options.mode);

    tracks.push({
      id: input.id,
      name: input.name,
      linked_path: linkedPath,
      duration_s: input.duration_s,
      sample_rate: input.sample_rate,
      channels: input.channels,
    });
  };

  await addTrack({
    id: "cuesheet-audio",
    name: "cuesheet-audio",
    sourcePath: options.cuesheetAudio.path,
    duration_s: options.cuesheetAudio.duration_s,
    sample_rate: options.cuesheetAudio.sample_rate,
    channels: options.cuesheetAudio.channels,
  });

  if (options.musicTrackPath !== undefined) {
    await addTrack({
      id: "music",
      name: "music",
      sourcePath: options.musicTrackPath,
      duration_s: options.renderDurationS,
      sample_rate: 48000,
      channels: 2,
    });
  }

  return tracks;
}

function cuesheetWords(cuesheet: { words?: unknown[]; segments: Array<{ words: unknown[] }> }): unknown[] {
  if (cuesheet.words !== undefined && cuesheet.words.length > 0) {
    return cuesheet.words;
  }

  return cuesheet.segments.flatMap((segment) => segment.words);
}

function buildPublishLog(input: {
  target: ExportTarget;
  assetLinkMode: AssetLinkMode;
  show: string;
  episode: string;
  pipeline: string;
  packageDir: string;
  timelinePath: string;
  readmePath: string;
  captionsPath: string;
  sourceManifestPath: string;
  renderOutputPath: string;
  exportedAt: string;
  linkedAssetCount: number;
  audioTrackCount: number;
}): PublishLog {
  const outputs: PublishLogOutput[] = [
    {
      path: input.packageDir,
      kind: "export_package",
      platform: input.target,
      notes: `asset_link_mode=${input.assetLinkMode}`,
    },
    {
      path: input.timelinePath,
      kind: timelineOutputKind(input.target),
      platform: input.target,
    },
    {
      path: input.captionsPath,
      kind: "word_timings",
      platform: input.target,
    },
    {
      path: input.readmePath,
      kind: "readme",
      platform: input.target,
    },
  ];

  return {
    outputs,
    metadata: {
      exported_at: input.exportedAt,
      target: input.target,
      asset_link_mode: input.assetLinkMode,
      show: input.show,
      episode: input.episode,
      pipeline: input.pipeline,
      package_path: input.packageDir,
      timeline_path: input.timelinePath,
      render_output_path: input.renderOutputPath,
      linked_asset_count: input.linkedAssetCount,
      audio_track_count: input.audioTrackCount,
    },
    source_manifest_path: input.sourceManifestPath,
    captions_path: input.captionsPath,
    notes: [`Exported ${input.target} ${timelineOutputLabel(input.target)} package.`],
  };
}

async function exportForTarget(
  target: ExportTarget,
  options: Parameters<typeof exportPremiere>[0],
): Promise<{ timelinePath: string; readmePath: string }> {
  switch (target) {
    case "premiere":
      return exportPremiere(options);
    case "davinci":
      return exportDavinci(options);
    case "capcut":
      return exportCapcut(options);
    case "edl":
      return exportEdl(options);
  }
}

function timelineOutputKind(target: ExportTarget): string {
  switch (target) {
    case "premiere":
    case "davinci":
      return "fcp7_xml";
    case "capcut":
      return "capcut_draft";
    case "edl":
      return "edl";
  }
}

function timelineOutputLabel(target: ExportTarget): string {
  switch (target) {
    case "premiere":
    case "davinci":
      return "FCP7 XML";
    case "capcut":
      return "CapCut draft";
    case "edl":
      return "CMX 3600 EDL";
  }
}

function packageAssetFileName(index: number, label: string, sourcePath: string): string {
  const sourceBase = path.basename(sourcePath);
  const extension = path.extname(sourceBase);
  const baseWithoutExtension = path.basename(sourceBase, extension) || label;
  const safeBase = safeFileName(baseWithoutExtension);
  const safeExtension = extension ? safeFileName(extension).replace(/^_+/u, ".") : "";

  return `${String(index + 1).padStart(2, "0")}_${safeBase}${safeExtension}`;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/giu, "_").replace(/^_+|_+$/gu, "") || "asset";
}
