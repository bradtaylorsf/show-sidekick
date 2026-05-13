import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { DecisionLog } from "../artifacts/decision-log.js";
import { ProposalPacketSchema, type ProposalPacket } from "../artifacts/proposal-packet.js";
import type { Finding } from "../artifacts/review.js";
import { loadYaml } from "../config/loader.js";
import { currentDecisions } from "../decisions/store.js";

export const SAMPLE_FIRST_TRIGGERS_PATH = fileURLToPath(
  new URL("../../bundled/sample-first/triggers.yaml", import.meta.url),
);

export const SAMPLE_FIRST_CONDITIONS = ["reference_driven", "motion_required", "hero_scene_present"] as const;

export const SampleFirstConditionSchema = z.enum(SAMPLE_FIRST_CONDITIONS);
export const SampleFirstTriggerSchema = z
  .object({
    mode: z.enum(["always", "threshold", "conditional"]),
    cost_usd: z.number().nonnegative().optional(),
    time_minutes: z.number().nonnegative().optional(),
    conditions: z.array(SampleFirstConditionSchema).optional(),
  })
  .superRefine((trigger, ctx) => {
    if (trigger.mode === "threshold" && trigger.cost_usd === undefined && trigger.time_minutes === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cost_usd"],
        message: "threshold trigger must define cost_usd or time_minutes",
      });
    }

    if (trigger.mode === "conditional" && (trigger.conditions ?? []).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["conditions"],
        message: "conditional trigger must define at least one condition",
      });
    }
  });

export const SampleFirstTriggersSchema = z.record(SampleFirstTriggerSchema);

export type SampleFirstCondition = z.infer<typeof SampleFirstConditionSchema>;
export type SampleFirstTrigger = z.output<typeof SampleFirstTriggerSchema>;
export type SampleFirstTriggers = z.output<typeof SampleFirstTriggersSchema>;

export type SampleFirstContext = {
  pipelineSlug?: string;
  estimatedCostUsd?: number;
  estimatedTimeMinutes?: number;
  referenceDriven?: boolean;
  motionRequired?: boolean;
  heroScenePresent?: boolean;
  decisionLog?: DecisionLog;
  triggers?: SampleFirstTriggers;
};

export type SampleFirstEvaluation = {
  fired: boolean;
  reason?: string;
};

let cachedTriggers: SampleFirstTriggers | undefined;

export async function loadSampleFirstTriggers(filePath: string = SAMPLE_FIRST_TRIGGERS_PATH): Promise<SampleFirstTriggers> {
  const triggers = SampleFirstTriggersSchema.parse(await loadYaml(filePath, z.unknown()));
  if (filePath === SAMPLE_FIRST_TRIGGERS_PATH) {
    cachedTriggers = triggers;
  }

  return triggers;
}

export function getSampleFirstTriggers(filePath: string = SAMPLE_FIRST_TRIGGERS_PATH): SampleFirstTriggers {
  if (filePath === SAMPLE_FIRST_TRIGGERS_PATH && cachedTriggers !== undefined) {
    return cachedTriggers;
  }

  const raw = readFileSync(filePath, "utf8");
  const triggers = SampleFirstTriggersSchema.parse(parseYaml(raw));
  if (filePath === SAMPLE_FIRST_TRIGGERS_PATH) {
    cachedTriggers = triggers;
  }

  return triggers;
}

export function checkSampleFirstProtocol(stageSlug: string, artifact: unknown, ctx: SampleFirstContext = {}): Finding[] {
  if (!isProposalStage(stageSlug) || ctx.pipelineSlug === undefined) {
    return [];
  }

  const parsed = ProposalPacketSchema.safeParse(artifact);
  if (!parsed.success) {
    return [];
  }

  const trigger = (ctx.triggers ?? getSampleFirstTriggers())[ctx.pipelineSlug];
  if (trigger === undefined) {
    return [];
  }

  const evaluation = evaluateSampleFirstTrigger(trigger, parsed.data, ctx);
  if (!evaluation.fired || parsed.data.production_plan.sample_required === true || hasSampleFirstSkipApproval(ctx.decisionLog)) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Sample-first protocol triggered but sample_required not set",
      location: "proposal.production_plan.sample_required",
      description: `Pipeline "${ctx.pipelineSlug}" triggered sample-first because ${evaluation.reason ?? "its trigger fired"}, but production_plan.sample_required is not true.`,
      proposed_fix:
        "Set production_plan.sample_required = true OR record a downgrade_approval decision with reason explaining the user-insists-skip override.",
      status: "pending",
    },
  ];
}

export function evaluateSampleFirstTrigger(
  trigger: SampleFirstTrigger,
  proposal: ProposalPacket,
  ctx: SampleFirstContext,
): SampleFirstEvaluation {
  switch (trigger.mode) {
    case "always":
      return { fired: true, reason: "the pipeline trigger is ALWAYS" };
    case "threshold":
      return evaluateThresholdTrigger(trigger, ctx);
    case "conditional":
      return evaluateConditionalTrigger(trigger, proposal, ctx);
  }
}

function evaluateThresholdTrigger(trigger: SampleFirstTrigger, ctx: SampleFirstContext): SampleFirstEvaluation {
  const reasons: string[] = [];

  if (trigger.cost_usd !== undefined && ctx.estimatedCostUsd !== undefined && ctx.estimatedCostUsd > trigger.cost_usd) {
    reasons.push(`cost > $${trigger.cost_usd.toFixed(2)}`);
  }

  if (
    trigger.time_minutes !== undefined &&
    ctx.estimatedTimeMinutes !== undefined &&
    ctx.estimatedTimeMinutes > trigger.time_minutes
  ) {
    reasons.push(`time > ${trigger.time_minutes} min`);
  }

  return { fired: reasons.length > 0, reason: reasons.join(" OR ") };
}

function evaluateConditionalTrigger(
  trigger: SampleFirstTrigger,
  proposal: ProposalPacket,
  ctx: SampleFirstContext,
): SampleFirstEvaluation {
  const values: Record<SampleFirstCondition, boolean> = {
    reference_driven: ctx.referenceDriven ?? proposal.delivery_promise.reference_driven === true,
    motion_required: ctx.motionRequired ?? proposal.delivery_promise.motion_led,
    hero_scene_present: ctx.heroScenePresent === true,
  };
  const firedConditions = (trigger.conditions ?? []).filter((condition) => values[condition]);

  return {
    fired: firedConditions.length > 0,
    reason: firedConditions.map((condition) => condition.replace(/_/gu, "-")).join(" OR "),
  };
}

function hasSampleFirstSkipApproval(decisionLog: DecisionLog | undefined): boolean {
  return currentDecisions(decisionLog ?? []).some((decision) => {
    return decision.category === "downgrade_approval" && /sample[- ]first|sample skip/iu.test(decision.reason);
  });
}

function isProposalStage(stageSlug: string): boolean {
  return stageSlug === "proposal" || stageSlug === "proposal_packet";
}
