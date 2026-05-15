import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPROVED_BUNDLED_PIPELINE_SLUGS,
  BUNDLED_MANIFEST_INVENTORY_SLUGS,
  DEMO_READINESS_INVENTORY,
  SHOW_ONLY_DENYLIST,
  classifyForDefaultStarter,
  getInventory,
  isApprovedBundledPipeline,
  isShowOnlyConcept,
} from "./demo-inventory.js";

const bundledPipelinesDir = fileURLToPath(new URL("../../bundled/pipelines/", import.meta.url));

describe("demo-readiness pipeline inventory", () => {
  it("classifies the approved bundled manifest inventory explicitly", () => {
    expect(APPROVED_BUNDLED_PIPELINE_SLUGS).toEqual([
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
    ]);
    expect(Object.keys(DEMO_READINESS_INVENTORY).sort((left, right) => left.localeCompare(right))).toEqual(
      [...BUNDLED_MANIFEST_INVENTORY_SLUGS].sort((left, right) => left.localeCompare(right)),
    );
    expect([...getInventory().keys()].sort((left, right) => left.localeCompare(right))).toEqual(
      Object.keys(DEMO_READINESS_INVENTORY).sort((left, right) => left.localeCompare(right)),
    );
  });

  it("marks framework-smoke as test-only and excludes it from default starter targets", () => {
    expect(DEMO_READINESS_INVENTORY["framework-smoke"]).toEqual({
      classification: "test_only",
      defaultStarterTarget: false,
    });
    expect(isApprovedBundledPipeline("framework-smoke")).toBe(true);
    expect(classifyForDefaultStarter("framework-smoke")).toBeUndefined();
  });

  it("guards show-only concepts from becoming bundled pipeline types", () => {
    for (const slug of SHOW_ONLY_DENYLIST) {
      expect(isShowOnlyConcept(slug)).toBe(true);
      expect(isApprovedBundledPipeline(slug)).toBe(false);
      expect(existsSync(path.join(bundledPipelinesDir, `${slug}.yaml`)), `${slug} must not ship as a manifest`).toBe(
        false,
      );
    }
  });

  it("only allows core and seeded inventory entries as default starter targets", () => {
    const allowedClassifications = new Set(["core_default", "seeded_extension"]);

    for (const [slug, entry] of getInventory()) {
      if (entry.defaultStarterTarget) {
        expect(allowedClassifications.has(entry.classification), `${slug}`).toBe(true);
        expect(classifyForDefaultStarter(slug)).toBe(entry.classification);
      } else {
        expect(classifyForDefaultStarter(slug)).toBeUndefined();
      }
    }
  });
});
