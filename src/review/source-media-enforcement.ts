import type { SourceMediaReview } from "../artifacts/source-media-review.js";
import type { Finding } from "../artifacts/review.js";

type UnknownRecord = Record<string, unknown>;

export type UserSuppliedMedia = {
  path: string;
};

export type SourceMediaEnforcementContext = {
  sourceMediaReview?: SourceMediaReview;
  userSuppliedMedia?: UserSuppliedMedia[];
};

const SOURCE_MEDIA_REQUIRED_STAGES = new Set(["proposal", "proposal_packet", "script"]);
const INVESTIGATION_TERMS = /\b(interview|dialogue)\b/i;

export function checkSourceMediaEnforcement(
  stageSlug: string,
  _artifact: unknown,
  ctx: SourceMediaEnforcementContext,
): Finding[] {
  const findings: Finding[] = [];
  const userSuppliedMedia = ctx.userSuppliedMedia ?? [];

  if (
    SOURCE_MEDIA_REQUIRED_STAGES.has(stageSlug) &&
    userSuppliedMedia.length > 0 &&
    ctx.sourceMediaReview === undefined
  ) {
    findings.push({
      severity: "critical",
      title: "Source media review is required before planning from user media",
      location: "source_media_review",
      description: `${userSuppliedMedia.length} user-supplied media file(s) exist, but no source_media_review artifact is available for ${stageSlug}.`,
      proposed_fix: `Create source_media_review for ${userSuppliedMedia.length} supplied file(s), including reviewed true, technical_probe, and grounded content_summary before ${stageSlug}.`,
      status: "pending",
    });
    return findings;
  }

  if (ctx.sourceMediaReview === undefined) {
    return findings;
  }

  ctx.sourceMediaReview.files.forEach((file, index) => {
    findings.push(...checkTechnicalProbe(file, index));
    findings.push(...checkSummaryCitations(file, index));
    findings.push(...checkShortInterviewClaim(file, index));
  });

  return findings;
}

function checkTechnicalProbe(file: SourceMediaReview["files"][number], index: number): Finding[] {
  const probe = asRecord(file.technical_probe);
  if (Object.keys(probe).length > 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Source media technical probe is empty",
      location: `source_media_review.files[${index}].technical_probe`,
      description: `Source media file "${file.path}" has no technical_probe fields to ground planning decisions.`,
      proposed_fix: `Populate source_media_review.files[${index}].technical_probe for "${file.path}" with duration_seconds, resolution, codec, or other concrete probe fields.`,
      status: "pending",
    },
  ];
}

function checkSummaryCitations(file: SourceMediaReview["files"][number], index: number): Finding[] {
  const probe = asRecord(file.technical_probe);
  const probeFields = Object.keys(probe);
  if (probeFields.length === 0) {
    return [];
  }

  const summary = file.content_summary.toLowerCase();
  const citesProbeField = probeFields.some((field) => summary.includes(field.toLowerCase()));
  if (citesProbeField) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Source media summary is not grounded in probe fields",
      location: `source_media_review.files[${index}].content_summary`,
      description: `The content_summary for "${file.path}" does not cite any technical_probe field names.`,
      proposed_fix: `Rewrite source_media_review.files[${index}].content_summary to cite at least one probe field such as "${probeFields[0]}" from "${file.path}".`,
      status: "pending",
    },
  ];
}

function checkShortInterviewClaim(file: SourceMediaReview["files"][number], index: number): Finding[] {
  const durationSeconds = numericProbeValue(file.technical_probe, "duration_seconds");
  if (
    durationSeconds === undefined ||
    durationSeconds >= 10 ||
    !INVESTIGATION_TERMS.test(file.content_summary)
  ) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Short source media interview claim needs investigation",
      location: `source_media_review.files[${index}].content_summary`,
      description: `The summary mentions interview/dialogue, but "${file.path}" is only ${durationSeconds}s; treat this as a critical investigation before script assumptions are made.`,
      proposed_fix: `Re-check "${file.path}" manually or with transcription, then replace the interview/dialogue claim for duration_seconds ${durationSeconds} if unsupported.`,
      status: "pending",
    },
  ];
}

function numericProbeValue(probe: Record<string, unknown>, field: string): number | undefined {
  const value = probe[field];
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function asRecord(value: unknown): UnknownRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as UnknownRecord;
  }

  return {};
}
