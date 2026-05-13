import { describe, expect, it } from "vitest";
import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import type { EditDecisions } from "../artifacts/edit-decisions.js";
import type { RendererFamily, RenderRuntime } from "../artifacts/enums.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import type { Playbook } from "../shows/playbook.js";
import { checkCreativeDifferentiation } from "./creative-differentiation.js";

type TestScene = Record<string, unknown>;

function proposalPacket(overrides: Partial<ProposalPacket["production_plan"]> = {}): ProposalPacket {
  return {
    concept_options: [
      { slug: "a", hook: "hook a", treatment: "treatment a" },
      { slug: "b", hook: "hook b", treatment: "treatment b" },
      { slug: "c", hook: "hook c", treatment: "treatment c" },
    ],
    production_plan: {
      render_runtime: "remotion",
      renderer_family: "explainer-data",
      audio_architecture: "no_narration",
      ...overrides,
    },
    delivery_promise: {
      motion_led: true,
      narration_present: false,
      music_present: true,
    },
    decision_log_ref: "projects/demo/episode/decisions.json",
  };
}

function editDecisions(overrides: { renderer_family?: RendererFamily; render_runtime?: RenderRuntime } = {}): EditDecisions {
  return {
    cuts: [],
    overlays: [],
    render_runtime: overrides.render_runtime ?? "remotion",
    renderer_family: overrides.renderer_family ?? "explainer-data",
  };
}

function renderReport(runtime: RenderRuntime): RenderReport {
  return {
    output_path: "renders/final.mp4",
    encoding_profile: "h264",
    duration_s: 12,
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    runtime_used: runtime,
    asset_count: 2,
    warnings: [],
    validation_steps: [],
  };
}

function variedScene(index: number, overrides: TestScene = {}): TestScene {
  const shotSizes = ["ECU", "CU", "MS", "WS", "EWS", "CU", "MS", "WS"];
  const movements = ["dolly_in", "pan_right", "truck_left", "orbit_cw", "push_in", "tilt_up", "handheld", "crane_up"];
  const lighting = ["neon", "natural", "low_key", "practical", "hard", "soft", "rim", "blue_hour"];

  return {
    description: `rain-slicked intersection detail ${index}`,
    texture_keywords: index === 0 ? ["wet asphalt"] : [],
    shot_intent: `make beat ${index} visually distinct`,
    shot_language: {
      shot_size: shotSizes[index % shotSizes.length],
      camera_movement: movements[index % movements.length],
      lighting_key: lighting[index % lighting.length],
      lens_mm: 35,
      depth_of_field: "deep",
      color_temperature: "daylight",
    },
    ...overrides,
  };
}

function variedScenes(count = 8): TestScene[] {
  return Array.from({ length: count }, (_, index) => variedScene(index));
}

function lowVariationScenes(): TestScene[] {
  return Array.from({ length: 5 }, (_, index) =>
    variedScene(index, {
      description: `beautiful generic setup ${index}`,
      texture_keywords: [],
      shot_language: {
        shot_size: "CU",
        camera_movement: "static",
        lighting_key: "natural",
        lens_mm: 35,
        depth_of_field: "deep",
        color_temperature: "daylight",
      },
    }),
  );
}

function playbook(overrides: Partial<Playbook> = {}): Playbook {
  return {
    palette: ["#112233"],
    transitions_allowed: ["cut"],
    pacing: { min_scene_s: 2, max_scene_s: 6 },
    style_cues: ["crisp"],
    ...overrides,
  };
}

function decision(overrides: Partial<DecisionEntry>): DecisionEntry {
  return {
    id: "decision-1",
    stage: "proposal",
    timestamp: "2026-05-12T15:18:42Z",
    category: "render_runtime_selection",
    options_considered: [
      { label: "remotion", rejected_because: null },
      { label: "hyperframes", rejected_because: null },
    ],
    picked: "remotion",
    reason: "Remotion fits the current brief.",
    confidence: 0.8,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}

function runtimeDecision(options: string[], picked = options[0] ?? "remotion"): DecisionEntry {
  return decision({
    id: "render-runtime",
    category: "render_runtime_selection",
    options_considered: options.map((label) => ({ label, rejected_because: null })),
    picked,
  });
}

function findingTitles(stageSlug: string, artifact: unknown, ctx = {}) {
  return checkCreativeDifferentiation(stageSlug, artifact, ctx).map((finding) => finding.title);
}

describe("checkCreativeDifferentiation", () => {
  it("passes scenes whose V-6 variation result converts above the V-7 threshold", () => {
    expect(findingTitles("scene_plan", { scenes: variedScenes() })).not.toContain(
      "Variation score is below creative differentiation threshold",
    );
  });

  it("flags variation scores at suggestion and critical thresholds", () => {
    const suggestionScenes = variedScenes().map((scene, index) =>
      index < 4 ? { ...scene, description: `beautiful generic setup ${index}` } : scene,
    );

    expect(checkCreativeDifferentiation("scene_plan", { scenes: suggestionScenes }, {})).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Variation score is below creative differentiation threshold",
      }),
    );
    expect(checkCreativeDifferentiation("scene_plan", { scenes: lowVariationScenes() }, {})).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Variation score is below creative differentiation threshold",
      }),
    );
  });

  it("passes playbook alignment unless a clean-professional marker conflicts with cinematic trailer", () => {
    const proposal = proposalPacket({ renderer_family: "cinematic-trailer" });

    expect(findingTitles("proposal", proposal, { proposal, playbook: playbook() })).not.toContain(
      "Cinematic trailer renderer family conflicts with clean-professional playbook",
    );
    expect(
      checkCreativeDifferentiation("proposal", proposal, {
        proposal,
        playbook: { ...playbook(), slug: "clean-professional" } as Playbook & { slug: string },
      }),
    ).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Cinematic trailer renderer family conflicts with clean-professional playbook",
      }),
    );
  });

  it("passes complete shot language and flags missing scene fields", () => {
    const completeHero = variedScene(0, { hero_moment: true });
    const missingBasic = variedScene(1, { shot_intent: "" });
    const missingHeroField = variedScene(2, {
      hero_moment: true,
      shot_language: {
        shot_size: "CU",
        camera_movement: "dolly_in",
        lighting_key: "neon",
        depth_of_field: "deep",
        color_temperature: "daylight",
      },
    });

    expect(findingTitles("scene_plan", { scenes: [completeHero] })).not.toContain("Scene shot language is incomplete");
    expect(checkCreativeDifferentiation("scene_plan", { scenes: [missingBasic] }, {})).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Scene shot language is incomplete",
        location: "scene_plan.scenes[0]",
      }),
    );
    expect(checkCreativeDifferentiation("scene_plan", { scenes: [missingHeroField] }, {})).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Hero moment shot language is incomplete",
        location: "scene_plan.scenes[0].shot_language",
      }),
    );
  });

  it("checks edit renderer_family against the proposal unless the change is logged", () => {
    const proposal = proposalPacket({ renderer_family: "cinematic-trailer" });
    const edit = editDecisions({ renderer_family: "explainer-data" });
    const loggedChange: DecisionLog = [
      decision({
        id: "renderer-family-edit",
        stage: "edit",
        category: "renderer_family_selection",
        picked: "explainer-data",
      }),
    ];

    expect(
      checkCreativeDifferentiation("edit", edit, {
        proposal,
        editDecisions: edit,
      }),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Renderer family changed without a decision log entry",
      }),
    );
    expect(
      findingTitles("edit", edit, {
        proposal,
        editDecisions: edit,
        decisionLog: loggedChange,
      }),
    ).not.toContain("Renderer family changed without a decision log entry");
  });

  it("checks render_runtime at edit and compose unless the change is logged", () => {
    const proposal = proposalPacket({ render_runtime: "hyperframes" });
    const edit = editDecisions({ render_runtime: "remotion" });
    const loggedChange: DecisionLog = [
      decision({
        id: "runtime-edit",
        stage: "edit",
        category: "render_runtime_selection",
        picked: "remotion",
      }),
    ];

    expect(checkCreativeDifferentiation("edit", edit, { proposal, editDecisions: edit })).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Render runtime changed without a decision log entry",
        location: "edit_decisions.render_runtime",
      }),
    );
    expect(findingTitles("edit", edit, { proposal, editDecisions: edit, decisionLog: loggedChange })).not.toContain(
      "Render runtime changed without a decision log entry",
    );
    expect(checkCreativeDifferentiation("compose", renderReport("remotion"), { proposal })).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Render runtime changed without a decision log entry",
        location: "render_report.runtime_used",
      }),
    );
    expect(findingTitles("compose", renderReport("hyperframes"), { proposal })).not.toContain(
      "Render runtime changed without a decision log entry",
    );
  });

  it("requires proposal runtime selection to present Remotion, HyperFrames, and applicable ffmpeg options", () => {
    const proposal = proposalPacket();
    const allRuntimeOptions = [runtimeDecision(["remotion", "hyperframes", "ffmpeg"])];

    expect(
      findingTitles("proposal", proposal, {
        decisionLog: [runtimeDecision(["remotion", "hyperframes"])],
        availableRuntimes: ["remotion", "hyperframes"],
      }),
    ).not.toContain("Runtime selection omitted available options");
    expect(
      findingTitles("proposal", proposal, {
        decisionLog: allRuntimeOptions,
        availableRuntimes: ["ffmpeg", "remotion", "hyperframes"],
        motionRequired: false,
      }),
    ).not.toContain("Runtime selection omitted available options");
    expect(
      checkCreativeDifferentiation("proposal", proposal, {
        decisionLog: [runtimeDecision(["remotion", "ffmpeg"])],
        availableRuntimes: ["remotion", "hyperframes", "ffmpeg"],
        motionRequired: false,
      }),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Runtime selection omitted available options",
        description: expect.stringContaining("hyperframes"),
      }),
    );
    expect(
      checkCreativeDifferentiation("proposal", proposal, {
        decisionLog: [runtimeDecision(["remotion", "hyperframes"])],
        availableRuntimes: ["ffmpeg", "remotion", "hyperframes"],
        motionRequired: false,
      }),
    ).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Runtime selection omitted available options",
        description: expect.stringContaining("ffmpeg"),
      }),
    );
  });
});
