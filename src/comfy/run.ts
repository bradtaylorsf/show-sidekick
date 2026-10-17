import { mkdir, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { announceLocalRun } from "../announce/announce.js";
import type { ToolContext } from "../registry/tool.js";
import { resolveProjectWritePath } from "../tool-support/paths.js";
import { describeEngineBlockers, inspectComfy, type EngineStatus } from "./availability.js";
import { ComfyClient, ComfyError, collectOutputFiles, type ComfyNodeInfo } from "./client.js";
import { graphClassTypes, graphModelFiles, type BuiltGraph } from "./graphs.js";
import { formatGraphIssues, validateGraph } from "./validate.js";
import {
  DEFAULT_ENGINE_ORDER,
  ENGINES,
  LICENCES,
  NODE_PACKS,
  assertMpsSafeWeights,
  nodePackFor,
  type EngineDefinition,
  type EngineId,
  type EngineMode,
} from "./models.js";

export type EngineChoice = {
  engine: EngineDefinition;
  status: EngineStatus;
  /** True when the caller named the engine; false when it came from the default order. */
  requested: boolean;
};

/**
 * Picks the engine for a mode. A named engine must be ready — it is never silently
 * swapped for another model (spec 15). With no name, the first ready engine in the
 * licence-first default order wins and is announced.
 */
export async function chooseEngine(
  client: ComfyClient,
  mode: EngineMode,
  requested: EngineId | undefined,
): Promise<EngineChoice> {
  const candidates = requested === undefined ? DEFAULT_ENGINE_ORDER[mode] : [requested];
  const engines = candidates.map((id) => ENGINES[id]);

  if (requested !== undefined && !ENGINES[requested].modes.includes(mode)) {
    throw new Error(`${requested} does not support ${mode}; engines that do: ${DEFAULT_ENGINE_ORDER[mode].join(", ")}`);
  }

  const inspection = await inspectComfy(client, engines);
  if (!inspection.reachable) {
    throw new ComfyError(
      "unreachable",
      `ComfyUI not reachable at ${inspection.url} (${inspection.reason}). Start it with \`comfy launch --background\`, or run \`showkick setup comfy\``,
    );
  }

  for (const status of inspection.engines) {
    if (status.available) {
      return { engine: ENGINES[status.engine], status, requested: requested !== undefined };
    }
  }

  const blockers = inspection.engines.map(describeEngineBlockers).join(" | ");
  if (requested !== undefined) {
    throw new Error(`${requested} is not ready in ComfyUI: ${blockers}`);
  }
  throw new Error(`no ComfyUI engine is ready for ${mode}: ${blockers}`);
}

export type RunGraphResult = {
  outputPath: string;
  promptId: string;
  elapsedMs: number;
};

export async function runGraph(
  client: ComfyClient,
  built: BuiltGraph,
  options: { outputPath: string; timeoutMs: number; now?: () => number; warn?: (message: string) => void },
): Promise<RunGraphResult> {
  const now = options.now ?? (() => Date.now());
  const objectInfo = await client.objectInfo();
  assertNodesPresent(built, objectInfo);
  assertMpsSafeWeights(graphModelFiles(built.graph), await serverUsesMps(client));

  // Structural problems (wrong input names, broken links, bad enum values) are bugs:
  // stop before queueing. Unlisted files only warn — the catalog may predate an
  // upload or a download that just finished, and ComfyUI re-checks on submit.
  const validation = validateGraph(built.graph, objectInfo);
  if (validation.errors.length > 0) {
    throw new Error(`workflow does not match this ComfyUI's node schema: ${formatGraphIssues(validation.errors)}`);
  }
  if (validation.missingFiles.length > 0) {
    options.warn?.(`ComfyUI did not list: ${formatGraphIssues(validation.missingFiles)}`);
  }

  const started = now();
  const promptId = await client.queuePrompt(built.graph);
  const history = await client.waitForPrompt(promptId, { timeoutMs: options.timeoutMs });
  const files = collectOutputFiles(history, built.saveNodeId);
  const file = files[0];
  if (file === undefined) {
    throw new ComfyError("missing_output", `ComfyUI finished job ${promptId} but the save node produced no file`, history);
  }

  const bytes = await client.download(file);
  const outputPath = MEDIA_EXTENSIONS.has(extname(options.outputPath).toLowerCase())
    ? options.outputPath
    : `${options.outputPath}${extname(file.filename)}`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);

  return { outputPath, promptId, elapsedMs: now() - started };
}

const MEDIA_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".webm", ".mkv"]);

export function assertNodesPresent(built: BuiltGraph, objectInfo: Record<string, ComfyNodeInfo>): void {
  const missing = graphClassTypes(built.graph).filter((classType) => objectInfo[classType] === undefined);
  if (missing.length === 0) {
    return;
  }

  const fixes = new Set(
    missing.map((classType) => {
      const pack = nodePackFor(classType);
      return pack === undefined ? "install the node pack that provides it, then restart ComfyUI" : NODE_PACKS[pack].fix;
    }),
  );
  throw new Error(`ComfyUI is missing node class ${missing.join(", ")} — fix: ${[...fixes].join("; ")}`);
}

export async function serverUsesMps(client: ComfyClient): Promise<boolean> {
  try {
    const stats = await client.systemStats();
    return (stats.devices ?? []).some((device) => device.type === "mps");
  } catch {
    return process.platform === "darwin";
  }
}

/** First option of a COMBO input, e.g. SeedVR2's device list ("mps" on a Mac, "cuda:0" on NVIDIA). */
export function comboOptions(info: ComfyNodeInfo | undefined, input: string): string[] {
  const spec = info?.input?.required?.[input] ?? info?.input?.optional?.[input];
  if (!Array.isArray(spec)) {
    return [];
  }
  if (Array.isArray(spec[0])) {
    return spec[0].filter((value): value is string => typeof value === "string");
  }
  const options = (spec[1] as { options?: unknown } | undefined)?.options;
  return Array.isArray(options) ? options.filter((value): value is string => typeof value === "string") : [];
}

export function toolRunPath(
  ctx: Pick<ToolContext, "projectRoot">,
  kind: "image" | "video" | "upscale",
  stem: string,
  requested: string | undefined,
): string {
  if (requested !== undefined) {
    return resolveProjectWritePath(requested, ctx.projectRoot);
  }

  return join(ctx.projectRoot, "projects", "_tool_runs", kind, `${stem.replace(/[^a-z0-9-]+/giu, "_")}-${Date.now().toString(36)}`);
}

export function filenamePrefix(engine: EngineId): string {
  return `show-sidekick/${engine.replace(/[^a-z0-9.-]+/giu, "-")}`;
}

export function announceComfyRun(
  ctx: ToolContext,
  input: { tool: string; engine: EngineDefinition; client: ComfyClient; reason: string; sample?: boolean },
): void {
  const policy = ctx.execution;
  announceLocalRun(
    {
      tool: input.tool,
      provider: "comfyui",
      model: input.engine.model,
      engine: input.engine.id,
      reason: policy?.reason ?? input.reason,
      sample_or_batch: policy?.sampleOrBatch ?? (input.sample === true ? "sample" : "batch"),
      endpoint: input.client.baseUrl,
      licence: `${LICENCES[input.engine.licence].label} — ${LICENCES[input.engine.licence].summary}`,
    },
    { mode: policy?.mode, io: policy?.io },
  );
  ctx.logger.event("comfy.announce", { tool: input.tool, engine: input.engine.id, model: input.engine.model });
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export function timeoutMs(seconds: number | undefined, fallbackSeconds: number): number {
  return Math.round((seconds ?? fallbackSeconds) * 1000);
}

export type Dimensions = { width: number; height: number };

/**
 * Resolves width/height from explicit values, a "WxH" size, or an aspect ratio, at
 * about `area` pixels and snapped to `multiple`.
 */
export function resolveDimensions(
  input: { width?: number; height?: number; size?: string; aspect_ratio?: string },
  defaults: { area: number; multiple: number; aspect?: number },
): Dimensions {
  const snap = (value: number) => Math.max(defaults.multiple, Math.round(value / defaults.multiple) * defaults.multiple);

  if (input.width !== undefined && input.height !== undefined) {
    return { width: snap(input.width), height: snap(input.height) };
  }

  const sized = input.size === undefined ? undefined : /^(\d+)\s*[x×]\s*(\d+)$/iu.exec(input.size.trim());
  if (sized !== undefined && sized !== null) {
    return { width: snap(Number(sized[1])), height: snap(Number(sized[2])) };
  }

  const aspect = parseAspect(input.aspect_ratio) ?? defaults.aspect ?? 1;
  if (input.width !== undefined) {
    return { width: snap(input.width), height: snap(input.width / aspect) };
  }
  if (input.height !== undefined) {
    return { width: snap(input.height * aspect), height: snap(input.height) };
  }

  const height = Math.sqrt(defaults.area / aspect);
  return { width: snap(height * aspect), height: snap(height) };
}

export function parseAspect(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const match = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/iu.exec(value.trim());
  if (match === null) {
    return undefined;
  }
  const ratio = Number(match[1]) / Number(match[2]);
  return Number.isFinite(ratio) && ratio > 0 ? ratio : undefined;
}
