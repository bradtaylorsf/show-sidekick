import type { Finding } from "../artifacts/review.js";

export type SpecificityFailureReason =
  | "missing_proposed_fix"
  | "proposed_fix_too_short"
  | "proposed_fix_lacks_specific_token";

export type SpecificityResult =
  | { ok: true; reason?: undefined }
  | { ok: false; reason: SpecificityFailureReason };

export type CHAIEnforcementEvent = {
  type: "proposed_fix_below_specificity_bar";
  location: string;
  title: string;
  reason: SpecificityFailureReason;
};

const MIN_PROPOSED_FIX_LENGTH = 40;
const NUMBER_TOKEN_PATTERN = /\d/;
const ALLCAPS_IDENTIFIER_PATTERN = /[A-Z_]{2,}/;
const QUOTED_STRING_PATTERN = /"[^"]+"/;
const FILE_PATH_PATTERN = /[\w/.-]+\.[\w]+/;

export function evaluateSpecificity(finding: Pick<Finding, "patch" | "proposed_fix">): SpecificityResult {
  if (finding.patch !== undefined) {
    return { ok: true };
  }

  const proposedFix = finding.proposed_fix;
  if (proposedFix === undefined || proposedFix.trim().length === 0) {
    return { ok: false, reason: "missing_proposed_fix" };
  }

  if (proposedFix.length < MIN_PROPOSED_FIX_LENGTH) {
    return { ok: false, reason: "proposed_fix_too_short" };
  }

  if (!hasSpecificToken(proposedFix)) {
    return { ok: false, reason: "proposed_fix_lacks_specific_token" };
  }

  return { ok: true };
}

export function enforceCHAI(findings: Finding[]): { findings: Finding[]; events: CHAIEnforcementEvent[] } {
  const events: CHAIEnforcementEvent[] = [];

  const enforcedFindings = findings.map((finding) => {
    if (finding.severity !== "critical") {
      return finding;
    }

    const specificity = evaluateSpecificity(finding);
    if (specificity.ok) {
      return finding;
    }

    events.push({
      type: "proposed_fix_below_specificity_bar",
      location: finding.location,
      title: finding.title,
      reason: specificity.reason,
    });

    return {
      ...finding,
      severity: "investigation" as const,
      description: finding.description,
    };
  });

  return { findings: enforcedFindings, events };
}

function hasSpecificToken(text: string): boolean {
  return (
    NUMBER_TOKEN_PATTERN.test(text) ||
    ALLCAPS_IDENTIFIER_PATTERN.test(text) ||
    QUOTED_STRING_PATTERN.test(text) ||
    FILE_PATH_PATTERN.test(text)
  );
}
