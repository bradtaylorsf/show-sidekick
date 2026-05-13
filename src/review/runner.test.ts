import { describe, expect, it } from "vitest";
import { runReview, type ReviewContext } from "./runner.js";

const basePipeline: ReviewContext["pipeline"] = {
  stages: [
    {
      slug: "proposal",
      skill: "skills/pipelines/test/proposal-director.md",
      produces: "proposal_packet",
      review_focus: [],
      success_criteria: [],
      tools_available: [],
      human_approval: "optional",
    },
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
      slug: "script",
      skill: "skills/pipelines/test/script-director.md",
      produces: "script",
      review_focus: [],
      success_criteria: [],
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
    {
      slug: "compose",
      skill: "skills/pipelines/test/compose-director.md",
      produces: "render_report",
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
      texture_keywords: ["practical texture"],
      shot_intent: "establish the opening beat with a distinct close frame",
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

const validProposal = {
  concept_options: [
    { slug: "one", hook: "One", treatment: "Treatment one" },
    { slug: "two", hook: "Two", treatment: "Treatment two" },
    { slug: "three", hook: "Three", treatment: "Treatment three" },
  ],
  production_plan: {
    render_runtime: "hyperframes",
    renderer_family: "cinematic-trailer",
    audio_architecture: "single_narrator",
  },
  delivery_promise: {
    motion_led: true,
    narration_present: true,
    music_present: true,
  },
  decision_log_ref: "projects/show/episode/decisions.json",
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

  it("surfaces low transcript confidence as a script-stage suggestion", () => {
    const review = runReview("script", { script: "draft" }, {
      pipeline: basePipeline,
      cuesheet: {
        transcription_confidence: { average: 0.72, low_confidence: true },
      },
    });

    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Low-confidence transcript",
        location: "cuesheet.transcription_confidence",
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

  it("runs slideshow-risk scoring during scene-plan review", () => {
    const review = runReview(
      "scene_plan",
      {
        scenes: Array.from({ length: 4 }, (_, index) => ({
          slug: `slide-${index}`,
          order: index,
          start_s: index * 3,
          end_s: index * 3 + 3,
          narrative_role: "",
          scene_anchor: "same anchor",
          character_actions: [],
          description: "beautiful same slide",
          type: "text_card",
          shot_language: {
            shot_size: "CU",
            camera_movement: "dolly",
            lighting_key: "flat",
          },
          required_assets: [],
        })),
      },
      {
        pipeline: basePipeline,
        rendererFamily: "cinematic-trailer",
      },
    );

    expect(review.decision).toBe("revise");
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Slideshow risk score failed",
      }),
    );
  });

  it("runs edit-stage slideshow regression detection", () => {
    const review = runReview(
      "edit",
      {
        cuts: [],
        overlays: [],
        render_runtime: "remotion",
        renderer_family: "cinematic-trailer",
        scenes: Array.from({ length: 4 }, (_, index) => ({
          description: "same text card",
          type: "text_card",
          shot_language: {
            shot_size: "CU",
            camera_movement: "dolly",
            lighting_key: "flat",
          },
          start_s: index * 3,
          end_s: index * 3 + 3,
        })),
      },
      {
        pipeline: basePipeline,
        priorSlideshowScore: 1.2,
      },
    );

    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "edit_regression",
      }),
    );
  });

  it("runs scene pacing verification during scene-plan review", () => {
    const review = runReview("scene_plan", validScenePlan, {
      pipeline: basePipeline,
      scenePacingPipeline: {
        defaults: {
          max_scene_duration_s: 2,
        },
      },
    });

    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Scene exceeds maximum duration",
      }),
    );
  });

  it("runs sample-first validation only at proposal when the pipeline slug is supplied", () => {
    const missingSample = runReview("proposal", validProposal, {
      pipeline: basePipeline,
      pipelineSlug: "music-video",
      estimatedCostUsd: 0.75,
    });
    expect(missingSample.decision).toBe("revise");
    expect(missingSample.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Sample-first protocol triggered but sample_required not set",
      }),
    );

    const noPipelineSlug = runReview("proposal", validProposal, {
      pipeline: basePipeline,
      estimatedCostUsd: 0.75,
    });
    expect(noPipelineSlug.findings).not.toContainEqual(
      expect.objectContaining({ title: "Sample-first protocol triggered but sample_required not set" }),
    );

    const notProposal = runReview("scene_plan", validScenePlan, {
      pipeline: basePipeline,
      pipelineSlug: "music-video",
      estimatedCostUsd: 0.75,
    });
    expect(notProposal.findings).not.toContainEqual(
      expect.objectContaining({ title: "Sample-first protocol triggered but sample_required not set" }),
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

  it("halts compose review on a silent runtime swap", () => {
    const review = runReview(
      "compose",
      {
        output_path: "renders/final.mp4",
        encoding_profile: "h264",
        duration_s: 30,
        resolution: { width: 1920, height: 1080 },
        framerate: 24,
        runtime_used: "remotion",
        asset_count: 8,
        warnings: [],
        validation_steps: [],
      },
      {
        pipeline: basePipeline,
        proposalPacket: {
          concept_options: [
            { slug: "one", hook: "One", treatment: "Treatment one" },
            { slug: "two", hook: "Two", treatment: "Treatment two" },
            { slug: "three", hook: "Three", treatment: "Treatment three" },
          ],
          production_plan: {
            render_runtime: "hyperframes",
            renderer_family: "cinematic-trailer",
            audio_architecture: "single_narrator",
          },
          delivery_promise: {
            motion_led: true,
            narration_present: true,
            music_present: true,
          },
          decision_log_ref: "projects/show/episode/decisions.json",
        },
      },
    );

    expect(review.decision).toBe("revise");
    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Silent runtime swap between proposal and compose",
        location: "render_report.runtime_used",
      }),
    );
  });

  it("runs Layer 3 skill compliance from checkpoint tool invocations", () => {
    const review = runReview(
      "assets",
      { assets: [] },
      {
        pipeline: {
          stages: [
            {
              slug: "assets",
              skill: "skills/pipelines/test/assets-director.md",
              produces: "asset_manifest",
              review_focus: [],
              success_criteria: [],
              tools_available: [],
              human_approval: "optional",
            },
          ],
        },
        checkpoint: {
          stage: "assets",
          status: "completed",
          timestamp: "2026-05-12T15:42:00Z",
          artifact: { assets: [] },
          tool_invocations: [{ tool: "flux" }],
          skills_read: [],
        },
        getAgentSkills: (toolName) => (toolName === "flux" ? ["flux-best-practices", "bfl-api"] : undefined),
      },
    );

    expect(review.decision).toBe("pass");
    expect(review.summary.suggestions).toBe(2);
    expect(review.findings).toEqual([
      expect.objectContaining({
        severity: "suggestion",
        description: expect.stringContaining("flux-best-practices"),
      }),
      expect.objectContaining({
        severity: "suggestion",
        description: expect.stringContaining("bfl-api"),
      }),
    ]);
  });
});
