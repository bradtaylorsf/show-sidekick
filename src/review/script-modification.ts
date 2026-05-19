import type { Finding } from "../artifacts/review.js";
import type { ReviewContext } from "./runner.js";

type Match = {
  location: string;
  reference: string;
};

const BUNDLED_TOOL_PATH_PATTERN = /(?:^|[\s"'`(])((?:src\/tools\/|\.show-sidekick\/tools\/)[^\s"'`)]+)/iu;
const MODIFY_PATTERN = /\b(modif(?:y|ies|ied|ication)|edit(?:s|ed|ing)?|patch(?:es|ed|ing)?|update(?:s|d|ing)?|replace(?:s|d|ing)?|overwrite(?:s|n|ing)?)\b/iu;
const WRAPPER_PATTERN = /\b(wrapper|wrap|adapter|facade|shim)\b/iu;

export function checkScriptModification(stageSlug: string, artifact: unknown, ctx: ReviewContext): Finding[] {
  const matches = findModificationTargets(artifact, "$", bundledToolNames(ctx));

  if (matches.length === 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Script modifies existing tool; must create a wrapper",
      location: `${stageSlug}:${matches[0]?.location ?? "$"}`,
      description: `Artifact targets an existing bundled tool for modification (${matches
        .map((match) => match.reference)
        .join(", ")}). MET-11 extensions must create project-scoped wrappers instead of changing bundled tools.`,
      proposed_fix:
        "Create a MET_11 wrapper at projects/show/episode/tools/custom-wrapper.ts or projects/show/episode/scripts/custom-wrapper.ts and register it before use.",
      status: "pending",
    },
  ];
}

function findModificationTargets(artifact: unknown, location: string, toolNames: Set<string>): Match[] {
  if (typeof artifact === "string") {
    return matchString(artifact, location, toolNames);
  }

  if (Array.isArray(artifact)) {
    return artifact.flatMap((item, index) => findModificationTargets(item, `${location}[${index}]`, toolNames));
  }

  if (!isRecord(artifact)) {
    return [];
  }

  return Object.entries(artifact).flatMap(([key, value]) => findModificationTargets(value, `${location}.${key}`, toolNames));
}

function matchString(value: string, location: string, toolNames: Set<string>): Match[] {
  const pathMatch = BUNDLED_TOOL_PATH_PATTERN.exec(value);
  if (pathMatch?.[1] !== undefined) {
    return [{ location, reference: pathMatch[1] }];
  }

  if (!MODIFY_PATTERN.test(value) || WRAPPER_PATTERN.test(value)) {
    return [];
  }

  for (const toolName of toolNames) {
    const toolPattern = new RegExp(`\\b${escapeRegExp(toolName)}\\b`, "iu");
    if (toolPattern.test(value)) {
      return [{ location, reference: toolName }];
    }
  }

  return [];
}

function bundledToolNames(ctx: ReviewContext): Set<string> {
  const names = new Set<string>();

  for (const stage of ctx.pipeline.stages) {
    for (const toolName of [
      ...(stage.tools_available ?? []),
      ...(stage.required_tools ?? []),
      ...(stage.optional_tools ?? []),
    ]) {
      names.add(toolName);
    }
  }

  return names;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
