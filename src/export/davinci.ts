import path from "node:path";
import type { Cuesheet, EditDecisions, RenderReport } from "../artifacts/index.js";
import { atomicWrite } from "../checkpoints/io.js";
import { buildFcp7Xml, type LinkedAudioTrack, type LinkedTimelineAsset } from "./fcp7-xml.js";

export type DavinciExporterOptions = {
  packageDir: string;
  projectName: string;
  editDecisions: EditDecisions;
  cuesheet: Cuesheet;
  renderReport: RenderReport;
  assets: LinkedTimelineAsset[];
  audioTracks: LinkedAudioTrack[];
};

export type DavinciExporterResult = {
  timelinePath: string;
  readmePath: string;
};

export async function exportDavinci(options: DavinciExporterOptions): Promise<DavinciExporterResult> {
  const timelinePath = path.join(options.packageDir, "timeline.xml");
  const readmePath = path.join(options.packageDir, "README.md");

  await atomicWrite(timelinePath, buildFcp7Xml(options));
  await atomicWrite(readmePath, davinciReadme(options.projectName));

  return { timelinePath, readmePath };
}

function davinciReadme(projectName: string): string {
  return [
    `# ${projectName} DaVinci Resolve Export`,
    "",
    "Import `timeline.xml` in DaVinci Resolve with File > Import Timeline > Import AAF, EDL, XML.",
    "Keep the `assets/` directory beside the XML unless this package was exported in reference mode.",
    "",
  ].join("\n");
}
