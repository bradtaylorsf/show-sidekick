import { describe, expect, it } from "vitest";
import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import { auditBoilerplateReason, auditConfidence, auditPresentBothRuntimes, auditRequiredCategories } from "./audit.js";

function decision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
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
    reason: "Remotion matches the approved renderer plan.",
    confidence: 0.82,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}

function proposalCoverage(): DecisionLog {
  return [
    decision(),
    decision({ id: "family", category: "renderer_family_selection", picked: "explainer-data" }),
    decision({ id: "playbook", category: "playbook_selection", picked: "clean-professional" }),
    decision({ id: "motion", category: "motion_commitment", picked: "motion_led" }),
    decision({ id: "concept", category: "concept_selection", picked: "concept-a" }),
  ];
}

describe("decision audit", () => {
  it("flags missing required categories as suggestions before edit and critical by edit", () => {
    expect(auditRequiredCategories("proposal", [], {}).map((finding) => finding.severity)).toEqual([
      "suggestion",
      "suggestion",
      "suggestion",
      "suggestion",
      "suggestion",
    ]);
    expect(auditRequiredCategories("edit", [], {}).map((finding) => finding.severity)).toContain("critical");
  });

  it("applies conditional required categories and one-of downgrade requirements", () => {
    expect(auditRequiredCategories("proposal", proposalCoverage(), { audioLed: true })).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        location: "decision_log.proposal.music_source",
      }),
    );
    expect(auditRequiredCategories("edit", proposalCoverage(), { deviatesFromScenePlan: true })).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Decision log is missing a required fallback or downgrade decision",
      }),
    );
  });

  it("requires provider selections per capability and model selections per multi-model provider", () => {
    const log: DecisionLog = [
      ...proposalCoverage(),
      decision({
        id: "provider-image",
        stage: "assets",
        category: "provider_selection",
        picked: "openai-image",
        scope: { capability: "image" },
      }),
    ];

    expect(
      auditRequiredCategories("assets", log, {
        capabilities: ["image", "tts"],
        providersWithMultipleModels: ["openai-image"],
      }),
    ).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        location: "decision_log.assets.model_selection",
      }),
    );
  });

  it("requires structured capability and provider scope instead of matching free text", () => {
    const log: DecisionLog = [
      ...proposalCoverage(),
      decision({
        id: "voice-script",
        stage: "assets",
        category: "provider_selection",
        picked: "voice-lab",
        reason: "voice-lab is the best provider for image generation mentions in this test",
      }),
      decision({
        id: "model-openai",
        stage: "assets",
        category: "model_selection",
        picked: "imagen-4",
        reason: "openai-image appears in text but no provider scope is set",
      }),
    ];

    const findings = auditRequiredCategories("assets", log, {
      capabilities: ["image"],
      providersWithMultipleModels: ["openai-image"],
    });

    expect(findings).toContainEqual(
      expect.objectContaining({
        location: "decision_log.assets.provider_selection",
        description: expect.stringContaining('capability "image"'),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        location: "decision_log.assets.model_selection",
        description: expect.stringContaining('provider "openai-image"'),
      }),
    );
  });

  it("flags all-confidence-1.0 patterns", () => {
    expect(auditConfidence([decision({ confidence: 1 }), decision({ id: "family", confidence: 1 })])).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Decision log confidence values are suspiciously uniform",
      }),
    );
    expect(auditConfidence([decision({ confidence: 1 }), decision({ id: "family", confidence: 0.7 })])).toEqual([]);
  });

  it("detects short boilerplate reasons without flagging real rationale", () => {
    expect(auditBoilerplateReason([decision({ reason: "best option" })])).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Decision reason is boilerplate",
      }),
    );
    expect(auditBoilerplateReason([decision({ reason: "best provider" })])).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Decision reason is boilerplate",
      }),
    );
    expect(auditBoilerplateReason([decision({ reason: "Only Remotion has the scene library available locally." })])).toEqual([]);
  });

  it("enforces present-both-runtimes rules", () => {
    expect(
      auditPresentBothRuntimes(
        [
          decision({
            picked: "remotion",
            options_considered: [
              { label: "hyperframes", rejected_because: "runtime not available on this machine" },
              { label: "ffmpeg", rejected_because: "still-image-only; brief requires motion-led delivery." },
            ],
          }),
        ],
        ["remotion"],
        true,
      ),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Runtime selection omitted available options",
        description: expect.stringContaining("remotion is available"),
      }),
    );

    expect(
      auditPresentBothRuntimes(
        [
          decision({
            picked: "remotion",
            options_considered: [
              { label: "hyperframes", rejected_because: "runtime not available on this machine" },
              { label: "ffmpeg", rejected_because: "still-image-only; brief requires motion-led delivery." },
            ],
          }),
        ],
        ["hyperframes", "ffmpeg"],
        true,
      ),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        description: expect.stringContaining('picked "remotion" is not present'),
      }),
    );

    expect(
      auditPresentBothRuntimes(
        [decision({ options_considered: [{ label: "ffmpeg", rejected_because: null }, { label: "other", rejected_because: null }] })],
        ["remotion", "hyperframes"],
        true,
      ),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Runtime selection omitted available options",
      }),
    );

    expect(
      auditPresentBothRuntimes([decision({ options_considered: [{ label: "remotion", rejected_because: null }, { label: "ffmpeg", rejected_because: null }] })], ["remotion", "hyperframes"], true),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Runtime selection omitted available options",
      }),
    );

    expect(
      auditPresentBothRuntimes(
        [
          decision({
            options_considered: [
              { label: "remotion", rejected_because: null },
              { label: "hyperframes", rejected_because: "runtime not available on this machine" },
            ],
          }),
        ],
        ["remotion"],
        true,
      ),
    ).toEqual([]);

    expect(auditPresentBothRuntimes([decision()], ["ffmpeg", "remotion", "hyperframes"], false)).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        description: expect.stringContaining("ffmpeg"),
      }),
    );

    expect(auditPresentBothRuntimes([decision()], ["ffmpeg", "remotion", "hyperframes"], true)).toEqual([]);
    expect(
      auditPresentBothRuntimes(
        [
          decision({
            options_considered: [
              { label: "remotion", rejected_because: null },
              { label: "ffmpeg", rejected_because: "still-image-only; brief requires motion-led delivery." },
            ],
          }),
        ],
        ["ffmpeg", "remotion"],
        true,
      ),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        description: expect.stringContaining("HyperFrames"),
      }),
    );
  });
});
