import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const bundledSkillsDir = fileURLToPath(new URL("../../bundled/skills/", import.meta.url));

describe("shared L2P helper content", () => {
  it("ships the five-aspect video framework with required governance language", async () => {
    const content = await readFile(path.join(bundledSkillsDir, "_shared", "video-prompting.md"), "utf8");

    expect(content).toContain("Subject: type; key visual attributes;");
    expect(content).toContain("Subject Motion: actions in temporal order;");
    expect(content).toContain("Scene: overlays listed separately;");
    expect(content).toContain("Spatial Framing: shot size");
    expect(content).toContain("Camera: playback speed");
    expect(content).toContain(
      "Mark any aspect explicitly as N/A if it doesn't apply (e.g., 'Subject: N/A — pure scenery shot,' or 'Scene overlays: N/A — no graphics'). Silent omission is the most common analyst failure and produces ambiguous downstream prompts.",
    );
    expect(content).toContain(
      "Overlays (text, lower thirds, graphics, watermark) are their own layer. Do not merge them into the depth axis of the Scene aspect — they live above the scene, not inside it.",
    );
  });

  it("links the shot prompt helper to shared schemas and the TypeScript helper", async () => {
    const content = await readFile(path.join(bundledSkillsDir, "_shared", "shot-prompt-builder.md"), "utf8");

    expect(content).toContain("src/prompts/shot-prompt-builder.ts");
    expect(content).toContain("src/artifacts/research-brief.ts");
    expect(content).toContain("bundled/schemas/artifacts/research_brief.schema.json");
    expect(content).toContain("src/artifacts/script.ts");
    expect(content).toContain("bundled/schemas/artifacts/script.schema.json");
  });

  it("cross-references the shared helpers from existing reference and music-video skills", async () => {
    const referenceAnalyst = await readFile(path.join(bundledSkillsDir, "meta", "video-reference-analyst.md"), "utf8");
    const musicVideoAsset = await readFile(
      path.join(bundledSkillsDir, "pipelines", "music-video", "asset-director.md"),
      "utf8",
    );

    for (const content of [referenceAnalyst, musicVideoAsset]) {
      expect(content).toContain("bundled/skills/_shared/video-prompting.md");
      expect(content).toContain("bundled/skills/_shared/shot-prompt-builder.md");
    }
  });
});
