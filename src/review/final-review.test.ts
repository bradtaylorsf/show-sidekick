import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import type { EditDecisions } from "../artifacts/edit-decisions.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import type { FinalReview } from "../artifacts/final-review.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import {
  buildFinalReview,
  buildForceApprovalDecision,
  checkFinalReview,
  finalReviewFramesDir,
  haltOnFinalReviewFail,
} from "./final-review.js";

function proposalPacket(runtime: RenderRuntime = "remotion", narrationPresent = true): ProposalPacket {
  return {
    concept_options: [
      { slug: "a", hook: "hook a", treatment: "treatment a" },
      { slug: "b", hook: "hook b", treatment: "treatment b" },
      { slug: "c", hook: "hook c", treatment: "treatment c" },
    ],
    production_plan: {
      render_runtime: runtime,
      renderer_family: "explainer-data",
      audio_architecture: narrationPresent ? "single_narrator" : "no_narration",
    },
    delivery_promise: {
      motion_led: true,
      narration_present: narrationPresent,
      music_present: true,
    },
    decision_log_ref: "projects/demo/episode/decisions.json",
  };
}

function editDecisions(runtime: RenderRuntime = "remotion"): EditDecisions {
  return {
    cuts: [],
    overlays: [],
    render_runtime: runtime,
    renderer_family: "explainer-data",
  };
}

function renderReport(runtime: RenderRuntime = "remotion"): RenderReport {
  return {
    output_path: "projects/demo/episode/renders/final.mp4",
    encoding_profile: "h264/aac",
    duration_s: 12,
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    runtime_used: runtime,
    asset_count: 4,
    warnings: [],
    validation_steps: [],
  };
}

function runtimeDecision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "runtime-proposal",
    stage: "proposal",
    timestamp: "2026-05-12T15:18:42Z",
    category: "render_runtime_selection",
    options_considered: [
      { label: "remotion", rejected_because: null },
      { label: "hyperframes", rejected_because: null },
    ],
    picked: "remotion",
    reason: "Remotion fits this motion-led render plan.",
    confidence: 0.82,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}

function videoAnalysisBrief(elements: string[]): VideoAnalysisBrief {
  return {
    promise_elements: elements,
    scenes: [
      {
        subject: ["host"],
        subject_motion: ["gesture"],
        scene: ["studio"],
        spatial_framing: ["center"],
        camera: ["static"],
        motion_type: "motion_clip",
        flow_variance: 0.8,
      },
    ],
  };
}

function buildReview(overrides: Partial<Parameters<typeof buildFinalReview>[0]> = {}): FinalReview {
  return buildFinalReview({
    proposalPacket: proposalPacket(),
    editDecisions: editDecisions(),
    renderReport: renderReport(),
    expectedResolution: { width: 1920, height: 1080 },
    technical_probe: {
      container: "mp4",
      duration_s: 12,
      duration_promised_s: 12,
      width: 1920,
      height: 1080,
      framerate: 30,
      video_codec: "h264",
      audio_codec: "aac",
      audio_channels: 2,
      bitrate_kbps: 6200,
      verdict: "pass",
    },
    visual_spotcheck: {
      frames_sampled: 5,
      sample_points_pct: [10, 35, 65, 90],
      frame_paths: [
        "projects/demo/episode/final_review/frames/10.png",
        "projects/demo/episode/final_review/frames/35.png",
        "projects/demo/episode/final_review/frames/65.png",
        "projects/demo/episode/final_review/frames/90.png",
      ],
      hero_frame_path: "projects/demo/episode/final_review/frames/hero.png",
      matched_elements: ["neon logo", "hero product"],
      findings: [],
    },
    audio_spotcheck: {
      narration_present: true,
      music_present: true,
      caption_sync_accuracy: 0.98,
      findings: [],
    },
    subtitle_check: {
      present: true,
      accuracy_within_150ms: 0.98,
    },
    motion_ratio_actual: 0.8,
    render_runtime_used: "remotion",
    ...overrides,
  });
}

function findingTitles(review: FinalReview): string[] {
  return checkFinalReview("final_review", review, {
    proposalPacket: proposalPacket(),
    editDecisions: editDecisions(),
    renderReport: renderReport(),
    expectedResolution: { width: 1920, height: 1080 },
  }).map((finding) => finding.title);
}

describe("final review", () => {
  it("passes a valid final review and reports no findings", () => {
    const review = buildReview();

    expect(review.status).toBe("pass");
    expect(review.recommended_action).toBe("present_to_user");
    expect(review.checks.promise_preservation.runtime_swap_check).toBe(
      "ok - proposal=remotion, edit=remotion, render=remotion",
    );
    expect(findingTitles(review)).toEqual([]);
  });

  it("fails motion-led promises when motion ratio falls below the PROMISE_RULES floor", () => {
    const review = buildReview({ motion_ratio_actual: 0.69 });

    expect(review.status).toBe("fail");
    expect(review.checks.promise_preservation.silent_downgrade_detected).toBe(true);
    expect(findingTitles(review)).toContain("Motion-led promise was silently downgraded");
  });

  it("fails runtime swaps unless a superseding render_runtime_selection decision exists", () => {
    const swapped = buildReview({
      render_runtime_used: "ffmpeg",
      renderReport: renderReport("ffmpeg"),
    });
    const supersededDecisionLog: DecisionLog = [
      runtimeDecision({ id: "runtime-proposal", picked: "remotion" }),
      runtimeDecision({
        id: "runtime-compose",
        stage: "compose",
        picked: "ffmpeg",
        options_considered: [
          { label: "ffmpeg", rejected_because: null },
          { label: "remotion", rejected_because: "superseded by final compose decision" },
        ],
        reason: "User approved the ffmpeg compose runtime because the machine lacked Remotion at render time.",
        supersedes: "runtime-proposal",
      }),
    ];
    const approved = buildReview({
      render_runtime_used: "ffmpeg",
      renderReport: renderReport("ffmpeg"),
      decisionLog: supersededDecisionLog,
    });

    expect(swapped.status).toBe("fail");
    expect(swapped.checks.promise_preservation.runtime_swap_detected).toBe(true);
    expect(findingTitles(swapped)).toContain("Render runtime changed without superseding decision");
    expect(approved.status).toBe("pass");
    expect(approved.checks.promise_preservation.runtime_swap_detected).toBe(true);
    expect(approved.checks.promise_preservation.silent_downgrade_detected).toBe(false);
  });

  it("fails when narration-required promises drop narration", () => {
    const review = buildReview({
      audio_spotcheck: {
        narration_present: false,
        music_present: true,
        caption_sync_accuracy: 0.98,
        findings: [],
      },
    });

    expect(review.status).toBe("fail");
    expect(review.checks.promise_preservation.silent_downgrade_detected).toBe(true);
    expect(findingTitles(review)).toContain("Narration-required promise dropped narration");
  });

  it("fails when reference-loved elements are missing from the visual spotcheck", () => {
    const review = buildReview({
      videoAnalysisBrief: videoAnalysisBrief(["neon logo", "red launch button"]),
      visual_spotcheck: {
        frames_sampled: 5,
        matched_elements: ["neon logo"],
        findings: [],
      },
    });

    expect(review.status).toBe("fail");
    expect(review.checks.promise_preservation.silent_downgrade_detected).toBe(true);
    expect(
      checkFinalReview("final_review", review, { videoAnalysisBrief: videoAnalysisBrief(["neon logo", "red launch button"]) }),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Reference-loved elements are missing from final render",
      }),
    );
  });

  it("applies caption sync thresholds at suggestion and critical levels", () => {
    const suggestion = buildReview({
      audio_spotcheck: {
        narration_present: true,
        music_present: true,
        caption_sync_accuracy: 0.94,
        findings: [],
      },
    });
    const critical = buildReview({
      audio_spotcheck: {
        narration_present: true,
        music_present: true,
        caption_sync_accuracy: 0.79,
        findings: [],
      },
    });

    expect(suggestion.status).toBe("revise");
    expect(checkFinalReview("final_review", suggestion)).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Caption sync accuracy is below V-9 threshold",
      }),
    );
    expect(critical.status).toBe("fail");
    expect(checkFinalReview("final_review", critical)).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Caption sync accuracy is below V-9 threshold",
      }),
    );
  });

  it("does not require transcript comparison when no script artifact exists", () => {
    const review = buildReview({ transcript_comparison: undefined });

    expect(review.status).toBe("pass");
    expect(findingTitles(review)).not.toContain("Transcript comparison indicates audio may be cut off");
  });

  it("fails transcript comparison below the audio cutoff threshold", () => {
    const review = buildReview({
      transcript_comparison: {
        word_accuracy: 0.79,
        missing_words_pct: 21,
      },
    });

    expect(review.status).toBe("fail");
    expect(findingTitles(review)).toContain("Transcript comparison indicates audio may be cut off");
  });

  it("fails technical probe drift and resolution mismatch", () => {
    const review = buildReview({
      technical_probe: {
        container: "mp4",
        duration_s: 12.6,
        duration_promised_s: 12,
        width: 1280,
        height: 720,
        framerate: 30,
        video_codec: "h264",
        audio_codec: "aac",
        audio_channels: 2,
        bitrate_kbps: 6200,
        verdict: "pass",
      },
    });
    const titles = findingTitles(review);

    expect(review.status).toBe("fail");
    expect(titles).toContain("Final render duration is outside tolerance");
    expect(titles).toContain("Final render resolution does not match plan");
  });

  it("exposes halt path, frames path, and force approval decision helpers", () => {
    const root = path.join("tmp", "project");
    const halt = haltOnFinalReviewFail(buildReview({ motion_ratio_actual: 0.1 }), {
      show: "demo",
      episode: "episode",
      root,
    });
    const approval = buildForceApprovalDecision({
      timestamp: "2026-05-12T15:18:42Z",
      reason: "User inspected the preserved failed render and approved proceeding despite the downgrade.",
    });

    expect(halt).toEqual({
      halt: true,
      preservedPath: path.join(root, "projects", "demo", "episode", "renders", "final-failed.mp4"),
    });
    expect(finalReviewFramesDir("demo", "episode", root)).toBe(
      path.join(root, "projects", "demo", "episode", "final_review", "frames"),
    );
    expect(approval).toMatchObject({
      id: "force_approval",
      category: "downgrade_approval",
      picked: "force_approval",
    });
  });
});
