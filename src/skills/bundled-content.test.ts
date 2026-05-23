import { access, readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { Registry } from "../registry/index.js";

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

const agentSkills = [
  "acestep",
  "agents",
  "ai-video-gen",
  "avatar-video",
  "beautiful-mermaid",
  "bfl-api",
  "canvas-procedural-animation",
  "character-animation-qa",
  "character-rigging",
  "create-video",
  "d3-viz",
  "doubao-tts",
  "elevenlabs",
  "faceswap",
  "ffmpeg",
  "flux-best-practices",
  "framer-motion",
  "google-tts",
  "grok-media",
  "gsap-core",
  "gsap-frameworks",
  "gsap-performance",
  "gsap-plugins",
  "gsap-react",
  "gsap-scrolltrigger",
  "gsap-timeline",
  "gsap-utils",
  "heygen",
  "higgsfield-character-train",
  "higgsfield-generate",
  "higgsfield-listing-image",
  "higgsfield-product-photoshoot",
  "higgsfield-soul-id",
  "hyperframes",
  "hyperframes-cli",
  "hyperframes-registry",
  "kling",
  "lottie-bodymovin",
  "ltx2",
  "manim-composer",
  "manimce-best-practices",
  "manimgl-best-practices",
  "marketing-studio",
  "minimax",
  "music",
  "playwright-recording",
  "pose-library-design",
  "remotion",
  "remotion-best-practices",
  "runway",
  "seedance-2-0",
  "setup-api-key",
  "sound-effects",
  "speech-to-text",
  "svg-character-animation",
  "synthetic-screen-recording",
  "tailwind-design-system",
  "text-to-speech",
  "threejs-animation",
  "threejs-fundamentals",
  "threejs-geometry",
  "threejs-interaction",
  "threejs-lighting",
  "threejs-loaders",
  "threejs-materials",
  "threejs-postprocessing",
  "threejs-shaders",
  "threejs-textures",
  "veo",
  "vercel-composition-patterns",
  "vercel-react-best-practices",
  "video-download",
  "video-edit",
  "video-translate",
  "video-understand",
  "video_toolkit",
  "visual-style",
  "web-design-guidelines",
  "website-to-hyperframes",
  "whisperx",
];

const criticalAgentSkills = [
  "flux-best-practices",
  "seedance-2-0",
  "ai-video-gen",
  "elevenlabs",
  "google-tts",
  "music",
  "higgsfield-generate",
  "remotion",
  "gsap-timeline",
  "gsap-plugins",
  "acestep",
  "whisperx",
];

const criticalSectionHeadings = [
  "Model Identity",
  "Prompt Structure",
  "Parameter Defaults",
  "Quality Keywords",
  "Anti-Patterns",
];

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
      "Personalized Zero-Key First Video",
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

describe("bundled presentation-demo pipeline skills", () => {
  it("ships director skills with frontmatter names", async () => {
    const presentationDir = path.join(bundledSkillsDir, "pipelines", "presentation-demo");
    const expected = [
      ["executive-producer.md", "presentation-demo-executive-producer"],
      ["idea-director.md", "presentation-demo-idea-director"],
      ["capture-director.md", "presentation-demo-capture-director"],
      ["script-director.md", "presentation-demo-script-director"],
      ["cuesheet-director.md", "presentation-demo-cuesheet-director"],
      ["scene-director.md", "presentation-demo-scene-director"],
      ["asset-director.md", "presentation-demo-asset-director"],
      ["edit-director.md", "presentation-demo-edit-director"],
      ["compose-director.md", "presentation-demo-compose-director"],
      ["publish-director.md", "presentation-demo-publish-director"],
    ] as const;

    for (const [file, name] of expected) {
      await expectFrontmatterName(path.join(presentationDir, file), name);
    }
  });
});

describe("bundled Batch 8.B Layer 3 agent skills", () => {
  it("ships the expected agent skill inventory with frontmatter", async () => {
    for (const name of agentSkills) {
      const frontmatter = await expectFrontmatterName(path.join(bundledSkillsDir, "agents", `${name}.md`), name);
      expect(frontmatter.applies_to).toBe("agents");
      expect(frontmatter.agent_skill).toBe(true);
    }
  });

  it("declares the critical subset and references the skill template", async () => {
    const readme = await readFile(path.join(bundledSkillsDir, "agents", "README.md"), "utf8");
    const template = await readFile(path.join(bundledSkillsDir, "agents", "TEMPLATE.md"), "utf8");

    expect(readme).toContain("bundled/skills/agents/TEMPLATE.md");
    expect(template).toContain("## Model Identity");

    for (const name of criticalAgentSkills) {
      expect(readme, `README should declare ${name}`).toContain(`- \`${name}\``);
    }
  });

  it("keeps required critical-subset section headers", async () => {
    for (const name of criticalAgentSkills) {
      const content = await readFile(path.join(bundledSkillsDir, "agents", `${name}.md`), "utf8");

      for (const heading of criticalSectionHeadings) {
        expect(content, `${name} should include ${heading}`).toMatch(new RegExp(`^## ${heading}$`, "mu"));
      }
    }
  });

  it("resolves every tool agent_skills reference to a bundled agent skill", async () => {
    const registry = new Registry();
    await registry.discover();
    const missing: string[] = [];

    for (const tool of registry.all()) {
      for (const skillName of tool.agent_skills ?? []) {
        try {
          await access(path.join(bundledSkillsDir, "agents", `${skillName}.md`));
        } catch {
          missing.push(`${tool.name}: ${skillName}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("preserves critical model names, defaults, and provider vocabulary", async () => {
    await expectFileContains("agents/flux-best-practices.md", ["FLUX.2 [max]", "#RRGGBB", "NO negative prompts"]);
    await expectFileContains("agents/seedance-2-0.md", [
      "bytedance/seedance-2.0/text-to-video",
      "generate_audio",
      "reference-to-video",
    ]);
    await expectFileContains("agents/elevenlabs.md", [
      "eleven_multilingual_v2",
      "similarity_boost",
      "music.compose",
    ]);
    await expectFileContains("agents/music.md", ["suno_music", "duration_seconds", "music.compose"]);
    await expectFileContains("agents/google-tts.md", [
      "en-US-Chirp3-HD-Orus",
      "speaking_rate",
      "GOOGLE_APPLICATION_CREDENTIALS",
    ]);
    await expectFileContains("agents/higgsfield-generate.md", [
      "gpt_image_2",
      "seedance_2_0",
      "marketing_studio_video",
      "brain_activity",
    ]);
    await expectFileContains("agents/gsap-plugins.md", [
      "SplitText",
      "MorphSVG",
      "MotionPath",
      "DrawSVG",
      "Flip",
      "CustomEase",
    ]);
    await expectFileContains("agents/whisperx.md", ["large-v3", "HF_TOKEN", "word_timestamps"]);
  });

  it("mirrors source reference material without leaking private source paths", async () => {
    await expectFileContains("agents/flux-best-practices/rules/model-selection-guide.md", ["FLUX.2", "FLUX.1"]);
    await expectFileContains("agents/higgsfield-generate/references/model-catalog.md", [
      "Seedance 2.0",
      "Marketing Studio",
      "Virality Predictor",
    ]);
    await expectFileContains("agents/remotion-best-practices/rules/3d.md", ["React Three Fiber", "Three.js"]);

    const files = await allTextFiles(path.join(bundledSkillsDir, "agents"));
    const forbiddenSourcePattern = new RegExp(
      [
        ["Open", "Montage"].join(""),
        "\\.\\.\\/" + ["Open", "Montage"].join(""),
        "\\/Users\\/[^/]+",
        "C:\\\\Users",
        "C:\\/Users",
        "\\.predit\\/\\.predit",
      ].join("|"),
      "u",
    );
    for (const file of files) {
      const content = await readFile(file, "utf8");
      expect(content, `${file} should not leak reference repo or machine paths`).not.toMatch(forbiddenSourcePattern);
    }
  });
});

async function expectFrontmatterName(
  filePath: string,
  expectedName: string,
): Promise<Record<string, unknown>> {
  const content = await readFile(filePath, "utf8");
  const match = /^---\n(?<frontmatter>[\s\S]*?)\n---/u.exec(content);
  expect(match?.groups?.frontmatter, filePath).toBeTruthy();
  const frontmatter = parseYaml(match?.groups?.frontmatter ?? "") as { name?: string } & Record<string, unknown>;

  expect(frontmatter.name).toBe(expectedName);
  return frontmatter;
}

async function expectFileContains(relativePath: string, snippets: string[]): Promise<void> {
  const content = await readFile(path.join(bundledSkillsDir, relativePath), "utf8");

  for (const snippet of snippets) {
    expect(content, `${relativePath} should contain ${snippet}`).toContain(snippet);
  }
}

async function allTextFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return allTextFiles(entryPath);
      }

      if (!entry.isFile() || !(await isTextFile(entryPath))) {
        return [];
      }

      return [entryPath];
    }),
  );

  return files.flat();
}

async function isTextFile(filePath: string): Promise<boolean> {
  if (!/\.(css|html|js|json|jsx|md|mjs|py|sh|svg|toml|ts|tsx|txt|yaml|yml)$/iu.test(filePath)) {
    return false;
  }

  const fileStat = await stat(filePath);
  return fileStat.size < 1_000_000;
}
