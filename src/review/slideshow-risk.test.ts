import { describe, expect, it } from "vitest";
import { detectEditRegression, scoreSlideshowRisk } from "./slideshow-risk.js";

type TestScene = Record<string, unknown>;

function scene(overrides: TestScene = {}): TestScene {
  return {
    description: "rain-slicked alley with reflected signage",
    information_role: "establish location",
    shot_intent: "orient the viewer to the opening location",
    cut_type: "video_clip",
    shot_language: {
      shot_size: "CU",
      camera_movement: "dolly_in",
      lighting_key: "neon",
    },
    ...overrides,
  };
}

const variedScenes: TestScene[] = [
  scene({
    description: "rain-slicked alley with reflected signage",
    cut_type: "video_clip",
    shot_language: { shot_size: "CU", camera_movement: "dolly_in", lighting_key: "neon" },
    hero_moment: true,
  }),
  scene({
    description: "handheld pass through a crowded train platform",
    cut_type: "animation",
    shot_language: { shot_size: "WS", camera_movement: "handheld", lighting_key: "natural" },
  }),
  scene({
    description: "macro insert of a cracked phone screen",
    cut_type: "motion_graphic",
    shot_language: { shot_size: "ECU", camera_movement: "static", lighting_key: "practical" },
  }),
  scene({
    description: "low angle silhouette crossing under sodium lights",
    cut_type: "generated_clip",
    shot_language: { shot_size: "MS", camera_movement: "truck_left", lighting_key: "low_key" },
  }),
  scene({
    description: "overhead view of receipts scattered on glass",
    cut_type: "source_clip",
    shot_language: { shot_size: "EWS", camera_movement: "pan_right", lighting_key: "hard" },
  }),
];

describe("scoreSlideshowRisk", () => {
  it("returns a strong pass path for varied scenes", () => {
    const result = scoreSlideshowRisk(variedScenes, undefined, "cinematic-trailer");

    expect(result.score).toBe(0);
    expect(result.verdict).toBe("strong");
    expect(result.findings).toEqual([]);
  });

  it("flags repetition at the per-dimension threshold", () => {
    const result = scoreSlideshowRisk(
      Array.from({ length: 5 }, (_, index) =>
        scene({
          description: index === 0 ? "same repeated location" : "same repeated location",
          cut_type: "text_card",
          shot_language: { shot_size: "CU", camera_movement: "static", lighting_key: "natural" },
        }),
      ),
      undefined,
      "explainer-data",
    );

    expect(result.dimensions.repetition.score).toBeGreaterThanOrEqual(3);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        title: "repetition",
        description: "5 scenes use the same layout/shot size — vary the visual grammar",
      }),
    );
  });

  it("flags decorative visuals at the per-dimension threshold", () => {
    const result = scoreSlideshowRisk(
      Array.from({ length: 5 }, (_, index) =>
        scene({
          information_role: index === 0 ? "introduce the premise" : undefined,
          shot_intent: index === 0 ? "anchor the hook" : undefined,
          description: `specific visual ${index}`,
          shot_language: { shot_size: ["CU", "WS", "MS", "EWS", "ECU"][index], camera_movement: "static", lighting_key: "natural" },
        }),
      ),
      undefined,
      "explainer-data",
    );

    expect(result.dimensions.decorative_visuals.score).toBeGreaterThanOrEqual(3);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        title: "decorative_visuals",
        description: "4 scenes have no stated purpose (no information_role or shot_intent)",
      }),
    );
  });

  it("flags weak motion at the per-dimension threshold", () => {
    const result = scoreSlideshowRisk(
      Array.from({ length: 4 }, (_, index) =>
        scene({
          description: `specific moving visual ${index}`,
          information_role: undefined,
          shot_intent: undefined,
          narrative_role: undefined,
          shot_language: {
            shot_size: ["CU", "WS", "MS", "EWS"][index],
            camera_movement: "dolly_in",
            lighting_key: "natural",
          },
        }),
      ),
      undefined,
      "explainer-data",
    );

    expect(result.dimensions.weak_motion.score).toBeGreaterThanOrEqual(3);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        title: "weak_motion",
        description: "Camera movement exists but lacks narrative justification",
      }),
    );
  });

  it("flags missing shot intent at the per-dimension threshold", () => {
    const result = scoreSlideshowRisk(
      Array.from({ length: 4 }, (_, index) =>
        scene({
          description: `specific intent gap visual ${index}`,
          information_role: "carry a fact",
          shot_intent: undefined,
          shot_language: {
            shot_size: ["CU", "WS", "MS", "EWS"][index],
            camera_movement: "static",
            lighting_key: "natural",
          },
        }),
      ),
      undefined,
      "explainer-data",
    );

    expect(result.dimensions.weak_shot_intent.score).toBeGreaterThanOrEqual(3);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        title: "weak_shot_intent",
        description: "4 scenes are missing shot_intent — why does this frame exist?",
      }),
    );
  });

  it("flags typography overreliance at the per-dimension threshold", () => {
    const result = scoreSlideshowRisk(
      variedScenes,
      {
        cuts: [
          { cut_type: "text_card" },
          { cut_type: "stat_card" },
          { cut_type: "text_card" },
          { cut_type: "stat_card" },
          { cut_type: "video_clip" },
        ],
      },
      "explainer-data",
    );

    expect(result.dimensions.typography_overreliance.score).toBe(4.0);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        title: "typography_overreliance",
        description: "80% of scenes are text/stat cards — video feels like animated slides",
      }),
    );
  });

  it("flags unsupported cinematic claims at the per-dimension threshold", () => {
    const result = scoreSlideshowRisk(
      variedScenes.map((item, index) =>
        scene({
          ...item,
          hero_moment: false,
          shot_language: {
            shot_size: ["CU", "WS", "MS", "EWS", "ECU"][index],
            camera_movement: "static",
            lighting_key: "natural",
          },
        }),
      ),
      undefined,
      "cinematic-trailer",
    );

    expect(result.dimensions.unsupported_cinematic_claims.score).toBeGreaterThanOrEqual(3);
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        title: "unsupported_cinematic_claims",
        description: "Claiming cinematic but missing hero moments / lighting / movement",
      }),
    );
  });

  it("returns the empty-scene fail special case", () => {
    const result = scoreSlideshowRisk([], undefined, "cinematic-trailer");

    expect(result.score).toBe(5.0);
    expect(result.verdict).toBe("fail");
  });

  it("uses the cinematic-only branch for non-cinematic renderer families", () => {
    const result = scoreSlideshowRisk(variedScenes, undefined, "explainer-data");

    expect(result.dimensions.unsupported_cinematic_claims).toEqual({
      score: 0.0,
      reason: "Not applicable for non-cinematic renderer_family",
    });
  });
});

describe("detectEditRegression", () => {
  it("flags edit-stage risk increases as critical edit_regression findings", () => {
    const findings = detectEditRegression({ score: 1.2 }, { score: 2.8 });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "edit_regression",
      }),
    );
  });

  it("does not flag edit-stage scores that hold or improve", () => {
    expect(detectEditRegression({ score: 2.8 }, { score: 2.8 })).toEqual([]);
    expect(detectEditRegression({ score: 2.8 }, { score: 1.2 })).toEqual([]);
  });
});
