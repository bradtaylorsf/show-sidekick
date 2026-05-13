import type { DecisionCategory, DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import type { Finding } from "../artifacts/review.js";
import { currentDecisions } from "./store.js";
import {
  type DecisionAuditCondition,
  type RequiredByStage,
  type StageDecisionRequirements,
  getRequiredByStage,
} from "./required-by-stage.js";

type ScopedRequirement = {
  stage: string;
  category: DecisionCategory;
  scope?: string;
  kind: "category" | "capability" | "provider";
};

type OneOfRequirement = {
  stage: string;
  categories: DecisionCategory[];
};

export type DecisionAuditContext = {
  audioLed?: boolean;
  narrationInScope?: boolean;
  deviatesFromScenePlan?: boolean;
  substituted?: boolean;
  capabilities?: string[];
  providersWithMultipleModels?: string[];
  requirements?: RequiredByStage;
};

export function auditRequiredCategories(stageSlug: string, log: DecisionLog, ctx: DecisionAuditContext = {}): Finding[] {
  const requirements = ctx.requirements ?? getRequiredByStage();
  const currentStage = normalizeStage(stageSlug);
  const stagesToAudit = Object.keys(requirements).filter((stage) => isStageAtOrBefore(stage, currentStage));
  const findings: Finding[] = [];

  for (const stage of stagesToAudit) {
    const stageRequirements = requirements[stage];
    if (stageRequirements === undefined) {
      continue;
    }

    for (const requirement of scopedRequirements(stage, stageRequirements, ctx)) {
      if (!hasDecision(log, requirement.stage, requirement.category, requirement.scope)) {
        findings.push(missingRequiredFinding(currentStage, requirement));
      }
    }

    for (const requirement of oneOfRequirements(stage, stageRequirements, ctx)) {
      if (!requirement.categories.some((category) => hasDecision(log, requirement.stage, category))) {
        findings.push(missingOneOfFinding(currentStage, requirement));
      }
    }
  }

  return findings;
}

export function auditConfidence(log: DecisionLog): Finding[] {
  if (log.length === 0 || log.some((decision) => decision.confidence !== 1)) {
    return [];
  }

  return [
    {
      severity: "suggestion",
      title: "Decision log confidence values are suspiciously uniform",
      location: "decision_log",
      description: "Every decision has confidence=1.0; V-10 treats all-confidence-1.0 as an honesty audit warning.",
      proposed_change: "Use calibrated confidence values that reflect real tradeoffs instead of defaulting every decision to 1.0.",
      status: "pending",
    },
  ];
}

export function auditBoilerplateReason(log: DecisionLog): Finding[] {
  return log.filter(hasBoilerplateReason).map((decision) => ({
    severity: "suggestion",
    title: "Decision reason is boilerplate",
    location: `decision_log.${decision.id}.reason`,
    description: `Decision "${decision.id}" uses reason "${decision.reason}", which is too short and only contains boilerplate decision tokens.`,
    proposed_change: "Replace the reason with the actual tradeoff, constraint, or user preference that drove the choice.",
    status: "pending",
  }));
}

export function auditPresentBothRuntimes(
  log: DecisionLog | undefined,
  availableRuntimes: readonly RenderRuntime[] | undefined,
  motionRequired: boolean | undefined,
): Finding[] {
  if (availableRuntimes === undefined || availableRuntimes.length === 0) {
    return [];
  }

  const runtimeDecision = latestActiveRuntimeDecision(log);
  const available = new Set(availableRuntimes ?? []);

  if (runtimeDecision === undefined) {
    return [
      {
        severity: "critical",
        title: "Runtime selection omitted available options",
        location: "decision_log.render_runtime_selection",
        description: "No active render_runtime_selection decision is present to prove runtime options were presented.",
        proposed_fix:
          "Add a render_runtime_selection decision that lists Remotion, HyperFrames, and ffmpeg according to DEC-4 applicability rules.",
        status: "pending",
      },
    ];
  }

  const options = runtimeOptions(runtimeDecision);
  const findings: Finding[] = [];
  const hasRemotion = options.has("remotion");
  const hasHyperFrames = options.has("hyperframes");

  if (available.has("remotion") && available.has("hyperframes") && (!hasRemotion || !hasHyperFrames)) {
    findings.push(runtimeOptionsFinding(runtimeDecision, "remotion and hyperframes are both available, but the decision did not list both."));
  }

  if (available.has("remotion") && !available.has("hyperframes") && hasRemotion) {
    const rejectedUnavailable = rejectedBecause(runtimeDecision, "hyperframes");
    if (!hasHyperFrames || rejectedUnavailable !== "runtime not available on this machine") {
      findings.push(runtimeOptionsFinding(runtimeDecision, "HyperFrames is unavailable and must be marked as runtime not available on this machine."));
    }
  }

  if (available.has("hyperframes") && !available.has("remotion") && hasHyperFrames) {
    const rejectedUnavailable = rejectedBecause(runtimeDecision, "remotion");
    if (!hasRemotion || rejectedUnavailable !== "runtime not available on this machine") {
      findings.push(runtimeOptionsFinding(runtimeDecision, "Remotion is unavailable and must be marked as runtime not available on this machine."));
    }
  }

  if (motionRequired === false && available.has("ffmpeg") && !options.has("ffmpeg")) {
    findings.push(runtimeOptionsFinding(runtimeDecision, "ffmpeg is available and motion_required=false, so ffmpeg must appear in options_considered."));
  }

  if (motionRequired === true && options.has("ffmpeg")) {
    const rejectedBecause = rejectedBecauseValue(runtimeDecision, "ffmpeg");
    if (rejectedBecause !== "still-image-only; brief requires motion-led delivery.") {
      findings.push(
        runtimeOptionsFinding(
          runtimeDecision,
          'motion_required=true allows ffmpeg only when rejected_because is "still-image-only; brief requires motion-led delivery."',
        ),
      );
    }
  }

  return dedupeRuntimeFindings(findings);
}

function scopedRequirements(
  stage: string,
  requirements: StageDecisionRequirements,
  ctx: DecisionAuditContext,
): ScopedRequirement[] {
  const scoped: ScopedRequirement[] = requirements.required.map((category) => ({ stage, category, kind: "category" }));

  for (const conditional of requirements.conditional) {
    if (conditionMet(conditional.if, ctx)) {
      scoped.push(...(conditional.add ?? []).map((category) => ({ stage, category, kind: "category" }) as ScopedRequirement));
    }
  }

  const capabilities = ctx.capabilities ?? (requirements.required_per_capability.length > 0 ? [undefined] : []);
  for (const category of requirements.required_per_capability) {
    scoped.push(
      ...capabilities.map((capability) => ({
        stage,
        category,
        scope: capability,
        kind: "capability" as const,
      })),
    );
  }

  const providers = ctx.providersWithMultipleModels ?? [];
  for (const category of requirements.required_per_provider) {
    scoped.push(
      ...providers.map((provider) => ({
        stage,
        category,
        scope: provider,
        kind: "provider" as const,
      })),
    );
  }

  return scoped;
}

function oneOfRequirements(
  stage: string,
  requirements: StageDecisionRequirements,
  ctx: DecisionAuditContext,
): OneOfRequirement[] {
  return requirements.conditional.flatMap((conditional) => {
    if (!conditionMet(conditional.if, ctx) || conditional.add_one_of === undefined) {
      return [];
    }

    return [{ stage, categories: conditional.add_one_of }];
  });
}

function missingRequiredFinding(currentStage: string, requirement: ScopedRequirement): Finding {
  const scope = requirement.scope === undefined ? "" : ` for ${requirement.kind} "${requirement.scope}"`;
  const severity = isStageAtOrAfter(currentStage, "edit") ? "critical" : "suggestion";

  return {
    severity,
    title: "Decision log is missing a required category",
    location: `decision_log.${requirement.stage}.${requirement.category}`,
    description: `${requirement.stage} requires ${requirement.category}${scope}, but no matching decision log entry was found.`,
    proposed_fix: `Record a ${requirement.category} decision at ${requirement.stage}${scope} with options_considered, picked, reason, confidence, and user_visible populated.`,
    status: "pending",
  };
}

function missingOneOfFinding(currentStage: string, requirement: OneOfRequirement): Finding {
  const severity = isStageAtOrAfter(currentStage, "edit") ? "critical" : "suggestion";

  return {
    severity,
    title: "Decision log is missing a required fallback or downgrade decision",
    location: `decision_log.${requirement.stage}.${requirement.categories.join("_or_")}`,
    description: `${requirement.stage} requires one of ${requirement.categories.join(", ")}, but no matching decision log entry was found.`,
    proposed_fix: `Record one of ${requirement.categories.join(", ")} at ${requirement.stage} before continuing.`,
    status: "pending",
  };
}

function hasDecision(log: DecisionLog, stage: string, category: DecisionCategory, scope?: string): boolean {
  return log.some((decision) => {
    return decision.category === category && normalizeStage(decision.stage) === stage && decisionMatchesScope(decision, scope);
  });
}

function decisionMatchesScope(decision: DecisionEntry, scope: string | undefined): boolean {
  if (scope === undefined) {
    return true;
  }

  const normalizedScope = normalizeLabel(scope);
  const searchable = [
    decision.id,
    decision.picked,
    decision.reason,
    ...decision.options_considered.flatMap((option) => [option.label, option.rejected_because ?? "", option.notes ?? ""]),
  ]
    .map(normalizeLabel)
    .join(" ");

  return searchable.includes(normalizedScope);
}

function conditionMet(condition: DecisionAuditCondition, ctx: DecisionAuditContext): boolean {
  switch (condition) {
    case "audio_led":
      return ctx.audioLed === true;
    case "narration_in_scope":
      return ctx.narrationInScope === true;
    case "deviates_from_scene_plan":
      return ctx.deviatesFromScenePlan === true;
    case "substituted":
      return ctx.substituted === true;
  }
}

function hasBoilerplateReason(decision: DecisionEntry): boolean {
  if (decision.reason.trim().length >= 30) {
    return false;
  }

  const normalized = normalizeLabel(decision.reason);
  const words = normalized.split(" ").filter((word) => word.length > 0);
  const boilerplateWords = new Set(["best", "option", "good", "choice", "default"]);

  return words.length > 0 && words.every((word) => boilerplateWords.has(word));
}

function latestActiveRuntimeDecision(log: DecisionLog | undefined): DecisionEntry | undefined {
  return currentDecisions(log ?? [])
    .filter((decision) => decision.category === "render_runtime_selection")
    .at(-1);
}

function runtimeOptions(decision: DecisionEntry): Set<RenderRuntime> {
  const options = new Set<RenderRuntime>();
  for (const option of decision.options_considered) {
    const label = normalizeRuntimeLabel(option.label);
    if (isRenderRuntime(label)) {
      options.add(label);
    }
  }

  return options;
}

function rejectedBecause(decision: DecisionEntry, runtime: RenderRuntime): string | undefined {
  const value = rejectedBecauseValue(decision, runtime);
  return value === undefined ? undefined : normalizeLabel(value);
}

function rejectedBecauseValue(decision: DecisionEntry, runtime: RenderRuntime): string | undefined {
  return decision.options_considered.find((option) => normalizeRuntimeLabel(option.label) === runtime)?.rejected_because ?? undefined;
}

function runtimeOptionsFinding(decision: DecisionEntry, reason: string): Finding {
  return {
    severity: "critical",
    title: "Runtime selection omitted available options",
    location: `decision_log.${decision.id}.options_considered`,
    description: reason,
    proposed_fix:
      "Update options_considered so it presents all available runtimes and marks unavailable or inapplicable runtimes with the required rejected_because text.",
    status: "pending",
  };
}

function dedupeRuntimeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = `${finding.location}:${finding.description}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeRuntimeLabel(label: string): string {
  return label.trim().toLowerCase() as RenderRuntime;
}

function isRenderRuntime(value: string): value is RenderRuntime {
  return value === "ffmpeg" || value === "remotion" || value === "hyperframes";
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/gu, " ")
    .replace(/[^\w ;.-]+/gu, "");
}

function isStageAtOrBefore(stageSlug: string, maxStageSlug: string): boolean {
  const order = stageOrder();
  const stageIndex = order.indexOf(normalizeStage(stageSlug));
  const maxStageIndex = order.indexOf(normalizeStage(maxStageSlug));
  if (stageIndex === -1 || maxStageIndex === -1) {
    return stageSlug === maxStageSlug;
  }

  return stageIndex <= maxStageIndex;
}

function isStageAtOrAfter(stageSlug: string, minStageSlug: string): boolean {
  const order = stageOrder();
  const stageIndex = order.indexOf(normalizeStage(stageSlug));
  const minStageIndex = order.indexOf(normalizeStage(minStageSlug));
  if (stageIndex === -1 || minStageIndex === -1) {
    return stageSlug === minStageSlug;
  }

  return stageIndex >= minStageIndex;
}

function stageOrder(): string[] {
  return ["proposal", "script", "cuesheet", "scene_plan", "assets", "edit", "compose", "publish"];
}

function normalizeStage(stageSlug: string): string {
  if (stageSlug === "proposal_packet") {
    return "proposal";
  }
  if (stageSlug === "edit_decisions") {
    return "edit";
  }
  if (stageSlug === "render_report" || stageSlug === "final_review") {
    return "compose";
  }

  return stageSlug;
}
