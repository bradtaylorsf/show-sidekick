import type { Cut } from "../artifacts/edit-decisions.js";
import type { Finding } from "../artifacts/review.js";

export type CompositionInput = {
  cuts: Cut[];
};

type IndexedCut = Cut & {
  originalIndex: number;
};

const TIMING_EPSILON_S = 0.05;

export function validateComposition(editDecisions: CompositionInput, plannedDurationS: number): Finding[] {
  if (editDecisions.cuts.length === 0) {
    return [
      {
        severity: "critical",
        title: "Composition has no cuts",
        location: "edit_decisions.cuts",
        description: `No cuts are present, so the planned ${plannedDurationS}s duration cannot be covered.`,
        proposed_fix: `Add cuts covering 0s through ${plannedDurationS}s before compose validation round 1, starting with a cut at start_s 0.`,
        patch: {
          artifact_path: "cuts",
          new_value: [],
        },
        status: "pending",
      },
    ];
  }

  const cuts = editDecisions.cuts
    .map((cut, originalIndex) => ({ ...cut, originalIndex }))
    .sort((left, right) => left.start_s - right.start_s);

  return [
    ...checkLeadingGap(cuts[0]),
    ...checkAdjacentCoverage(cuts),
    ...checkPlannedDurationCoverage(cuts[cuts.length - 1], plannedDurationS),
  ];
}

function checkLeadingGap(firstCut: IndexedCut | undefined): Finding[] {
  if (firstCut === undefined || firstCut.start_s <= TIMING_EPSILON_S) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Composition has a leading gap",
      location: `edit_decisions.cuts[${firstCut.originalIndex}].start_s`,
      description: `First cut starts at ${firstCut.start_s}s, leaving the rendered output uncovered from 0s.`,
      proposed_fix: `Set edit_decisions.cuts[${firstCut.originalIndex}].start_s to 0 so cuts cover the timeline from 0s with no leading gap.`,
      patch: {
        artifact_path: `cuts[${firstCut.originalIndex}].start_s`,
        new_value: 0,
      },
      status: "pending",
    },
  ];
}

function checkAdjacentCoverage(cuts: IndexedCut[]): Finding[] {
  const findings: Finding[] = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const current = cuts[index];
    const next = cuts[index + 1];
    if (current === undefined || next === undefined) {
      continue;
    }

    const gapS = next.start_s - current.end_s;
    if (gapS > TIMING_EPSILON_S) {
      findings.push({
        severity: "critical",
        title: "Composition has a gap between cuts",
        location: `edit_decisions.cuts[${current.originalIndex}].end_s`,
        description: `Cut ${current.originalIndex} ends at ${current.end_s}s and cut ${next.originalIndex} starts at ${next.start_s}s, leaving a ${gapS.toFixed(2)}s gap.`,
        proposed_fix: `Extend cuts[${current.originalIndex}].end_s to ${next.start_s}s or move cuts[${next.originalIndex}].start_s to ${current.end_s}s so the gap is 0s.`,
        patch: {
          artifact_path: `cuts[${current.originalIndex}].end_s`,
          new_value: next.start_s,
        },
        status: "pending",
      });
    }

    const overlapS = current.end_s - next.start_s;
    if (overlapS > TIMING_EPSILON_S) {
      findings.push({
        severity: "suggestion",
        title: "Composition has overlapping cuts",
        location: `edit_decisions.cuts[${current.originalIndex}].end_s`,
        description: `Cut ${current.originalIndex} overlaps cut ${next.originalIndex} by ${overlapS.toFixed(2)}s.`,
        proposed_change: `Trim cuts[${current.originalIndex}].end_s to ${next.start_s}s if the overlap is not an intentional transition.`,
        status: "pending",
      });
    }
  }

  return findings;
}

function checkPlannedDurationCoverage(lastCut: IndexedCut | undefined, plannedDurationS: number): Finding[] {
  if (lastCut === undefined || lastCut.end_s >= plannedDurationS - TIMING_EPSILON_S) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Composition does not cover full planned duration",
      location: `edit_decisions.cuts[${lastCut.originalIndex}].end_s`,
      description: `Last cut ends at ${lastCut.end_s}s, before planned duration ${plannedDurationS}s.`,
      proposed_fix: `Extend cuts[${lastCut.originalIndex}].end_s to ${plannedDurationS}s or add another cut ending at ${plannedDurationS}s before compose.`,
      patch: {
        artifact_path: `cuts[${lastCut.originalIndex}].end_s`,
        new_value: plannedDurationS,
      },
      status: "pending",
    },
  ];
}
