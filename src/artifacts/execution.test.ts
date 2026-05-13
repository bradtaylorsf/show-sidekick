import { describe, expect, it } from "vitest";
import { CostLogSchema } from "./cost-log.js";
import { DECISION_CATEGORY, DecisionLogSchema } from "./decision-log.js";
import { EditDecisionsSchema, migrateEditDecisions } from "./edit-decisions.js";
import { FINAL_REVIEW_THRESHOLDS, FinalReviewSchema } from "./final-review.js";
import { RenderReportSchema } from "./render-report.js";
import { ReviewSchema } from "./review.js";
import { SourceMediaReviewSchema } from "./source-media-review.js";
import { VideoAnalysisBriefSchema } from "./video-analysis-brief.js";

const finalReview = {
  status: "pass",
  recommended_action: "present_to_user",
  checks: {
    technical_probe: {
      container: "mp4",
      duration_s: 60,
      duration_promised_s: 60,
      width: 1080,
      height: 1920,
      framerate: 30,
      video_codec: "h264",
      audio_codec: "aac",
      audio_channels: 2,
      bitrate_kbps: 6200,
      verdict: "pass",
    },
    visual_spotcheck: {
      frames_sampled: 4,
      findings: [],
    },
    audio_spotcheck: {
      narration_present: true,
      music_present: true,
      caption_sync_accuracy: 0.97,
      findings: [],
    },
    promise_preservation: {
      delivery_promise_honored: true,
      silent_downgrade_detected: false,
      runtime_swap_detected: false,
      runtime_swap_check: "ok - proposal=hyperframes, edit=hyperframes, render=hyperframes",
      motion_ratio_actual: 0.75,
      render_runtime_used: "hyperframes",
      findings: [],
    },
    subtitle_check: {
      present: true,
      accuracy_within_150ms: 0.97,
    },
    transcript_comparison: {
      word_accuracy: 0.9,
      missing_words_pct: 2,
    },
  },
  issues_found: [],
};

describe("execution artifact schemas", () => {
  it("accepts edit decisions with preferred audio music", () => {
    const decisions = EditDecisionsSchema.parse({
      cuts: [{ start_s: 0, end_s: 4, asset_id: "hero", provider: "stock" }],
      overlays: [],
      audio: {
        music: {
          track_path: "music/track.wav",
          ducking: {
            enabled: true,
            threshold_db: -20,
            reduction_db: -8,
            attack_ms: 20,
            release_ms: 200,
          },
        },
      },
      render_runtime: "hyperframes",
      renderer_family: "screen-demo",
      brand: { slug: "last-rev", name: "Last Rev" },
    });

    expect(decisions.audio?.music?.ducking).toMatchObject({ enabled: true });
  });

  it("normalizes legacy edit decisions music and transitions", () => {
    const migrated = migrateEditDecisions({
      cuts: [
        { start_s: 0, end_s: 4, asset_id: "one" },
        { start_s: 4, end_s: 8, asset_id: "two", transition_out: "existing" },
      ],
      music: "music/legacy.wav",
      transitions: [{ out: "crossfade" }, { out: "dip" }],
      render_runtime: "ffmpeg",
      renderer_family: "documentary-montage",
    });

    expect(migrated.audio?.music?.track_path).toBe("music/legacy.wav");
    expect(migrated.cuts[0]?.transition_out).toBe("crossfade");
    expect(migrated.cuts[1]?.transition_out).toBe("existing");
    expect(migrated.transitions).toBeUndefined();
  });

  it("accepts render reports and rejects negative framerates", () => {
    const report = {
      output_path: "renders/final.mp4",
      encoding_profile: "h264/aac",
      duration_s: 60,
      resolution: { width: 1080, height: 1920 },
      framerate: 30,
      runtime_used: "remotion",
      asset_count: 4,
      warnings: [],
      validation_steps: [{ name: "probe", status: "pass" }],
    };

    expect(RenderReportSchema.parse(report).runtime_used).toBe("remotion");
    expect(() => RenderReportSchema.parse({ ...report, framerate: -1 })).toThrow(
      "Number must be greater than 0",
    );
  });

  it("rejects decision log entries with fewer than two options", () => {
    expect(() =>
      DecisionLogSchema.parse([
        {
          id: "runtime",
          stage: "proposal",
          timestamp: "2026-05-12T15:18:42Z",
          category: "render_runtime_selection",
          options_considered: [{ label: "hyperframes", rejected_because: null }],
          picked: "hyperframes",
          reason: "Best fit for motion-led brief.",
          confidence: 0.85,
          user_visible: true,
          supersedes: null,
        },
      ]),
    ).toThrow("Array must contain at least 2 element(s)");
  });

  it("accepts every decision category enum value", () => {
    const log = DECISION_CATEGORY.map((category) => ({
      id: category,
      stage: "proposal",
      timestamp: "2026-05-12T15:18:42Z",
      category,
      options_considered: [
        { label: "a", rejected_because: null },
        { label: "b", rejected_because: "not selected" },
      ],
      picked: "a",
      reason: `Selected ${category}.`,
      confidence: 0.5,
      user_visible: true,
      supersedes: null,
    }));

    expect(DecisionLogSchema.parse(log)).toHaveLength(DECISION_CATEGORY.length);
  });

  it("accepts review artifacts and rejects unknown decisions", () => {
    const review = {
      stage: "scene_plan",
      round: 1,
      decision: "pass_with_warnings",
      findings: [
        {
          severity: "suggestion",
          title: "Tighten beat two",
          location: "scene_plan.scenes[1]",
          description: "The second scene is a little loose.",
          proposed_change: "Shorten by one second.",
        },
      ],
      summary: {
        critical: 0,
        suggestions: 1,
        nitpicks: 0,
        investigations: 0,
        success_criteria_met: 4,
        success_criteria_total: 4,
      },
    };

    expect(ReviewSchema.parse(review).decision).toBe("pass_with_warnings");
    expect(() => ReviewSchema.parse({ ...review, decision: "maybe" })).toThrow("Invalid enum value");
  });

  it("accepts cost logs", () => {
    expect(
      CostLogSchema.parse([
        {
          tool: "image_generation",
          provider: "openai",
          model: "image-model",
          units: 1,
          usd: 0.12,
          mode: "sample",
        },
      ]),
    ).toHaveLength(1);
  });

  it("accepts final reviews and exposes thresholds", () => {
    expect(FinalReviewSchema.parse(finalReview).status).toBe("pass");
    expect(FINAL_REVIEW_THRESHOLDS.visual_frames_sampled_min).toBe(4);
  });

  it("rejects unknown final review recommended actions", () => {
    expect(() => FinalReviewSchema.parse({ ...finalReview, recommended_action: "ship_it" })).toThrow(
      "Invalid enum value",
    );
  });

  it("requires source media files to be reviewed and probed", () => {
    expect(() =>
      SourceMediaReviewSchema.parse({
        files: [
          {
            path: "source.mp4",
            reviewed: false,
            technical_probe: { duration_s: 10, width: 1920 },
            content_summary: "duration_s and width are suitable.",
          },
        ],
      }),
    ).toThrow("Invalid literal value");

    expect(() =>
      SourceMediaReviewSchema.parse({
        files: [
          {
            path: "source.mp4",
            reviewed: true,
            technical_probe: {},
            content_summary: "No probe fields cited.",
          },
        ],
      }),
    ).toThrow("technical_probe must not be empty");
  });

  it("requires source media summaries to cite at least two probe fields", () => {
    expect(() =>
      SourceMediaReviewSchema.parse({
        files: [
          {
            path: "source.mp4",
            reviewed: true,
            technical_probe: { duration_s: 10, width: 1920 },
            content_summary: "duration_s looks right.",
          },
        ],
      }),
    ).toThrow("content_summary must cite at least 2 probe fields");

    expect(
      SourceMediaReviewSchema.parse({
        files: [
          {
            path: "source.mp4",
            reviewed: true,
            technical_probe: { duration_s: 10, width: 1920 },
            content_summary: "duration_s is 10 and width is 1920.",
          },
        ],
      }).files[0]?.reviewed,
    ).toBe(true);
  });

  it("accepts video analysis briefs and rejects unknown motion types", () => {
    const brief = {
      scenes: [
        {
          scene_ref: "opening",
          subject: ["host"],
          subject_motion: ["walking"],
          scene: ["office"],
          spatial_framing: ["centered"],
          camera: ["push in"],
          motion_type: "motion_clip",
          flow_variance: 0.4,
        },
      ],
    };

    expect(VideoAnalysisBriefSchema.parse(brief).scenes[0]?.motion_type).toBe("motion_clip");
    expect(() =>
      VideoAnalysisBriefSchema.parse({
        scenes: [{ ...brief.scenes[0], motion_type: "gif" }],
      }),
    ).toThrow("Invalid enum value");
  });
});
