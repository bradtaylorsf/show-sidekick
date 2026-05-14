import { existsSync } from "node:fs";
import path from "node:path";
import { loadYaml } from "../config/loader.js";
import { isSafeSegment } from "../paths/project.js";
import { BundledPlaybookSchema, type BundledPlaybook } from "./schema.js";

export async function loadProjectPlaybook(projectRoot: string, name: string): Promise<BundledPlaybook | undefined> {
  assertSafePlaybookName(name);

  const playbookPath = projectPlaybookPath(projectRoot, name);
  if (playbookPath === undefined) {
    return undefined;
  }

  return await loadYaml(playbookPath, BundledPlaybookSchema);
}

function projectPlaybookPath(projectRoot: string, name: string): string | undefined {
  const root = path.resolve(projectRoot);
  const playbooksDir = path.join(root, "playbooks");
  const candidates = path.extname(name) ? [name] : [`${name}.yaml`, `${name}.yml`];

  for (const candidate of candidates) {
    const absolutePath = path.join(playbooksDir, candidate);
    if (existsSync(absolutePath)) {
      return absolutePath;
    }
  }

  return undefined;
}

function assertSafePlaybookName(name: string): void {
  const parsed = path.parse(name);
  const segment = parsed.ext ? parsed.name : name;

  if (!isSafeSegment(segment) || (parsed.ext !== "" && parsed.ext !== ".yaml" && parsed.ext !== ".yml")) {
    throw new Error(`invalid project playbook name '${name}'`);
  }
}
