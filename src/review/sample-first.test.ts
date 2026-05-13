import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import { checkSampleFirstProtocol, getSampleFirstTriggers, loadSampleFirstTriggers } from "./sample-first.js";

const SAMPLE_FIRST_SKILL_PATH = fileURLToPath(new URL("../../bundled/skills/meta/sample-first.md", import.meta.url));

describe("sample-first protocol reviewer", () => {
  it("ships the bundled meta skill with verbatim triggers and override phrasing", () => {
    const skill = readFileSync(SAMPLE_FIRST_SKILL_PATH, "utf8");

    expect(skill).toContain("music-video | cost `> $0.50` OR time `> 15 min`");
    expect(skill).toContain("news-song | cost `> $1.00` OR time `> 15 min`");
    expect(skill).toContain("cinematic | ALWAYS when reference-driven OR motion-required");
    expect(skill).toContain("I'd recommend a sample first because <reason>. If you want to skip it, I'll log a downgrade_approval decision and proceed at full cost.");
  });

  it("loads the bundled trigger table", async () => {
    const triggers = await loadSampleFirstTriggers();

    expect(triggers["music-video"]).toMatchObject({ mode: "threshold", cost_usd: 0.5, time_minutes: 15 });
    expect(getSampleFirstTriggers()["character-animation"]).toMatchObject({ mode: "always" });
  });

  it("does not fire music-video below its cost and time thresholds", () => {
    const findings = checkSampleFirstProtocol("proposal", proposal(), {
      pipelineSlug: "music-video",
      estimatedCostUsd: 0.5,
      estimatedTimeMinutes: 15,
    });

    expect(findings).toEqual([]);
  });

  it("fires music-video above its cost threshold when sample_required is missing", () => {
    const findings = checkSampleFirstProtocol("proposal", proposal(), {
      pipelineSlug: "music-video",
      estimatedCostUsd: 0.51,
    });

    expect(findings).toEqual([
      expect.objectContaining({
        severity: "critical",
        title: "Sample-first protocol triggered but sample_required not set",
        location: "proposal.production_plan.sample_required",
        description: expect.stringContaining("cost > $0.50"),
      }),
    ]);
  });

  it("fires news-song above its time threshold", () => {
    const findings = checkSampleFirstProtocol("proposal", proposal(), {
      pipelineSlug: "news-song",
      estimatedTimeMinutes: 16,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        description: expect.stringContaining("time > 15 min"),
      }),
    );
  });

  it("always fires character-animation unless sample_required is set", () => {
    expect(
      checkSampleFirstProtocol("proposal", proposal(), {
        pipelineSlug: "character-animation",
      }),
    ).toContainEqual(expect.objectContaining({ severity: "critical" }));
    expect(
      checkSampleFirstProtocol("proposal", proposal({ sample_required: true }), {
        pipelineSlug: "character-animation",
      }),
    ).toEqual([]);
  });

  it("fires cinematic only when reference-driven or motion-required", () => {
    expect(
      checkSampleFirstProtocol("proposal", proposal({ motion_led: false, reference_driven: false }), {
        pipelineSlug: "cinematic",
      }),
    ).toEqual([]);
    expect(
      checkSampleFirstProtocol("proposal", proposal({ motion_led: true, reference_driven: false }), {
        pipelineSlug: "cinematic",
      }),
    ).toContainEqual(
      expect.objectContaining({
        description: expect.stringContaining("motion-required"),
      }),
    );
  });

  it("fires documentary-montage when a hero scene is present", () => {
    const findings = checkSampleFirstProtocol("proposal", proposal({ motion_led: false }), {
      pipelineSlug: "documentary-montage",
      heroScenePresent: true,
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        description: expect.stringContaining("hero-scene-present"),
      }),
    );
  });

  it("applies grouped threshold rows for explainer and talking-head pipelines", () => {
    expect(
      checkSampleFirstProtocol("proposal", proposal(), {
        pipelineSlug: "animated-explainer",
        estimatedCostUsd: 1.01,
      }),
    ).toContainEqual(expect.objectContaining({ severity: "critical" }));
    expect(
      checkSampleFirstProtocol("proposal", proposal(), {
        pipelineSlug: "animation",
        estimatedTimeMinutes: 21,
      }),
    ).toContainEqual(expect.objectContaining({ severity: "critical" }));
    expect(
      checkSampleFirstProtocol("proposal", proposal(), {
        pipelineSlug: "hybrid",
        estimatedCostUsd: 1.01,
      }),
    ).toContainEqual(expect.objectContaining({ severity: "critical" }));
    expect(
      checkSampleFirstProtocol("proposal", proposal(), {
        pipelineSlug: "avatar-spokesperson",
        estimatedCostUsd: 0.51,
      }),
    ).toContainEqual(expect.objectContaining({ severity: "critical" }));
    expect(
      checkSampleFirstProtocol("proposal", proposal(), {
        pipelineSlug: "talking-head",
        estimatedCostUsd: 0.51,
      }),
    ).toContainEqual(expect.objectContaining({ severity: "critical" }));
  });

  it("allows a user-insists-skip override when downgrade_approval mentions sample-first", () => {
    const findings = checkSampleFirstProtocol("proposal", proposal(), {
      pipelineSlug: "music-video",
      estimatedCostUsd: 2,
      decisionLog: [
        decision({
          category: "downgrade_approval",
          reason: "User insists on sample-first skip after pushback.",
        }),
      ],
    });

    expect(findings).toEqual([]);
  });
});

function proposal(
  overrides: Partial<
    ProposalPacket["production_plan"] & {
      motion_led: boolean;
      reference_driven: boolean;
    }
  > = {},
): ProposalPacket {
  return {
    concept_options: [
      { slug: "one", hook: "One", treatment: "Treatment one" },
      { slug: "two", hook: "Two", treatment: "Treatment two" },
      { slug: "three", hook: "Three", treatment: "Treatment three" },
    ],
    production_plan: {
      render_runtime: "hyperframes",
      renderer_family: "cinematic-trailer",
      audio_architecture: "single_narrator",
      ...(overrides.sample_required === undefined ? {} : { sample_required: overrides.sample_required }),
    },
    delivery_promise: {
      motion_led: overrides.motion_led ?? true,
      narration_present: true,
      music_present: true,
      reference_driven: overrides.reference_driven,
    },
    decision_log_ref: "projects/demo/episode/decisions.json",
  };
}

function decision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "sample-first-skip",
    stage: "proposal",
    timestamp: "2026-05-13T10:00:00Z",
    category: "downgrade_approval",
    options_considered: [
      { label: "run_sample", rejected_because: "user chose to skip", notes: null },
      { label: "skip_sample", rejected_because: null, notes: null },
    ],
    picked: "skip_sample",
    reason: "User insists on sample-first skip after pushback.",
    confidence: 1,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}
