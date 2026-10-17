import type { Availability } from "../registry/tool.js";
import { ComfyClient, resolveComfyUrl, type ComfyNodeInfo } from "./client.js";
import {
  ENGINES,
  NODE_PACKS,
  enginesForTool,
  type ComfyToolKind,
  type EngineDefinition,
  type EngineId,
  type EngineMode,
  type ModelFile,
  type NodePackId,
  MODEL_FILES,
} from "./models.js";

export type MissingNode = { classType: string; pack: NodePackId };

export type EngineStatus = {
  engine: EngineId;
  label: string;
  available: boolean;
  missingNodes: MissingNode[];
  missingFiles: ModelFile[];
  missingOptionalFiles: ModelFile[];
  presentOptionalFiles: ModelFile[];
  fixes: string[];
};

export type ComfyInspection =
  | { reachable: false; url: string; reason: string }
  | { reachable: true; url: string; version?: string; os?: string; engines: EngineStatus[] };

const CACHE_TTL_MS = 20_000;
let sharedClient: { client: ComfyClient; createdAt: number } | undefined;
let clientOverride: ComfyClient | undefined;

/**
 * One client per process for availability probes, refreshed every 20 s so the
 * four comfy tools probed by `Registry.refreshAvailability` share one
 * /object_info read instead of four.
 */
export function getComfyClient(): ComfyClient {
  if (clientOverride !== undefined) {
    return clientOverride;
  }

  const url = resolveComfyUrl();
  const now = Date.now();
  if (sharedClient === undefined || sharedClient.client.baseUrl !== url || now - sharedClient.createdAt > CACHE_TTL_MS) {
    sharedClient = { client: new ComfyClient({ baseUrl: url }), createdAt: now };
  }

  return sharedClient.client;
}

/** Test seam: pin the client every comfy tool uses (pass undefined to restore). */
export function setComfyClientForTests(client: ComfyClient | undefined): void {
  clientOverride = client;
  sharedClient = undefined;
}

export async function inspectComfy(
  client: ComfyClient,
  engines: EngineDefinition[] = Object.values(ENGINES),
): Promise<ComfyInspection> {
  const reach = await client.isReachable();
  if (!reach.reachable) {
    return { reachable: false, url: client.baseUrl, reason: reach.reason };
  }

  let objectInfo: Record<string, ComfyNodeInfo>;
  try {
    objectInfo = await client.objectInfo();
  } catch (error) {
    return { reachable: false, url: client.baseUrl, reason: `could not read /object_info: ${errorMessage(error)}` };
  }

  const folderListings = await listFolders(client, engines);
  const statuses = engines.map((engine) => engineStatus(engine, objectInfo, folderListings));

  return {
    reachable: true,
    url: client.baseUrl,
    version: reach.stats.system?.comfyui_version,
    os: reach.stats.system?.os,
    engines: statuses,
  };
}

export async function comfyToolAvailability(
  client: ComfyClient,
  tool: ComfyToolKind,
  modes?: EngineMode[],
): Promise<Availability> {
  const engines = enginesForTool(tool).filter((engine) => modes === undefined || engine.modes.some((mode) => modes.includes(mode)));
  const inspection = await inspectComfy(client, engines);

  if (!inspection.reachable) {
    return {
      available: false,
      reason: `ComfyUI not reachable at ${inspection.url} (${inspection.reason}). Start it with \`comfy launch --background\`, or run \`showkick setup comfy\` to install it`,
      fix: "install",
    };
  }

  if (inspection.engines.some((status) => status.available)) {
    return { available: true };
  }

  return {
    available: false,
    reason: `no ${tool} engine is ready in ComfyUI at ${inspection.url}: ${inspection.engines.map(describeEngineBlockers).join(" | ")}`,
    fix: "install",
  };
}

export function describeEngineBlockers(status: EngineStatus): string {
  if (status.available) {
    return `${status.engine}: ready`;
  }

  const parts: string[] = [];
  if (status.missingNodes.length > 0) {
    parts.push(
      `missing node ${status.missingNodes.map((node) => `${node.classType} (${NODE_PACKS[node.pack].label})`).join(", ")}`,
    );
  }
  if (status.missingFiles.length > 0) {
    parts.push(`missing model ${status.missingFiles.map((file) => `${file.folder}/${file.filename}`).join(", ")}`);
  }

  return `${status.engine}: ${parts.join("; ")} — fix: ${status.fixes.join("; ")}`;
}

export function engineStatus(
  engine: EngineDefinition,
  objectInfo: Record<string, ComfyNodeInfo>,
  folderListings: Map<string, Set<string> | undefined>,
): EngineStatus {
  const missingNodes = engine.nodes.filter((node) => objectInfo[node.classType] === undefined);
  const missingFiles = engine.requiredFiles.map((key) => MODEL_FILES[key]).filter((file) => !hasFile(file, folderListings));
  const optional = engine.optionalFiles.map((key) => MODEL_FILES[key]);
  const missingOptionalFiles = optional.filter((file) => !hasFile(file, folderListings));
  const presentOptionalFiles = optional.filter((file) => hasFile(file, folderListings));
  const fixes = [
    ...new Set(missingNodes.map((node) => NODE_PACKS[node.pack].fix)),
    ...(missingFiles.length > 0 ? [`\`showkick setup comfy --engines ${engine.id}\``] : []),
  ];

  return {
    engine: engine.id,
    label: engine.label,
    available: missingNodes.length === 0 && missingFiles.length === 0,
    missingNodes: missingNodes.map((node) => ({ classType: node.classType, pack: node.pack })),
    missingFiles,
    missingOptionalFiles,
    presentOptionalFiles,
    fixes,
  };
}

export function hasFile(file: ModelFile, folderListings: Map<string, Set<string> | undefined>): boolean {
  return file.apiFolders.some((folder) => folderListings.get(folder)?.has(file.filename) === true);
}

async function listFolders(client: ComfyClient, engines: EngineDefinition[]): Promise<Map<string, Set<string> | undefined>> {
  const folders = new Set<string>();
  for (const engine of engines) {
    for (const key of [...engine.requiredFiles, ...engine.optionalFiles]) {
      for (const folder of MODEL_FILES[key].apiFolders) {
        folders.add(folder);
      }
    }
  }

  const listings = new Map<string, Set<string> | undefined>();
  await Promise.all(
    [...folders].map(async (folder) => {
      try {
        const files = await client.listModels(folder);
        listings.set(folder, files === undefined ? undefined : new Set(files));
      } catch {
        listings.set(folder, undefined);
      }
    }),
  );

  return listings;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
