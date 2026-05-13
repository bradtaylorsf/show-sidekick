import { describe, expect, it } from "vitest";
import { runReview, type ReviewContext } from "./runner.js";

const basePipeline: ReviewContext["pipeline"] = {
  stages: [
    {
      slug: "scene_plan",
      skill: "skills/pipelines/test/scene-plan-director.md",
      produces: "scene_plan",
      review_focus: [],
      success_criteria: [{ scenes: ">= 1" }],
      tools_available: [],
      human_approval: "optional",
    },
    {
      slug: "edit",
      skill: "skills/pipelines/test/edit-director.md",
      produces: "edit_decisions",
      review_focus: [],
      success_criteria: [],
      tools_available: [],
      human_approval: "optional",
    },
  ],
};

const validScenePlan = {
  scenes: [
    {
      slug: "hook",
      order: 0,
      start_s: 0,
      end_s: 4,
      narrative_role: "hook",
      scene_anchor: "opening beat",
      texture_keywords: [],
      character_actions: [],
      shot_language: {
        shot_size: "CU",
        camera_movement: "static",
        lighting_key: "natural",
        lens_mm: 35,
        depth_of_field: "deep",
        color_temperature: "daylight",
      },
      required_assets: [],
    },
  ],
};

describe("runReview", () => {
  it("passes a valid artifact with no critical findings", () => {
    const review = runReview("scene_plan", validScenePlan, { pipeline: basePipeline, round: 0 });

    expect(review.decision).toBe("pass");
    expect(review.summary).toMatchObject({
      critical: 0,
      success_criteria_met: 1,
      success_criteria_total: 1,
    });
  });

  it("returns critical findings for schema-invalid artifacts", () => {
    const review = runReview("scene_plan", { scenes: [{}] }, { pipeline: basePipeline, round: 0 });

    expect(review.decision).toBe("revise");
    expect(review.summary.critical).toBeGreaterThan(0);
    expect(review.findings.every((finding) => finding.location.length > 0)).toBe(true);
  });

  it("enforces a maximum of two revision rounds", () => {
    const review = runReview("scene_plan", { scenes: [{}] }, { pipeline: basePipeline, round: 2 });

    expect(review.decision).toBe("pass_with_warnings");
    expect(review.summary.critical).toBeGreaterThan(0);
  });

  it("returns pass at round 2 when no criticals remain", () => {
    const review = runReview("scene_plan", validScenePlan, { pipeline: basePipeline, round: 2 });

    expect(review.decision).toBe("pass");
    expect(review.summary.critical).toBe(0);
  });

  it("adds playbook cross-check suggestions when a playbook is active", () => {
    const review = runReview("scene_plan", validScenePlan, {
      pipeline: basePipeline,
      playbook: {
        palette: ["#112233"],
        transitions_allowed: ["cut"],
        pacing: { min_scene_s: 5, max_scene_s: 8 },
        style_cues: ["paper grain"],
      },
    });

    expect(review.decision).toBe("pass");
    expect(review.summary.suggestions).toBeGreaterThan(0);
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Scene pacing is outside playbook range",
        location: "scene_plan.scenes[0]",
      }),
    );
  });

  it("runs composition validation for edit decisions when planned duration is available", () => {
    const review = runReview(
      "edit",
      {
        cuts: [
          { start_s: 0, end_s: 3, asset_id: "a" },
          { start_s: 4, end_s: 6, asset_id: "b" },
        ],
        render_runtime: "ffmpeg",
        renderer_family: "explainer-data",
      },
      { pipeline: basePipeline, plannedDurationS: 8 },
    );

    expect(review.decision).toBe("revise");
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition has a gap between cuts",
      }),
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition does not cover full planned duration",
      }),
    );
  });

  it("runs delivery promise validation for edit decisions", () => {
    const review = runReview(
      "edit",
      {
        cuts: [
          { start_s: 0, end_s: 3, asset_id: "title-card" },
          { start_s: 3, end_s: 6, asset_id: "still-frame" },
        ],
        render_runtime: "ffmpeg",
        renderer_family: "explainer-data",
      },
      {
        pipeline: basePipeline,
        deliveryPromise: "motion_led",
        assets: [
          { id: "title-card", cut_type: "hero_title" },
          { id: "still-frame", path: "renders/frame.png" },
        ],
      },
    );

    expect(review.decision).toBe("revise");
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Delivery promise motion ratio is below threshold",
      }),
    );
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Motion-led delivery silently downgraded to still-led",
      }),
    );
  });
});
