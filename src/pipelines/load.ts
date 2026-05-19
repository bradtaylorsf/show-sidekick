import { existsSync } from "node:fs";
import path from "node:path";
import { ConfigError, type ConfigIssue } from "../config/errors.js";
import { loadYaml } from "../config/loader.js";
import { projectPaths, resolve as resolveProjectResource } from "../paths/project.js";
import { PipelineManifestSchema, type Pipeline } from "./manifest.js";

export async function loadPipeline(projectRoot: string, slug: string): Promise<Pipeline> {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const manifestPath = resolveProjectResource("pipelines", slug, absoluteProjectRoot);

  if (!existsSync(manifestPath)) {
    throwMissingPipeline(absoluteProjectRoot, slug);
  }

  const pipeline = (await loadYaml(manifestPath, PipelineManifestSchema)) as Pipeline;
  validateSuccessCriteriaReferences(pipeline, manifestPath);
  return pipeline;
}

function validateSuccessCriteriaReferences(pipeline: Pipeline, filePath: string): void {
  const stageSlugs = new Set(pipeline.stages.map((stage) => stage.slug));
  const issues: ConfigIssue[] = [];

  pipeline.stages.forEach((stage, stageIndex) => {
    stage.success_criteria.forEach((criterion, criterionIndex) => {
      if (!isRecord(criterion)) {
        return;
      }

      for (const key of Object.keys(criterion)) {
        const stageReference = parseStageReference(key);

        if (stageReference && !stageSlugs.has(stageReference)) {
          issues.push({
            path: `stages.${stageIndex}.success_criteria.${criterionIndex}.${key}`,
            message: `unknown stage '${stageReference}' referenced in success_criteria key '${key}'`,
          });
        }
      }
    });
  });

  if (issues.length > 0) {
    throw new ConfigError({ filePath, issues });
  }
}

// Dotted success_criteria keys are interpreted as <stage>.<field> references.
function parseStageReference(key: string): string | undefined {
  const [stageReference] = key.split(".", 1);

  if (!key.includes(".") || !stageReference) {
    return undefined;
  }

  return /^[a-z][a-z0-9_]*$/u.test(stageReference) ? stageReference : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function throwMissingPipeline(projectRoot: string, slug: string): never {
  const paths = projectPaths(projectRoot);
  const fileName = path.extname(slug) ? slug : `${slug}.yaml`;
  const localPath = path.join(paths.pipelines, fileName);
  const bundledPath = path.join(paths.cache, "pipelines", fileName);

  throw new ConfigError({
    filePath: localPath,
    issues: [
      {
        path: "",
        message: `file not found; searched ${localPath} and ${bundledPath}`,
      },
    ],
  });
}
