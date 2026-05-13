import { describe, expect, it } from "vitest";
import {
  PROMISE_RULES,
  VIDEO_EXTENSIONS,
  _REAL_MOTION_TYPES,
  _SLIDE_GRAMMAR_TYPES,
  checkDeliveryPromise,
  classifyFromBrief,
  validateCuts,
} from "./delivery-promise.js";

describe("delivery promise validator", () => {
  it("exports the expected PROMISE_RULES table and cut type sets", () => {
    expect(PROMISE_RULES).toMatchObject({
      motion_led: { min_motion_ratio: 0.7, still_fallback_allowed: false, requires_video_generation: true },
      cinematic_hybrid: { min_motion_ratio: 0.5, still_fallback_allowed: false, requires_video_generation: true },
      avatar_presenter: { min_motion_ratio: 0.3, still_fallback_allowed: true, requires_video_generation: false },
      hybrid: { min_motion_ratio: 0.2, still_fallback_allowed: true, requires_video_generation: false },
      narration_over_graphics: { min_motion_ratio: 0.1, still_fallback_allowed: true, requires_video_generation: false },
      still_led: { min_motion_ratio: 0, still_fallback_allowed: true, requires_video_generation: false },
      source_led: { min_motion_ratio: 0, still_fallback_allowed: true, requires_video_generation: false },
      screen_demo: { min_motion_ratio: 0, still_fallback_allowed: true, requires_video_generation: false },
    });
    expect([..._SLIDE_GRAMMAR_TYPES]).toEqual([
      "text_card",
      "stat_card",
      "callout",
      "comparison",
      "hero_title",
      "ken_burns",
      "slide_in",
      "slide_out",
      "fade_in",
      "fade_out",
    ]);
    expect([..._REAL_MOTION_TYPES]).toEqual(["video_clip", "animation", "motion_graphic"]);
    expect(VIDEO_EXTENSIONS).toEqual(["mp4", "mov", "webm", "avi", "mkv"]);
  });

  it("classifies delivery promises from brief signals and applies overrides", () => {
    expect(classifyFromBrief({ renderer_family: "cinematic-trailer" })).toBe("motion_led");
    expect(classifyFromBrief({ pipeline: "explainer", narration_required: true })).toBe("narration_over_graphics");
    expect(classifyFromBrief({ talking_head: true })).toBe("avatar_presenter");
    expect(classifyFromBrief({ pipeline: "screen-demo" })).toBe("screen_demo");
    expect(classifyFromBrief({ renderer_family: "product-reveal" })).toBe("cinematic_hybrid");
    expect(classifyFromBrief({ renderer_family: "cinematic-trailer", motion_required: false })).toBe("hybrid");
    expect(classifyFromBrief({ pipeline: "explainer", has_footage: true })).toBe("source_led");
  });

  it("counts motion, slide, and still cuts and flags motion-ratio violations", () => {
    const result = validateCuts(
      "motion_led",
      [
        { start_s: 0, end_s: 1, asset_id: "hero-video" },
        { start_s: 1, end_s: 2, asset_id: "title-card" },
        { start_s: 2, end_s: 3, asset_id: "still-frame" },
      ],
      {
        assets: [
          { id: "hero-video", cut_type: "video_clip", path: "renders/hero.mp4" },
          { id: "title-card", cut_type: "text_card" },
          { id: "still-frame", path: "renders/frame.png" },
        ],
      },
    );

    expect(result).toMatchObject({
      total: 3,
      motion_cuts: 1,
      slide_cuts: 1,
      still_cuts: 1,
      motion_ratio: 1 / 3,
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Delivery promise motion ratio is below threshold",
      }),
    );
  });

  it("flags silent still-led downgrades for motion promises unless approved", () => {
    const cuts = [
      { start_s: 0, end_s: 1, asset_id: "title-card" },
      { start_s: 1, end_s: 2, asset_id: "still-frame" },
      { start_s: 2, end_s: 3, asset_id: "hero-video" },
    ];
    const assets = [
      { id: "title-card", cut_type: "hero_title" },
      { id: "still-frame", path: "renders/frame.jpg" },
      { id: "hero-video", path: "renders/hero.mp4" },
    ];

    const unapproved = validateCuts("cinematic_hybrid", cuts, { assets });
    expect(unapproved.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Motion-led delivery silently downgraded to still-led",
      }),
    );

    const approved = validateCuts("cinematic_hybrid", cuts, { assets, approved_fallback: "still_led" });
    expect(approved.findings).not.toContainEqual(
      expect.objectContaining({
        title: "Motion-led delivery silently downgraded to still-led",
      }),
    );
  });

  it("flags dropped narration on narration-required promises", () => {
    const result = validateCuts(
      "narration_over_graphics",
      [{ start_s: 0, end_s: 2, asset_id: "chart.mp4" }],
      { narration_present: false },
    );

    expect(result.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Narration-required delivery dropped narration",
      }),
    );
  });

  it("exposes a runner-facing check for edit and compose artifacts", () => {
    const findings = checkDeliveryPromise(
      "edit",
      {
        cuts: [
          { start_s: 0, end_s: 1, asset_id: "title-card" },
          { start_s: 1, end_s: 2, asset_id: "still-frame" },
        ],
      },
      {
        brief: { renderer_family: "cinematic-trailer" },
        assets: [
          { id: "title-card", cut_type: "hero_title" },
          { id: "still-frame", path: "renders/frame.png" },
        ],
      },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Delivery promise motion ratio is below threshold",
      }),
    );
  });
});
