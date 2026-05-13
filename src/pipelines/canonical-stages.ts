export const CANONICAL_STAGES = [
  "research",
  "idea",
  "proposal",
  "script",
  "capture",
  "cuesheet",
  "character_design",
  "rig_plan",
  "scene_plan",
  "assets",
  "edit",
  "compose",
  "publish",
] as const;

export type CanonicalStage = (typeof CANONICAL_STAGES)[number];

export function canonicalIndex(slug: string): number {
  return CANONICAL_STAGES.findIndex((stage) => stage === slug);
}
