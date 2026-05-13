import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { DecisionCategorySchema } from "../artifacts/decision-log.js";
import { loadYaml } from "../config/loader.js";

export const REQUIRED_BY_STAGE_PATH = fileURLToPath(
  new URL("../../bundled/decision-log/required-by-stage.yaml", import.meta.url),
);

export const DECISION_AUDIT_CONDITIONS = [
  "audio_led",
  "narration_in_scope",
  "deviates_from_scene_plan",
  "substituted",
] as const;

export const DecisionAuditConditionSchema = z.enum(DECISION_AUDIT_CONDITIONS);

export const ConditionalRequirementSchema = z
  .object({
    if: DecisionAuditConditionSchema,
    add: z.array(DecisionCategorySchema).optional(),
    add_one_of: z.array(DecisionCategorySchema).optional(),
  })
  .refine((value) => value.add !== undefined || value.add_one_of !== undefined, {
    message: "conditional requirement must define add or add_one_of",
  });

export const StageDecisionRequirementsSchema = z.object({
  required: z.array(DecisionCategorySchema).default([]),
  conditional: z.array(ConditionalRequirementSchema).default([]),
  required_per_capability: z.array(DecisionCategorySchema).default([]),
  required_per_provider: z.array(DecisionCategorySchema).default([]),
});

export const RequiredByStageSchema = z.record(StageDecisionRequirementsSchema);

export type DecisionAuditCondition = z.infer<typeof DecisionAuditConditionSchema>;
export type ConditionalRequirement = z.output<typeof ConditionalRequirementSchema>;
export type StageDecisionRequirements = z.output<typeof StageDecisionRequirementsSchema>;
export type RequiredByStage = z.output<typeof RequiredByStageSchema>;

let cachedRequirements: RequiredByStage | undefined;

export async function loadRequiredByStage(filePath: string = REQUIRED_BY_STAGE_PATH): Promise<RequiredByStage> {
  const requirements = RequiredByStageSchema.parse(await loadYaml(filePath, z.unknown()));
  if (filePath === REQUIRED_BY_STAGE_PATH) {
    cachedRequirements = requirements;
  }

  return requirements;
}

export function getRequiredByStage(filePath: string = REQUIRED_BY_STAGE_PATH): RequiredByStage {
  if (filePath === REQUIRED_BY_STAGE_PATH && cachedRequirements !== undefined) {
    return cachedRequirements;
  }

  const raw = readFileSync(filePath, "utf8");
  const requirements = RequiredByStageSchema.parse(parseYaml(raw));
  if (filePath === REQUIRED_BY_STAGE_PATH) {
    cachedRequirements = requirements;
  }

  return requirements;
}
