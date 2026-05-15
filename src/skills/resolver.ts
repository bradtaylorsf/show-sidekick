import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedShow } from "../shows/load.js";

export type SkillKind = "director" | "meta" | "agent";
export type SkillTier = "show" | "project" | "bundled-pipeline" | "bundled-shared" | "bundled";

export type ResolveSkillContext = {
  projectRoot: string;
  show?: LoadedShow;
  pipeline?: string;
};

export type ResolvedSkill = {
  path: string;
  content: string;
  tier: SkillTier;
};

type SkillCandidate = {
  path: string;
  tier: SkillTier;
};

const PIPELINE_SLUG_DIRECTORIES: Record<string, string> = {
  "animated-explainer": "explainer",
};

// Process-lifetime cache; long-running runners need explicit invalidation before supporting live skill edits.
const contentCache = new Map<string, string>();

export class SkillNotFoundError extends Error {
  readonly searched: string[];

  constructor(kind: SkillKind, name: string, searched: string[]) {
    super(`skill '${name}' (${kind}) not found; searched:\n${searched.map((candidate) => `- ${candidate}`).join("\n")}`);
    this.name = "SkillNotFoundError";
    this.searched = searched;
  }
}

export async function resolveSkill(
  kind: SkillKind,
  name: string,
  ctx: ResolveSkillContext,
): Promise<ResolvedSkill> {
  assertSafeName(name);

  const candidates = skillCandidates(kind, name, ctx);

  for (const candidate of candidates) {
    if (existsSync(candidate.path)) {
      return {
        path: candidate.path,
        content: await cachedRead(candidate.path),
        tier: candidate.tier,
      };
    }
  }

  throw new SkillNotFoundError(
    kind,
    name,
    candidates.map((candidate) => candidate.path),
  );
}

function skillCandidates(kind: SkillKind, name: string, ctx: ResolveSkillContext): SkillCandidate[] {
  const projectRoot = path.resolve(ctx.projectRoot);

  if (kind === "director") {
    if (!ctx.pipeline) {
      throw new Error("pipeline is required to resolve director skills");
    }

    const fileName = `${name}-director.md`;
    const pipelineDirectory = pipelineSkillDirectory(ctx.pipeline);
    return [
      ...(ctx.show?.skillsDir ? [{ path: path.join(ctx.show.skillsDir, fileName), tier: "show" as const }] : []),
      {
        path: path.join(projectRoot, "skills", "pipelines", pipelineDirectory, fileName),
        tier: "project",
      },
      {
        path: path.join(projectRoot, ".predit", "skills", "pipelines", pipelineDirectory, fileName),
        tier: "bundled-pipeline",
      },
      {
        path: path.join(projectRoot, ".predit", "skills", "pipelines", "_shared", fileName),
        tier: "bundled-shared",
      },
    ];
  }

  const directoryName = kind === "meta" ? "meta" : "agents";
  const fileName = `${name}.md`;
  return [
    ...(ctx.show?.skillsDir ? [{ path: path.join(ctx.show.skillsDir, fileName), tier: "show" as const }] : []),
    {
      path: path.join(projectRoot, "skills", directoryName, fileName),
      tier: "project",
    },
    {
      path: path.join(projectRoot, ".predit", "skills", directoryName, fileName),
      tier: "bundled",
    },
  ];
}

function pipelineSkillDirectory(pipeline: string): string {
  return PIPELINE_SLUG_DIRECTORIES[pipeline] ?? pipeline;
}

async function cachedRead(filePath: string): Promise<string> {
  const absolutePath = path.resolve(filePath);
  const cached = contentCache.get(absolutePath);

  if (cached !== undefined) {
    return cached;
  }

  const content = await readFile(absolutePath, "utf8");
  contentCache.set(absolutePath, content);
  return content;
}

function assertSafeName(name: string): void {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error(`invalid skill name '${name}'`);
  }
}
