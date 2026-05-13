import path from "node:path";
import { projectDir } from "../checkpoints/paths.js";

export function costLogFile(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "cost_log.json");
}
