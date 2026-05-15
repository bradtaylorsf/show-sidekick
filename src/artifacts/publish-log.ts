import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "../checkpoints/io.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export const PublishLogOutputSchema = z.object({
  path: z.string(),
  kind: z.string().optional(),
  platform: z.string().optional(),
  notes: z.string().optional(),
});

export const PublishLogSchema = z
  .object({
    outputs: z.array(PublishLogOutputSchema),
    metadata: z.record(z.unknown()).optional(),
    source_manifest_path: z.string().optional(),
    captions_path: z.string().optional(),
    notes: z.array(z.string()).optional(),
  })
  .passthrough();

export type PublishLogOutput = z.infer<typeof PublishLogOutputSchema>;
export type PublishLog = z.infer<typeof PublishLogSchema>;

export function publishLogPath(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "publish_log.json");
}

export async function writePublishLog(
  projectRoot: string,
  show: string,
  episode: string,
  log: PublishLog,
): Promise<string> {
  const parsed = PublishLogSchema.parse(log);
  const filePath = publishLogPath(projectRoot, show, episode);

  await atomicWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);

  return filePath;
}

export async function readPublishLog(projectRoot: string, show: string, episode: string): Promise<PublishLog> {
  return loadJson(publishLogPath(projectRoot, show, episode), PublishLogSchema);
}
