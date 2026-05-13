import { describe, expect, it } from "vitest";
import type { Cuesheet } from "../artifacts/cuesheet.js";
import type { ScenePlan } from "../artifacts/scene-plan.js";
import { alignScenes } from "./align.js";

describe("alignScenes", () => {
  it("anchors every scene and clamps duration to the configured maximum", () => {
    const anchors = alignScenes(scenePlan(), cuesheet(), {
      master: "audio",
      snap_to: ["section_start", "downbeat"],
      max_scene_duration_s: 5,
    });

    expect(anchors).toHaveLength(3);
    expect(anchors.map((anchor) => anchor.scene_id)).toEqual(["intro", "hero", "outro"]);
    expect(anchors.every((anchor) => anchor.end_s - anchor.start_s <= 5)).toBe(true);
    expect(anchors[0]).toMatchObject({ start_s: 0, snapped_to: "section_start", source: { section: "intro" } });
  });

  it("forces the declared hero scene onto the nearest climax point", () => {
    const anchors = alignScenes(scenePlan(), cuesheet(), {
      master: "audio",
      snap_to: ["section_start", "downbeat"],
      align_climax_scene_to: "hero",
      max_scene_duration_s: 5,
    });
    const hero = anchors.find((anchor) => anchor.scene_id === "hero");

    expect(hero?.snapped_to).toBe("climax");
    expect(Math.abs((hero?.start_s ?? 0) - 8.1)).toBeLessThanOrEqual(0.2);
    expect(hero?.source).toEqual({ climax_index: 0 });
  });

  it("falls back to a manual anchor when no snap target qualifies", () => {
    const anchors = alignScenes(scenePlan(), { ...cuesheet(), sections: [], beats: [] }, {
      master: "audio",
      snap_to: ["section_start", "downbeat"],
      max_scene_duration_s: 5,
    });

    expect(anchors[0]).toMatchObject({ start_s: 0, snapped_to: "manual", source: {} });
  });

  it("honors manual snap priority when requested explicitly", () => {
    const anchors = alignScenes(scenePlan(), cuesheet(), {
      master: "audio",
      snap_to: ["manual", "section_start"],
      max_scene_duration_s: 5,
    });

    expect(anchors[1]).toMatchObject({ start_s: 7.9, snapped_to: "manual", source: {} });
  });
});

function cuesheet(): Cuesheet {
  return {
    audio: {
      path: "/tmp/track.wav",
      duration_s: 16,
      sample_rate: 44_100,
      channels: 2,
    },
    master_clock: "audio",
    bpm: 120,
    segments: [
      {
        start_s: 0,
        end_s: 2,
        text: "hello world",
        words: [
          { text: "hello", start_s: 0.2, end_s: 0.7, confidence: 0.99 },
          { text: "world", start_s: 1.1, end_s: 1.6, confidence: 0.98 },
        ],
      },
    ],
    sections: [
      { label: "intro", start_s: 0, end_s: 4, kind: "instrumental", energy: 0.4 },
      { label: "chorus", start_s: 8, end_s: 12, kind: "vocal", energy: 1 },
    ],
    beats: Array.from({ length: 32 }, (_value, index) => ({
      time_s: index * 0.5,
      strength: 1,
      is_downbeat: index % 4 === 0,
    })),
    climax: [{ time_s: 8.1, type: "peak", intensity: 1, source: "algorithm" }],
    scene_anchors: [],
  };
}

function scenePlan(): ScenePlan {
  return {
    scenes: [
      scene("intro", 0, 0, 6, "hook"),
      scene("hero", 1, 7.9, 14, "climax"),
      scene("outro", 2, 14.2, 16, "resolution"),
    ],
  };
}

function scene(
  slug: string,
  order: number,
  start_s: number,
  end_s: number,
  narrative_role: ScenePlan["scenes"][number]["narrative_role"],
): ScenePlan["scenes"][number] {
  return {
    slug,
    order,
    start_s,
    end_s,
    narrative_role,
    scene_anchor: slug,
    hero_moment: slug === "hero",
    texture_keywords: [],
    character_actions: [],
    shot_language: {
      shot_size: "MS",
      camera_movement: "static",
      lighting_key: "natural",
      lens_mm: 35,
      depth_of_field: "deep",
      color_temperature: "daylight",
    },
    required_assets: [],
  };
}
