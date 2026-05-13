import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_SPECIFICITY_EXAMPLE,
  GENERIC_PHRASES,
  checkSceneVariation,
} from "./scene-variation.js";

type TestScene = Record<string, unknown>;

const expectedGenericPhrases = [
  "beautiful",
  "stunning",
  "amazing",
  "epic",
  "cinematic shot",
  "wide shot",
  "close up",
  "the scene",
  "the moment",
  "a person",
  "someone",
  "people",
  "a place",
  "a view",
  "showing",
  "depicting",
  "featuring",
  "highlighting",
  "visualizing",
  "demonstrating",
  "illustrating",
] as const;

function scene(index: number, overrides: TestScene = {}): TestScene {
  const shotSizes = ["ECU", "CU", "MS", "WS", "EWS", "CU", "MS", "WS"];
  const movements = ["dolly_in", "pan_right", "truck_left", "orbit_cw", "static", "push_in", "tilt_up", "handheld"];
  const lighting = ["neon", "natural", "low_key", "practical", "hard", "soft", "rim", "blue_hour"];

  return {
    description: `rain-slicked intersection detail ${index}`,
    texture_keywords: index === 0 ? ["wet asphalt"] : [],
    shot_intent: `make beat ${index} visually distinct`,
    shot_language: {
      shot_size: shotSizes[index % shotSizes.length],
      camera_movement: movements[index % movements.length],
      lighting_key: lighting[index % lighting.length],
    },
    ...overrides,
  };
}

function variedScenes(count = 5): TestScene[] {
  return Array.from({ length: count }, (_, index) => scene(index));
}

function scenesWithGenericDescriptions(count: number, total = 8): TestScene[] {
  return Array.from({ length: total }, (_, index) =>
    scene(index, {
      description:
        index < count
          ? `beautiful filler phrase ${index}`
          : `rain-slicked storefront reflection ${index}`,
    }),
  );
}

describe("checkSceneVariation", () => {
  it("exports the expected generic phrase list and worked example", () => {
    expect(GENERIC_PHRASES).toEqual(expectedGenericPhrases);
    expect(DESCRIPTION_SPECIFICITY_EXAMPLE).toBe(
      "Instead of 'a beautiful cityscape', try 'rain-slicked Tokyo intersection at night, neon reflections on wet asphalt'",
    );
  });

  it("returns zero violations for a varied scene plan", () => {
    const result = checkSceneVariation(variedScenes());

    expect(result).toMatchObject({
      score: 0,
      verdict: "poor",
      violations: [],
    });
  });

  it("flags shot_size_variety violations", () => {
    const result = checkSceneVariation([
      scene(0, { shot_language: { shot_size: "CU", camera_movement: "dolly_in", lighting_key: "neon" } }),
      scene(1, { shot_language: { shot_size: "CU", camera_movement: "pan_right", lighting_key: "natural" } }),
      scene(2, { shot_language: { shot_size: "MS", camera_movement: "truck_left", lighting_key: "neon" } }),
      scene(3, { shot_language: { shot_size: "MS", camera_movement: "orbit_cw", lighting_key: "natural" } }),
    ]);

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "shot_size_variety" }));
  });

  it("flags consecutive_same_size_shots violations", () => {
    const result = checkSceneVariation([
      scene(0, { shot_language: { shot_size: "CU", camera_movement: "dolly_in", lighting_key: "neon" } }),
      scene(1, { shot_language: { shot_size: "CU", camera_movement: "pan_right", lighting_key: "natural" } }),
      scene(2, { shot_language: { shot_size: "CU", camera_movement: "truck_left", lighting_key: "low_key" } }),
      scene(3, { shot_language: { shot_size: "MS", camera_movement: "orbit_cw", lighting_key: "practical" } }),
      scene(4, { shot_language: { shot_size: "EWS", camera_movement: "push_in", lighting_key: "hard" } }),
    ]);

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "consecutive_same_size_shots" }));
  });

  it("flags static_shot_overuse violations", () => {
    const result = checkSceneVariation(
      variedScenes(4).map((item, index) =>
        scene(index, {
          ...item,
          shot_language: {
            shot_size: ["ECU", "CU", "MS", "WS"][index],
            camera_movement: index < 3 ? "static" : "dolly_in",
            lighting_key: index % 2 === 0 ? "neon" : "natural",
          },
        }),
      ),
    );

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "static_shot_overuse" }));
  });

  it("flags lighting_variety violations", () => {
    const result = checkSceneVariation(
      variedScenes(4).map((item, index) =>
        scene(index, {
          ...item,
          shot_language: {
            shot_size: ["ECU", "CU", "MS", "WS"][index],
            camera_movement: "dolly_in",
            lighting_key: "natural",
          },
        }),
      ),
    );

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "lighting_variety" }));
  });

  it("flags hero_moment_distinctness violations", () => {
    const result = checkSceneVariation([
      scene(0, { shot_language: { shot_size: "ECU", camera_movement: "dolly_in", lighting_key: "neon" } }),
      scene(1, { shot_language: { shot_size: "CU", camera_movement: "pan_right", lighting_key: "natural" } }),
      scene(2, { hero_moment: true, shot_language: { shot_size: "CU", camera_movement: "truck_left", lighting_key: "low_key" } }),
      scene(3, { shot_language: { shot_size: "WS", camera_movement: "orbit_cw", lighting_key: "practical" } }),
      scene(4, { shot_language: { shot_size: "EWS", camera_movement: "push_in", lighting_key: "hard" } }),
    ]);

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "hero_moment_distinctness" }));
  });

  it("flags description_specificity violations", () => {
    const result = checkSceneVariation([
      scene(0, { description: "a beautiful cityscape" }),
      ...variedScenes(3).map((item, index) => scene(index + 1, item)),
    ]);

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        check: "description_specificity",
        scene_index: 0,
        message: expect.stringContaining(DESCRIPTION_SPECIFICITY_EXAMPLE),
      }),
    );
  });

  it("flags texture_keywords_presence violations", () => {
    const result = checkSceneVariation(variedScenes(4).map((item) => ({ ...item, texture_keywords: [] })));

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "texture_keywords_presence" }));
  });

  it("flags shot_intent_completeness violations", () => {
    const result = checkSceneVariation([
      scene(0),
      scene(1),
      scene(2, { shot_intent: "" }),
      scene(3),
    ]);

    expect(result.violations).toContainEqual(expect.objectContaining({ check: "shot_intent_completeness" }));
  });

  it("uses the lighter rubric for plans shorter than four scenes", () => {
    const result = checkSceneVariation([
      scene(0, { shot_language: { shot_size: "CU", camera_movement: "static", lighting_key: "neon" } }),
      scene(1, { shot_language: { shot_size: "CU", camera_movement: "static", lighting_key: "neon" } }),
      scene(2, { shot_language: { shot_size: "CU", camera_movement: "static", lighting_key: "neon" } }),
    ]);

    expect(result.violations).toEqual([]);
  });

  it("applies the documented score and verdict thresholds", () => {
    expect(checkSceneVariation(scenesWithGenericDescriptions(0)).verdict).toBe("poor");
    expect(checkSceneVariation(scenesWithGenericDescriptions(4)).score).toBe(2.4);
    expect(checkSceneVariation(scenesWithGenericDescriptions(4)).verdict).toBe("fair");
    expect(checkSceneVariation(scenesWithGenericDescriptions(5)).score).toBe(3.0);
    expect(checkSceneVariation(scenesWithGenericDescriptions(5)).verdict).toBe("good");
    expect(checkSceneVariation(scenesWithGenericDescriptions(7)).score).toBe(4.2);
    expect(checkSceneVariation(scenesWithGenericDescriptions(7)).verdict).toBe("excellent");
  });

  it("catches every generic phrase case-insensitively", () => {
    GENERIC_PHRASES.forEach((phrase) => {
      const result = checkSceneVariation([
        scene(0, { description: `specific setup with ${phrase.toUpperCase()}` }),
        scene(1),
        scene(2),
        scene(3),
      ]);

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          check: "description_specificity",
          scene_index: 0,
        }),
      );
    });
  });
});
