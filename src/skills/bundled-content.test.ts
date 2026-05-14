import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

const bundledSkillsDir = fileURLToPath(new URL("../../bundled/skills/", import.meta.url));

const metaSkills = [
  "onboarding",
  "creative-intake",
  "reviewer",
  "checkpoint-protocol",
  "decision-log",
  "announce-and-escalate",
  "sample-first",
  "animation-runtime-selector",
  "video-reference-analyst",
  "skill-creator",
  "self-review-of-output",
  "capability-extension",
  "source-media-review",
  "executive-producer",
];

const coreSkills = ["ffmpeg", "remotion", "hyperframes", "color-grading", "subtitle-sync", "whisperx"];

describe("bundled Batch 8.A skills", () => {
  it("ships expected meta and core skills with frontmatter names", async () => {
    for (const name of metaSkills) {
      await expectFrontmatterName(path.join(bundledSkillsDir, "meta", `${name}.md`), name);
    }

    for (const name of coreSkills) {
      await expectFrontmatterName(path.join(bundledSkillsDir, "core", `${name}.md`), name);
    }
  });

  it("preserves key operational meta governance phrases", async () => {
    await expectFileContains("meta/onboarding.md", [
      "any two of these four signals",
      "Composition runtimes",
      "Quick upgrades - env var",
      "Anti-Patterns",
    ]);
    await expectFileContains("meta/decision-log.md", [
      "`provider_selection`",
      "`model_selection`",
      "`render_runtime_selection`",
      "`visual_accuracy_check`",
      "ffmpeg",
    ]);
    await expectFileContains("meta/announce-and-escalate.md", [
      "Pre-Execution Announce Template",
      "Major-Change Gate",
      "Structured Blocker Template",
      "Motion-Required Guardrail",
    ]);
    await expectFileContains("meta/reviewer.md", ["CHAI", "critical", "max 2 rounds", "Final Self-Review Review"]);
  });

  it("preserves specialty meta skill acceptance content", async () => {
    await expectFileContains("meta/animation-runtime-selector.md", [
      "Runtime choice (Remotion vs HyperFrames vs FFmpeg)",
      "Animation library decision matrix",
      "keep it simple",
      "Running GSAP deterministically inside Remotion",
    ]);
    await expectFileContains("meta/video-reference-analyst.md", [
      "5-Aspect Structured Output",
      "Capability Audit",
      "Creative Proposals (2-3 variants)",
      "Sample-First Production",
      "HARD REDIRECT",
      "carbon copy",
    ]);
    await expectFileContains("meta/source-media-review.md", ["ffprobe", "content_summary", "at least two", "Hallucination Guards"]);
    await expectFileContains("meta/executive-producer.md", [
      "State-Machine EP",
      "Declarative-Rules EP",
      "Cross-Stage-Philosophy EP",
    ]);
  });

  it("preserves core craft recipe coverage", async () => {
    await expectFileContains("core/ffmpeg.md", [
      "Probe Container And Streams",
      "Trim Without Re-Encoding",
      "Concatenate Same-Codec Clips",
      "Detect Silence",
      "Loudness Normalize",
      "Burn Subtitles",
    ]);
    await expectFileContains("core/remotion.md", ["Zod props schema", "spring", "interpolate", "Critical Constraints"]);
    await expectFileContains("core/subtitle-sync.md", ["Cuesheet-Driven Caption Highlight", "Snap-To-Word vs Snap-To-Segment"]);
    await expectFileContains("core/whisperx.md", ["medium.en", "medium", "large-v3", "Long Audio"]);
  });
});

async function expectFrontmatterName(filePath: string, expectedName: string): Promise<void> {
  const content = await readFile(filePath, "utf8");
  const match = /^---\n(?<frontmatter>[\s\S]*?)\n---/u.exec(content);
  expect(match?.groups?.frontmatter, filePath).toBeTruthy();
  const frontmatter = parseYaml(match?.groups?.frontmatter ?? "") as { name?: string };

  expect(frontmatter.name).toBe(expectedName);
}

async function expectFileContains(relativePath: string, snippets: string[]): Promise<void> {
  const content = await readFile(path.join(bundledSkillsDir, relativePath), "utf8");

  for (const snippet of snippets) {
    expect(content, `${relativePath} should contain ${snippet}`).toContain(snippet);
  }
}
