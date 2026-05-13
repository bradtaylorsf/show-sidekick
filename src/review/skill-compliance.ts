import type { Checkpoint } from "../checkpoints/checkpoint.js";
import type { Finding, FindingSeverity } from "../artifacts/review.js";

export type SkillComplianceContext = {
  getAgentSkills: (toolName: string) => readonly string[] | undefined;
};

const CRITICAL_STAGES = new Set(["edit", "compose", "publish"]);

export function checkSkillCompliance(
  stageSlug: string,
  checkpoint: Checkpoint,
  ctx: SkillComplianceContext,
): Finding[] {
  const severity = severityForStage(stageSlug);
  if (severity === undefined) {
    return [];
  }

  const skillsRead = normalizedSkillsRead(checkpoint.skills_read ?? []);
  const firstInvocationIndexByTool = new Map<string, number>();
  checkpoint.tool_invocations.forEach((invocation, index) => {
    if (!firstInvocationIndexByTool.has(invocation.tool)) {
      firstInvocationIndexByTool.set(invocation.tool, index);
    }
  });

  return [...firstInvocationIndexByTool.entries()].flatMap(([toolName, invocationIndex]) => {
    const requiredSkills = ctx.getAgentSkills(toolName) ?? [];
    if (requiredSkills.length === 0) {
      return [];
    }

    return requiredSkills.flatMap((skill) => {
      if (skillsRead.has(skill) || skillsRead.has(skillSlug(skill))) {
        return [];
      }

      return [missingSkillFinding(stageSlug, severity, toolName, skill, invocationIndex)];
    });
  });
}

function missingSkillFinding(
  stageSlug: string,
  severity: FindingSeverity,
  toolName: string,
  skill: string,
  invocationIndex: number,
): Finding {
  const location = `checkpoint.tool_invocations[${invocationIndex}]`;
  const description = `Tool "${toolName}" requires Layer 3 skill "${skill}", but checkpoint.skills_read does not include it at ${stageSlug}.`;

  if (severity === "critical") {
    return {
      severity,
      title: "Layer 3 skill not read before generation",
      location,
      description,
      proposed_fix: `Read "skills/agents/${skillSlug(skill)}.md" before re-running tool "${toolName}" from ${location}.`,
      status: "pending",
    };
  }

  return {
    severity,
    title: "Layer 3 skill not read before generation",
    location,
    description,
    proposed_change: `Read "skills/agents/${skillSlug(skill)}.md" before the next generation call to "${toolName}".`,
    status: "pending",
  };
}

function severityForStage(stageSlug: string): Extract<FindingSeverity, "critical" | "suggestion"> | undefined {
  const stage = normalizeStage(stageSlug);
  if (stage === "assets") {
    return "suggestion";
  }

  if (CRITICAL_STAGES.has(stage)) {
    return "critical";
  }

  return undefined;
}

function normalizedSkillsRead(skillsRead: string[]): Set<string> {
  const normalized = new Set<string>();
  skillsRead.forEach((skill) => {
    normalized.add(skill);
    normalized.add(skillSlug(skill));
  });

  return normalized;
}

function skillSlug(skill: string): string {
  const lastPathPart = skill.split("/").at(-1) ?? skill;
  return lastPathPart.replace(/\.md$/i, "");
}

function normalizeStage(stageSlug: string): string {
  if (stageSlug === "asset") {
    return "assets";
  }
  if (stageSlug === "edit_decisions") {
    return "edit";
  }
  if (stageSlug === "render_report") {
    return "compose";
  }

  return stageSlug;
}
