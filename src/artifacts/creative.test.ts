import { describe, expect, it } from "vitest";
import { AssetManifestSchema } from "./asset-manifest.js";
import { BriefSchema } from "./brief.js";
import { CreativeArtifactJsonSchemas, ProposalPacketJsonSchema, ScenePlanJsonSchema } from "./creative-json-schema.js";
import { ASSET_SOURCE, RENDERER_FAMILY } from "./enums.js";
import { EndTagPlanSchema } from "./end-tag-plan.js";
import { ProposalPacketSchema } from "./proposal-packet.js";
import { ResearchBriefSchema } from "./research-brief.js";
import { ScenePlanSchema } from "./scene-plan.js";
import { ScriptSchema } from "./script.js";

const proposal = {
  concept_options: [
    { slug: "one", hook: "A", treatment: "Treatment A" },
    { slug: "two", hook: "B", treatment: "Treatment B" },
    { slug: "three", hook: "C", treatment: "Treatment C" },
  ],
  production_plan: {
    render_runtime: "hyperframes",
    renderer_family: "explainer-data",
    audio_architecture: "single_narrator",
  },
  delivery_promise: {
    motion_led: true,
    narration_present: true,
    music_present: true,
  },
  decision_log_ref: "projects/show/episode/decisions.json",
};

const scenePlan = {
  scenes: [
    {
      slug: "opening-hook",
      order: 1,
      start_s: 0,
      end_s: 5,
      narrative_role: "hook",
      scene_anchor: "first downbeat",
      hero_moment: true,
      texture_keywords: ["neon", "rain"],
      character_actions: [{ character: "host", action: "points at headline wall" }],
      shot_language: {
        shot_size: "MS",
        camera_movement: "push_in",
        lighting_key: "neon",
        lens_mm: 35,
        depth_of_field: "shallow",
        color_temperature: "mixed",
      },
      required_assets: [{ id: "headline-wall", source: "generated" }],
    },
  ],
};

describe("creative artifact schemas", () => {
  it("exports JSON schemas for every creative artifact", () => {
    expect(Object.keys(CreativeArtifactJsonSchemas)).toEqual([
      "brief",
      "research_brief",
      "proposal_packet",
      "script",
      "scene_plan",
      "asset_manifest",
      "end_tag_plan",
    ]);

    for (const schema of Object.values(CreativeArtifactJsonSchemas)) {
      expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(schema.type).toBe("object");
    }
  });

  it("keeps creative JSON schema enum and cardinality surfaces explicit", () => {
    expect(JSON.stringify(ProposalPacketJsonSchema)).toContain("concept_options");
    expect(JSON.stringify(ProposalPacketJsonSchema)).toContain("\"minItems\":3");
    for (const family of RENDERER_FAMILY) {
      expect(JSON.stringify(ProposalPacketJsonSchema)).toContain(family);
    }
    for (const source of ASSET_SOURCE) {
      expect(JSON.stringify(ScenePlanJsonSchema)).toContain(source);
    }
  });

  it("accepts a brief fixture", () => {
    const brief = BriefSchema.parse({
      title: "Demo",
      audience: "Founders",
      platform: "YouTube",
      tone: "sharp",
      duration_s: 60,
      hook: "The workflow is leaking hours.",
      key_points: ["manual setup", "repeatable system"],
      notes: "Keep it concise.",
    });

    expect(brief.title).toBe("Demo");
  });

  it("accepts a research brief fixture", () => {
    const research = ResearchBriefSchema.parse({
      topic_exploration: "Market pressure around short-form video production",
      sources: [{ url: "https://example.test/report", title: "Report" }],
      findings: [{ claim: "Teams need repeatable pre-production.", evidence: "Source summary" }],
    });

    expect(research.findings).toHaveLength(1);
  });

  it("accepts a proposal packet fixture", () => {
    expect(ProposalPacketSchema.parse(proposal).production_plan.renderer_family).toBe("explainer-data");
  });

  it("rejects proposal packets with fewer than three concepts", () => {
    expect(() =>
      ProposalPacketSchema.parse({
        ...proposal,
        concept_options: proposal.concept_options.slice(0, 2),
      }),
    ).toThrow("Array must contain at least 3 element(s)");
  });

  it("rejects unknown renderer families", () => {
    expect(() =>
      ProposalPacketSchema.parse({
        ...proposal,
        production_plan: {
          ...proposal.production_plan,
          renderer_family: "unknown-family",
        },
      }),
    ).toThrow("Invalid enum value");
  });

  it("accepts a script fixture", () => {
    const script = ScriptSchema.parse({
      sections: [
        {
          slug: "intro",
          role: "hook",
          start_s: 0,
          end_s: 10,
          narration: "Here is the setup.",
          dialogue: [{ character: "host", line: "Watch this." }],
          enhancement_cues: ["cut on beat"],
        },
      ],
    });

    expect(script.sections[0]?.dialogue).toHaveLength(1);
  });

  it("accepts a scene plan fixture", () => {
    expect(ScenePlanSchema.parse(scenePlan).scenes[0]?.shot_language.lens_mm).toBe(35);
  });

  it("rejects unknown shot sizes", () => {
    expect(() =>
      ScenePlanSchema.parse({
        scenes: [
          {
            ...scenePlan.scenes[0],
            shot_language: {
              ...scenePlan.scenes[0].shot_language,
              shot_size: "MEDIUM",
            },
          },
        ],
      }),
    ).toThrow("Invalid enum value");
  });

  it("rejects unsupported lens lengths", () => {
    expect(() =>
      ScenePlanSchema.parse({
        scenes: [
          {
            ...scenePlan.scenes[0],
            shot_language: {
              ...scenePlan.scenes[0].shot_language,
              lens_mm: 28,
            },
          },
        ],
      }),
    ).toThrow("Invalid input");
  });

  it("rejects negative scene order", () => {
    expect(() =>
      ScenePlanSchema.parse({
        scenes: [{ ...scenePlan.scenes[0], order: -1 }],
      }),
    ).toThrow("Number must be greater than or equal to 0");
  });

  it("rejects unknown required asset sources", () => {
    expect(() =>
      ScenePlanSchema.parse({
        scenes: [
          {
            ...scenePlan.scenes[0],
            required_assets: [{ id: "bad", source: "prompted" }],
          },
        ],
      }),
    ).toThrow("Invalid enum value");
  });

  it("accepts an asset manifest fixture", () => {
    const manifest = AssetManifestSchema.parse({
      assets: [
        {
          id: "hero",
          kind: "image",
          path: "assets/hero.png",
          scene_ref: "opening-hook",
          provider: "openai",
          model: "image-model",
          seed: 42,
          prompt: "A neon headline wall",
          cost_usd: 0.12,
        },
      ],
    });

    expect(manifest.assets[0]?.id).toBe("hero");
  });

  it("accepts an end tag plan fixture", () => {
    expect(
      EndTagPlanSchema.parse({
        mode: "overlay",
        text: "Subscribe for the next cut",
        placement_seconds_from_end: 4,
        style_ref: "brand/end-tag",
      }).mode,
    ).toBe("overlay");
  });

  it("rejects negative end tag placement", () => {
    expect(() =>
      EndTagPlanSchema.parse({
        mode: "concat",
        text: "The End",
        placement_seconds_from_end: -1,
      }),
    ).toThrow("Number must be greater than or equal to 0");
  });
});
