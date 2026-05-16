import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactJsonSchemas } from "./json-schema.js";

const bundledArtifactSchemasDir = fileURLToPath(new URL("../../bundled/schemas/artifacts/", import.meta.url));

describe("ArtifactJsonSchemas", () => {
  it("covers pipeline and review artifacts used by the bundled harness", () => {
    expect(Object.keys(ArtifactJsonSchemas).sort()).toEqual([
      "action_timeline",
      "asset_manifest",
      "audio_architecture",
      "audio_energy",
      "brief",
      "capture_manifest",
      "character_design",
      "character_qa_report",
      "cost_log",
      "cuesheet",
      "decision_log",
      "edit_decisions",
      "end_tag_plan",
      "final_review",
      "lyrics_aligned",
      "pose_library",
      "proposal_packet",
      "publish_log",
      "render_report",
      "render_runtime",
      "research_brief",
      "review",
      "rig_plan",
      "scene_plan",
      "script",
      "source_media_review",
      "video_analysis_brief",
    ]);
  });

  it("matches the generated bundled JSON schema files", async () => {
    const mismatches: string[] = [];

    for (const [name, schema] of Object.entries(ArtifactJsonSchemas)) {
      const schemaPath = path.join(bundledArtifactSchemasDir, `${name}.schema.json`);
      const raw = await readFile(schemaPath, "utf8");
      const expected = `${JSON.stringify(schema, null, 2)}\n`;

      if (raw !== expected) {
        mismatches.push(name);
      }
    }

    expect(mismatches).toEqual([]);
  });
});
