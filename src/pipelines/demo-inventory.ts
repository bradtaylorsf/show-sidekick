export const DEMO_READINESS_CLASSIFICATIONS = [
  "core_default",
  "seeded_extension",
  "test_only",
  "show_starter_only",
] as const;

export type DemoReadinessClassification = (typeof DEMO_READINESS_CLASSIFICATIONS)[number];

export type DemoReadinessInventoryEntry = {
  classification: DemoReadinessClassification;
  defaultStarterTarget: boolean;
};

export const DEMO_READINESS_INVENTORY = {
  "animated-explainer": { classification: "core_default", defaultStarterTarget: true },
  animation: { classification: "seeded_extension", defaultStarterTarget: true },
  "avatar-spokesperson": { classification: "seeded_extension", defaultStarterTarget: true },
  "character-animation": { classification: "seeded_extension", defaultStarterTarget: true },
  cinematic: { classification: "core_default", defaultStarterTarget: true },
  "clip-factory": { classification: "seeded_extension", defaultStarterTarget: true },
  "daily-news": { classification: "seeded_extension", defaultStarterTarget: true },
  "documentary-montage": { classification: "core_default", defaultStarterTarget: true },
  "framework-smoke": { classification: "test_only", defaultStarterTarget: false },
  hybrid: { classification: "seeded_extension", defaultStarterTarget: true },
  "localization-dub": { classification: "seeded_extension", defaultStarterTarget: true },
  "music-video": { classification: "core_default", defaultStarterTarget: true },
  "news-song": { classification: "core_default", defaultStarterTarget: true },
  "podcast-repurpose": { classification: "seeded_extension", defaultStarterTarget: true },
  "screen-demo": { classification: "core_default", defaultStarterTarget: true },
  "talking-head": { classification: "seeded_extension", defaultStarterTarget: true },
} as const satisfies Record<string, DemoReadinessInventoryEntry>;

export type DemoReadinessSlug = keyof typeof DEMO_READINESS_INVENTORY;

export const APPROVED_BUNDLED_PIPELINE_SLUGS = [
  "animated-explainer",
  "animation",
  "avatar-spokesperson",
  "character-animation",
  "cinematic",
  "clip-factory",
  "daily-news",
  "documentary-montage",
  "hybrid",
  "localization-dub",
  "music-video",
  "news-song",
  "podcast-repurpose",
  "screen-demo",
  "talking-head",
] as const;

export const BUNDLED_MANIFEST_INVENTORY_SLUGS = [
  ...APPROVED_BUNDLED_PIPELINE_SLUGS,
  "framework-smoke",
] as const;

export const SHOW_ONLY_DENYLIST = [
  "ww2-diary",
  "thechaosfm",
  "last-rev",
  "rave-queen",
  "gta-political",
  "aint-no-crowns",
] as const;

const inventory = new Map<string, DemoReadinessInventoryEntry>(
  Object.entries(DEMO_READINESS_INVENTORY),
);
const showOnlyConcepts = new Set<string>(SHOW_ONLY_DENYLIST);

export function getInventory(): ReadonlyMap<string, DemoReadinessInventoryEntry> {
  return inventory;
}

export function isApprovedBundledPipeline(slug: string): boolean {
  return inventory.has(slug);
}

export function isShowOnlyConcept(slug: string): boolean {
  return showOnlyConcepts.has(slug);
}

export function classifyForDefaultStarter(slug: string): DemoReadinessClassification | undefined {
  const entry = inventory.get(slug);
  if (entry?.defaultStarterTarget === true) {
    return entry.classification;
  }

  return undefined;
}
