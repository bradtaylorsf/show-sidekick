import type { DecisionLog } from "../artifacts/decision-log.js";
import { DecisionCategorySchema } from "../artifacts/decision-log.js";
import type { Finding } from "../artifacts/review.js";
import type { MasterClock } from "../pipelines/manifest.js";

export { DecisionCategorySchema };
export type { DecisionLog } from "../artifacts/decision-log.js";
export type { MasterClock } from "../pipelines/manifest.js";

export type ReviewFinding = Finding;

export function reviewProposalForMusicSource({
  manifest,
  decisions,
}: {
  manifest: { master_clock?: MasterClock };
  decisions: DecisionLog;
}): ReviewFinding[] {
  if (manifest.master_clock === "none" || hasActiveMusicSource(decisions)) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Missing music_source decision for audio-led pipeline",
      location: "decisions.music_source",
      description:
        "The proposal is for a pipeline whose master_clock is not 'none', but the active decision log does not include a music_source entry.",
      proposed_fix:
        "Use bundled/skills/meta/music-plan.md during proposal, compare at least two music source options, and record the picked source as a music_source decision before scene planning.",
      status: "pending",
    },
  ];
}

function hasActiveMusicSource(decisions: DecisionLog): boolean {
  const supersededIds = new Set(decisions.map((decision) => decision.supersedes).filter((id): id is string => id !== null));

  return decisions.some((decision) => {
    return decision.category === DecisionCategorySchema.enum.music_source && !supersededIds.has(decision.id);
  });
}
