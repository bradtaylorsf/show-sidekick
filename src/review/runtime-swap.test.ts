import { describe, expect, it } from "vitest";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import { checkRuntimeSwap } from "./runtime-swap.js";

describe("runtime swap reviewer", () => {
  it("flags runtime swaps between proposal and compose without a superseding decision", () => {
    const findings = checkRuntimeSwap("compose", renderReport("remotion"), {
      proposalPacket: proposal("hyperframes"),
      decisionLog: [runtimeDecision({ id: "runtime-proposal", picked: "hyperframes" })],
    });

    expect(findings).toEqual([
      expect.objectContaining({
        severity: "critical",
        title: "Silent runtime swap between proposal and compose",
        location: "render_report.runtime_used",
        proposed_fix: expect.stringContaining("recordDecision"),
      }),
    ]);
  });

  it("allows runtime swaps with a logged supersession decision", () => {
    const findings = checkRuntimeSwap("compose", renderReport("remotion"), {
      proposalPacket: proposal("hyperframes"),
      decisionLog: [
        runtimeDecision({ id: "runtime-proposal", picked: "hyperframes" }),
        runtimeDecision({
          id: "runtime-compose",
          stage: "compose",
          picked: "remotion",
          supersedes: "runtime-proposal",
        }),
      ],
    });

    expect(findings).toEqual([]);
  });
});

function proposal(runtime: ProposalPacket["production_plan"]["render_runtime"]): ProposalPacket {
  return {
    concept_options: [
      { slug: "one", hook: "One", treatment: "Treatment one" },
      { slug: "two", hook: "Two", treatment: "Treatment two" },
      { slug: "three", hook: "Three", treatment: "Treatment three" },
    ],
    production_plan: {
      render_runtime: runtime,
      renderer_family: "cinematic-trailer",
      audio_architecture: "single_narrator",
    },
    delivery_promise: {
      motion_led: true,
      narration_present: true,
      music_present: true,
    },
    decision_log_ref: "projects/demo/episode/decisions.json",
  };
}

function renderReport(runtime: RenderReport["runtime_used"]): RenderReport {
  return {
    output_path: "renders/final.mp4",
    encoding_profile: "h264",
    duration_s: 30,
    resolution: { width: 1920, height: 1080 },
    framerate: 24,
    runtime_used: runtime,
    asset_count: 8,
    warnings: [],
    validation_steps: [],
  };
}

function runtimeDecision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "runtime-proposal",
    stage: "proposal",
    timestamp: "2026-05-13T10:00:00Z",
    category: "render_runtime_selection",
    options_considered: [
      { label: "hyperframes", rejected_because: null },
      { label: "remotion", rejected_because: "less kinetic control" },
    ],
    picked: "hyperframes",
    reason: "HyperFrames matched the motion-led proposal.",
    confidence: 0.85,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}
