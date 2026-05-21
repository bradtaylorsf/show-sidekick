import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { PlaybookSchema as ArtifactPlaybookSchema } from "../artifacts/playbook.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { PlaybookSchema as ReviewPlaybookSchema } from "../shows/playbook.js";
import { generatePlaybook } from "./generator.js";
import { BundledPlaybookSchema } from "./schema.js";

const bundledPlaybooksDir = fileURLToPath(new URL("../../bundled/playbooks/", import.meta.url));
const schemaPath = fileURLToPath(new URL("../../bundled/schemas/styles/playbook.schema.json", import.meta.url));

const starterPlaybooks = [
  "beat-synced-lyric-video.yaml",
  "clean-professional.yaml",
  "flat-motion-graphics.yaml",
  "minimalist-diagram.yaml",
  "anime-ghibli.yaml",
  "news-broadcast.yaml",
  "news-song-protest.yaml",
  "news-song.yaml",
  "playful-hip-hop-explainer.yaml",
  "ps2-dystopian-news-rap.yaml",
];

describe("playbook generator", () => {
  it("infers a schema-valid playbook from a plain brief", () => {
    const playbook = generatePlaybook("A cinematic trailer about a signal from the future");

    expect(playbook.identity.category).toBe("cinematic");
    expect(playbook.visual_language.color_palette.primary.length).toBeGreaterThan(0);
    expect(playbook.motion.transitions.length).toBeGreaterThan(0);
    expect(playbook.motion.pacing_rules.max_scene_hold_seconds).toBeGreaterThanOrEqual(
      playbook.motion.pacing_rules.min_scene_hold_seconds,
    );
    expect(playbook.asset_generation.consistency_anchors.length).toBeGreaterThan(0);
  });

  it("infers pacing and motion from a VideoAnalysisBrief", () => {
    const brief: VideoAnalysisBrief = {
      pacing_style: "fast energetic",
      promise_elements: ["kinetic motion", "high-energy cuts"],
      scenes: [
        scene("hero", "motion_clip"),
        scene("product", "motion_clip"),
        scene("diagram", "animated_still"),
      ],
    };

    const playbook = generatePlaybook({ name: "Reference Variant", videoAnalysisBrief: brief });

    expect(playbook.identity.name).toBe("Reference Variant");
    expect(playbook.identity.category).toBe("cinematic");
    expect(playbook.style_cues).toEqual(expect.arrayContaining([expect.stringContaining("cinematic")]));
  });
});

describe("bundled starter playbooks", () => {
  it("ships the accepted starter set and validates each playbook shape", async () => {
    const files = (await readdir(bundledPlaybooksDir)).filter((file) => file.endsWith(".yaml"));

    expect(files).toEqual(expect.arrayContaining(starterPlaybooks));

    for (const file of starterPlaybooks) {
      const raw = await readFile(path.join(bundledPlaybooksDir, file), "utf8");
      const parsed = parseYaml(raw) as unknown;

      expect(() => BundledPlaybookSchema.parse(parsed), file).not.toThrow();
      expect(() => ReviewPlaybookSchema.parse(parsed), file).not.toThrow();
      expect(() => ArtifactPlaybookSchema.parse(parsed), file).not.toThrow();
    }
  });

  it("keeps the JSON schema aligned with required acceptance fields", async () => {
    const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(schema.required).toEqual(
      expect.arrayContaining(["identity", "visual_language", "typography", "motion", "audio", "asset_generation", "quality_rules"]),
    );
    expect(schema.properties).toEqual(
      expect.objectContaining({
        palette: expect.any(Object),
        transitions_allowed: expect.any(Object),
        pacing: expect.any(Object),
        typography: expect.any(Object),
        motion: expect.any(Object),
        audio: expect.any(Object),
        asset_generation: expect.any(Object),
        quality_rules: expect.any(Object),
      }),
    );
  });
});

function scene(subject: string, motion_type: VideoAnalysisBrief["scenes"][number]["motion_type"]): VideoAnalysisBrief["scenes"][number] {
  return {
    subject: [subject],
    subject_motion: ["moving"],
    scene: ["studio"],
    spatial_framing: ["centered"],
    camera: ["push-in"],
    motion_type,
    flow_variance: 0.5,
  };
}
