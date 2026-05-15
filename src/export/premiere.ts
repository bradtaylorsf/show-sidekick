import path from "node:path";
import { buildFcp7Xml, type LinkedAudioTrack, type LinkedTimelineAsset } from "./fcp7-xml.js";
import { atomicWrite } from "../checkpoints/io.js";
import type { Cuesheet, EditDecisions, RenderReport } from "../artifacts/index.js";

export type XmlExporterOptions = {
  packageDir: string;
  projectName: string;
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  renderReport: RenderReport;
  assets: LinkedTimelineAsset[];
  audioTracks: LinkedAudioTrack[];
};

export type XmlExporterResult = {
  timelinePath: string;
  readmePath: string;
};

export async function exportPremiere(options: XmlExporterOptions): Promise<XmlExporterResult> {
  const timelinePath = path.join(options.packageDir, "timeline.xml");
  const readmePath = path.join(options.packageDir, "README.md");

  await atomicWrite(timelinePath, buildFcp7Xml(options));
  await atomicWrite(readmePath, premiereReadme(options.projectName));

  return { timelinePath, readmePath };
}

function premiereReadme(projectName: string): string {
  return [
    `# ${projectName} Premiere Export`,
    "",
    "Import `timeline.xml` in Adobe Premiere Pro with File > Import.",
    "Keep the `assets/` directory beside the XML unless this package was exported in reference mode.",
    "",
  ].join("\n");
}
