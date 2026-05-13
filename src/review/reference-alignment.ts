import type { CostLog } from "../artifacts/cost-log.js";
import type { DecisionLog } from "../artifacts/decision-log.js";
import type { Finding } from "../artifacts/review.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";

type UnknownRecord = Record<string, unknown>;

export type ReferenceAlignmentContext = {
  brief?: VideoAnalysisBrief;
  costLog?: CostLog;
  approvedProposalAssets?: string[];
  decisionLog?: DecisionLog;
};

const CARBON_COPY_SIMILARITY_THRESHOLD = 0.85;

const PACING_CONTRADICTIONS: Record<string, RegExp[]> = {
  slow_contemplative: [
    /\bfast[-\s]?paced\b/i,
    /\bfast pacing\b/i,
    /\brapid cuts?\b/i,
    /\bquick cuts?\b/i,
    /\bbreakneck\b/i,
    /\bhigh[-\s]?tempo\b/i,
    /\bsnappy pacing\b/i,
  ],
  fast_paced: [/\bslow[-\s]?contemplative\b/i, /\bslow pacing\b/i, /\blanguid\b/i],
  fast_energetic: [/\bslow[-\s]?contemplative\b/i, /\bslow pacing\b/i, /\blanguid\b/i],
};

export function checkReferenceAlignment(
  stageSlug: string,
  artifact: unknown,
  ctx: ReferenceAlignmentContext,
): Finding[] {
  if (ctx.brief === undefined) {
    return [];
  }

  return [
    ...checkPacingClaims(stageSlug, artifact, ctx.brief),
    ...checkCarbonCopy(stageSlug, artifact, ctx.brief),
    ...checkPromisePreservation(stageSlug, artifact, ctx.brief),
    ...checkCostAlignment(ctx.brief, ctx.costLog, ctx.decisionLog),
    ...checkNewAssets(stageSlug, artifact, ctx.approvedProposalAssets),
  ];
}

function checkPacingClaims(stageSlug: string, artifact: unknown, brief: VideoAnalysisBrief): Finding[] {
  const pacingStyle = brief.pacing_style;
  if (pacingStyle === undefined) {
    return [];
  }

  const contradictionPatterns = PACING_CONTRADICTIONS[pacingStyle] ?? [];
  if (contradictionPatterns.length === 0) {
    return [];
  }

  const findings: Finding[] = [];
  visitStrings(artifact, stageSlug, (value, location) => {
    const matchedPattern = contradictionPatterns.find((pattern) => pattern.test(value));
    if (matchedPattern === undefined) {
      return;
    }

    findings.push({
      severity: "critical",
      title: "Reference pacing claim contradicts video analysis brief",
      location,
      description: `The artifact claims pacing that conflicts with video_analysis_brief.pacing_style "${pacingStyle}".`,
      proposed_fix: `Revise ${location} so it preserves the reference pacing_style "${pacingStyle}" instead of using the contradictory pacing claim from review round 1.`,
      status: "pending",
    });
  });

  return findings;
}

function checkCarbonCopy(stageSlug: string, artifact: unknown, brief: VideoAnalysisBrief): Finding[] {
  const referenceTexts = referenceSceneTexts(brief);
  if (referenceTexts.length === 0) {
    return [];
  }

  const findings: Finding[] = [];
  visitStrings(artifact, stageSlug, (value, location) => {
    if (!isProposalConceptLocation(location) || tokenCount(value) < 8) {
      return;
    }

    const copiedReference = referenceTexts.find(
      (referenceText) => normalizedTextSimilarity(value, referenceText.text) >= CARBON_COPY_SIMILARITY_THRESHOLD,
    );
    if (copiedReference === undefined) {
      return;
    }

    findings.push({
      severity: "critical",
      title: "Proposal copies the reference too closely",
      location,
      description: `The proposed text is at least ${CARBON_COPY_SIMILARITY_THRESHOLD} similar to ${copiedReference.label}, which is a carbon-copy risk.`,
      proposed_fix: `Rewrite ${location} with a distinct concept while preserving only the useful reference findings from "${copiedReference.label}" and keeping similarity below 0.85.`,
      status: "pending",
    });
  });

  return findings;
}

function checkPromisePreservation(stageSlug: string, artifact: unknown, brief: VideoAnalysisBrief): Finding[] {
  const promiseElements = brief.promise_elements;
  if (promiseElements.length === 0) {
    return [];
  }

  const artifactText = collectStrings(artifact).join(" ").toLowerCase();
  return promiseElements.flatMap((element, index) => {
    if (artifactText.includes(element.toLowerCase())) {
      return [];
    }

    return [
      {
        severity: "suggestion",
        title: "Reference-loved element is missing",
        location: `${stageSlug}.reference_alignment.promise_elements[${index}]`,
        description: `The artifact does not preserve the user-loved reference element "${element}".`,
        proposed_change: `Add a concrete beat or visual that preserves "${element}" from video_analysis_brief.promise_elements[${index}].`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function checkCostAlignment(
  brief: VideoAnalysisBrief,
  costLog: CostLog | undefined,
  decisionLog: DecisionLog | undefined,
): Finding[] {
  if (brief.approved_budget_usd === undefined || costLog === undefined || costLog.length === 0) {
    return [];
  }

  const cumulativeCost = costLog.reduce((sum, entry) => sum + entry.usd, 0);
  const approvedLimit = brief.approved_budget_usd * 1.3;
  if (cumulativeCost <= approvedLimit || hasBudgetApproval(decisionLog)) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Cumulative cost exceeds approved reference budget",
      location: "cost_log",
      description: `Cumulative cost is $${cumulativeCost.toFixed(2)}, above 1.3x approved_budget_usd $${brief.approved_budget_usd.toFixed(2)} without a budget approval decision.`,
      proposed_fix: `Add a "budget_tradeoff" or "downgrade_approval" decision before spending beyond $${approvedLimit.toFixed(2)}, or reduce cumulative cost to $${approvedLimit.toFixed(2)} or less.`,
      status: "pending",
    },
  ];
}

function checkNewAssets(stageSlug: string, artifact: unknown, approvedProposalAssets: string[] | undefined): Finding[] {
  if (approvedProposalAssets === undefined) {
    return [];
  }

  const approvedAssets = new Set(approvedProposalAssets);
  const assetIds = collectAssetIds(artifact);

  return [...assetIds].flatMap((assetId) => {
    if (approvedAssets.has(assetId)) {
      return [];
    }

    return [
      {
        severity: "suggestion",
        title: "Artifact introduces an unapproved asset",
        location: `${stageSlug}.assets.${assetId}`,
        description: `Asset "${assetId}" is not in the approved proposal asset set.`,
        proposed_change: `Either remove "${assetId}" or add it to the approved proposal assets before production continues.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function hasBudgetApproval(decisionLog: DecisionLog | undefined): boolean {
  return (
    decisionLog?.some((decision) => decision.category === "budget_tradeoff" || decision.category === "downgrade_approval") ??
    false
  );
}

function referenceSceneTexts(brief: VideoAnalysisBrief): { label: string; text: string }[] {
  return brief.scenes.flatMap((scene, index) => {
    const text = [
      ...scene.subject,
      ...scene.subject_motion,
      ...scene.scene,
      ...scene.spatial_framing,
      ...scene.camera,
    ].join(" ");

    if (tokenCount(text) < 8) {
      return [];
    }

    return [
      {
        label: scene.scene_ref ?? `video_analysis_brief.scenes[${index}]`,
        text,
      },
    ];
  });
}

function isProposalConceptLocation(location: string): boolean {
  return (
    location.includes(".concept_options[") ||
    location.endsWith(".treatment") ||
    location.endsWith(".hook") ||
    location.endsWith(".description")
  );
}

function normalizedTextSimilarity(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftBigrams = bigrams(leftTokens);
  const rightBigrams = bigrams(rightTokens);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) {
    return leftTokens[0] === rightTokens[0] ? 1 : 0;
  }

  const overlap = [...leftBigrams].filter((token) => rightBigrams.has(token)).length;
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

function bigrams(tokens: string[]): Set<string> {
  const values = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    values.add(`${tokens[index]} ${tokens[index + 1]}`);
  }

  return values;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function tokenCount(value: string): number {
  return tokenize(value).length;
}

function collectStrings(value: unknown): string[] {
  const strings: string[] = [];
  visitStrings(value, "", (stringValue) => strings.push(stringValue));
  return strings;
}

function visitStrings(value: unknown, path: string, visitor: (value: string, location: string) => void): void {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visitStrings(item, `${path}[${index}]`, visitor);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, childValue]) => {
    visitStrings(childValue, path.length === 0 ? key : `${path}.${key}`, visitor);
  });
}

function collectAssetIds(value: unknown): Set<string> {
  const assetIds = new Set<string>();
  collectAssetIdsFromValue(value, assetIds);
  return assetIds;
}

function collectAssetIdsFromValue(value: unknown, assetIds: Set<string>): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetIdsFromValue(item, assetIds));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const assetId = value.asset_id;
  if (typeof assetId === "string" && assetId.length > 0) {
    assetIds.add(assetId);
  }

  const id = value.id;
  if (typeof id === "string" && isAssetLikeRecord(value)) {
    assetIds.add(id);
  }

  Object.values(value).forEach((childValue) => collectAssetIdsFromValue(childValue, assetIds));
}

function isAssetLikeRecord(value: UnknownRecord): boolean {
  return (
    typeof value.kind === "string" ||
    typeof value.path === "string" ||
    typeof value.prompt === "string" ||
    typeof value.source === "string"
  );
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
