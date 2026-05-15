import { access } from "node:fs/promises";
import path from "node:path";
import {
  AssetManifestSchema,
  CuesheetSchema,
  EditDecisionsSchema,
  RenderReportSchema,
  type AssetManifest,
  type Cuesheet,
  type EditDecisions,
  type RenderReport,
} from "../artifacts/index.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export type ExportArtifactName = "edit_decisions" | "cuesheet" | "asset_manifest" | "render_report";

export type ExportArtifactPaths = Record<ExportArtifactName, string>;

export type ExportArtifacts = {
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  assetManifest: AssetManifest;
  renderReport: RenderReport;
  paths: ExportArtifactPaths;
};

export class MissingArtifactError extends Error {
  readonly artifact: ExportArtifactName;
  readonly filePath: string;

  constructor(artifact: ExportArtifactName, filePath: string) {
    super(`missing required export artifact '${artifact}' at ${filePath}`);
    this.name = "MissingArtifactError";
    this.artifact = artifact;
    this.filePath = filePath;
  }
}

export async function loadExportArtifacts(projectRoot: string, show: string, episode: string): Promise<ExportArtifacts> {
  const paths = exportArtifactPaths(projectRoot, show, episode);

  await Promise.all(
    Object.entries(paths).map(async ([artifact, filePath]) => {
      await assertArtifactExists(artifact as ExportArtifactName, filePath);
    }),
  );

  const [editDecisions, cuesheet, assetManifest, renderReport] = (await Promise.all([
    loadJson(paths.edit_decisions, EditDecisionsSchema),
    loadJson(paths.cuesheet, CuesheetSchema),
    loadJson(paths.asset_manifest, AssetManifestSchema),
    loadJson(paths.render_report, RenderReportSchema),
  ])) as [EditDecisions, Cuesheet, AssetManifest, RenderReport];

  return {
    editDecisions,
    cuesheet,
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
    asset_manifest: path.join(dir, "asset_manifest.json"),
    render_report: path.join(dir, "render_report.json"),
  };
}

async function assertArtifactExists(artifact: ExportArtifactName, filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new MissingArtifactError(artifact, filePath);
  }
}
