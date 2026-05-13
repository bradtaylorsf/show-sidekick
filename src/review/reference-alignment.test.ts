import { describe, expect, it } from "vitest";
import type { DecisionLog } from "../artifacts/decision-log.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { VideoAnalysisBriefSchema } from "../artifacts/video-analysis-brief.js";
import { checkReferenceAlignment } from "./reference-alignment.js";

const brief: VideoAnalysisBrief = {
  pacing_style: "slow_contemplative",
  promise_elements: ["lantern reflection"],
  approved_budget_usd: 10,
  scenes: [
    {
      scene_ref: "reference-opening",
      subject: ["host pauses beside a rain streaked window"],
      subject_motion: ["barely perceptible breathing and still posture"],
      scene: ["lantern reflection on glass as fog rolls through the alley"],
      spatial_framing: ["wide negative space around the host"],
      camera: ["locked tripod with a slow push"],
      motion_type: "motion_clip",
      flow_variance: 0.12,
    },
  ],
};

describe("checkReferenceAlignment", () => {
  it("keeps added video analysis brief fields backwards-compatible", () => {
    const parsed = VideoAnalysisBriefSchema.parse({
      scenes: [brief.scenes[0]],
    });

    expect(parsed.promise_elements).toEqual([]);
  });

  it("flags hallucinated pacing claims against the reference brief", () => {
    const findings = checkReferenceAlignment(
      "proposal",
      {
        concept_options: [
          {
            slug: "rush",
            hook: "A sprint through the scene",
            treatment: "Use fast pacing and rapid cuts while claiming this follows the reference.",
          },
        ],
      },
      { brief },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Reference pacing claim contradicts video analysis brief",
        location: "proposal.concept_options[0].treatment",
      }),
    );
  });

  it("flags carbon-copy treatments and missing loved elements", () => {
    const copiedReference =
      "host pauses beside a rain streaked window barely perceptible breathing and still posture lantern reflection on glass as fog rolls through the alley wide negative space around the host locked tripod with a slow push";

    const findings = checkReferenceAlignment(
      "proposal",
      {
        concept_options: [
          {
            slug: "copy",
            hook: "A copied opening",
            treatment: copiedReference,
          },
        ],
      },
      { brief: { ...brief, promise_elements: ["handwritten map"] } },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Proposal copies the reference too closely",
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Reference-loved element is missing",
        description: expect.stringContaining("handwritten map"),
      }),
    );
  });

  it("flags cost drift unless a budget approval decision exists", () => {
    const costLog = [
      { tool: "video", provider: "p", model: "m", units: 1, usd: 14, mode: "full" as const },
    ];

    const unapproved = checkReferenceAlignment("proposal", {}, { brief, costLog });
    expect(unapproved).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Cumulative cost exceeds approved reference budget",
      }),
    );

    const decisionLog: DecisionLog = [
      {
        id: "d1",
        stage: "proposal",
        timestamp: "2026-05-12T12:00:00.000Z",
        category: "budget_tradeoff",
        options_considered: [
          { label: "Stay under budget", rejected_because: "Would remove required scene", notes: null },
          { label: "Approve overage", rejected_because: null, notes: null },
        ],
        picked: "Approve overage",
        reason: "User approved the tradeoff.",
        confidence: 0.8,
        user_visible: true,
        supersedes: null,
      },
    ];

    const approved = checkReferenceAlignment("proposal", {}, { brief, costLog, decisionLog });
    expect(approved).not.toContainEqual(
      expect.objectContaining({
        title: "Cumulative cost exceeds approved reference budget",
      }),
    );
  });

  it("suggests review for assets beyond the approved proposal", () => {
    const findings = checkReferenceAlignment(
      "edit",
      {
        cuts: [
          { start_s: 0, end_s: 2, asset_id: "approved-hero" },
          { start_s: 2, end_s: 4, asset_id: "new-map" },
        ],
      },
      { brief, approvedProposalAssets: ["approved-hero"] },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Artifact introduces an unapproved asset",
        description: expect.stringContaining("new-map"),
      }),
    );
  });
});
