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

export type ExportArtifactName = "edit_decisions" | "cuesheet" | "asset_manifest" | "render_report";

export type ExportArtifactPaths = Record<ExportArtifactName, string> & {
  deck_manifest?: string;
};

export type ExportArtifacts = {
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  assetManifest: AssetManifest;
  renderReport: RenderReport;
  deckManifest?: DeckManifest;
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
    (["edit_decisions", "cuesheet", "asset_manifest", "render_report"] as const).map(async (artifact) => {
      await assertArtifactExists(artifact, paths[artifact]);
    }),
  );

  const [editDecisions, cuesheet, assetManifest, renderReport, deckManifest] = (await Promise.all([
    loadJson(paths.edit_decisions, EditDecisionsSchema),
    loadJson(paths.cuesheet, CuesheetSchema),
    loadJson(paths.asset_manifest, AssetManifestSchema),
    loadJson(paths.render_report, RenderReportSchema),
    loadOptionalDeckManifest(paths.deck_manifest),
  ])) as [EditDecisions, Cuesheet, AssetManifest, RenderReport, DeckManifest | undefined];

  return {
    editDecisions,
    cuesheet,
    assetManifest,
    renderReport,
    deckManifest,
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
    deck_manifest: path.join(dir, "deck_manifest.json"),
  };
}

async function assertArtifactExists(artifact: ExportArtifactName, filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new MissingArtifactError(artifact, filePath);
  }
}

async function loadOptionalDeckManifest(filePath: string | undefined): Promise<DeckManifest | undefined> {
  if (filePath === undefined) {
    return undefined;
  }

  try {
    await access(filePath);
  } catch {
    return undefined;
  }

  return loadJson(filePath, DeckManifestSchema) as Promise<DeckManifest>;
}
