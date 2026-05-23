import { access } from "node:fs/promises";
import path from "node:path";
import {
  AssetManifestSchema,
  CuesheetSchema,
  DeckManifestSchema,
  EditDecisionsSchema,
  RenderReportSchema,
  type AssetManifest,
  type Cuesheet,
  type DeckManifest,
  type EditDecisions,
  type RenderReport,
} from "../artifacts/index.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export type ExportArtifactName = "edit_decisions" | "cuesheet" | "asset_manifest" | "render_report" | "deck_manifest";
type RequiredExportArtifactName = Exclude<ExportArtifactName, "deck_manifest">;

export type ExportArtifactPaths = Record<ExportArtifactName, string>;

export type ExportArtifacts = {
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  deckManifest?: DeckManifest;
  assetManifest: AssetManifest;
  renderReport: RenderReport;
  paths: ExportArtifactPaths;
};

export class MissingArtifactError extends Error {
  readonly artifact: RequiredExportArtifactName;
  readonly filePath: string;

  constructor(artifact: RequiredExportArtifactName, filePath: string) {
    super(`missing required export artifact '${artifact}' at ${filePath}`);
    this.name = "MissingArtifactError";
    this.artifact = artifact;
    this.filePath = filePath;
  }
}

export async function loadExportArtifacts(projectRoot: string, show: string, episode: string): Promise<ExportArtifacts> {
  const paths = exportArtifactPaths(projectRoot, show, episode);

  const requiredArtifacts: RequiredExportArtifactName[] = ["edit_decisions", "cuesheet", "asset_manifest", "render_report"];
  await Promise.all(requiredArtifacts.map(async (artifact) => assertArtifactExists(artifact, paths[artifact])));

  const [editDecisions, cuesheet, assetManifest, renderReport] = (await Promise.all([
    loadJson(paths.edit_decisions, EditDecisionsSchema),
    loadJson(paths.cuesheet, CuesheetSchema),
    loadJson(paths.asset_manifest, AssetManifestSchema),
    loadJson(paths.render_report, RenderReportSchema),
  ])) as [EditDecisions, Cuesheet, AssetManifest, RenderReport];
  const deckManifest = (await optionalArtifactExists(paths.deck_manifest))
    ? await loadJson(paths.deck_manifest, DeckManifestSchema)
    : undefined;

  return {
    editDecisions,
    cuesheet,
    deckManifest,
    assetManifest,
    renderReport,
    paths,
  };
}

export function exportArtifactPaths(projectRoot: string, show: string, episode: string): ExportArtifactPaths {
  const dir = projectDir(projectRoot, show, episode);

  return {
    edit_decisions: path.join(dir, "edit_decisions.json"),
    cuesheet: path.join(dir, "cuesheet.json"),
    deck_manifest: path.join(dir, "deck_manifest.json"),
    asset_manifest: path.join(dir, "asset_manifest.json"),
    render_report: path.join(dir, "render_report.json"),
  };
}

async function assertArtifactExists(artifact: RequiredExportArtifactName, filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new MissingArtifactError(artifact, filePath);
  }
}

async function optionalArtifactExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
