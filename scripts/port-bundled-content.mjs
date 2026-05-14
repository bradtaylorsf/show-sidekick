#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const repoRoot = process.cwd();
const sourceArg = process.argv[2];

if (!sourceArg) {
  console.error("Usage: node scripts/port-bundled-content.mjs <reference-repo-root>");
  process.exit(1);
}

const sourceRoot = path.resolve(repoRoot, sourceArg);
const sourceBrand = process.env.PREDIT_REFERENCE_BRAND ?? ["Open", "Montage"].join("");

const skillCopies = [
  {
    source: "skills/meta/onboarding.md",
    target: "bundled/skills/meta/onboarding.md",
    frontmatter: {
      name: "onboarding",
      description: "Orient new predit users, classify vague requests, and offer setup-aware starter prompts.",
      applies_to: "meta",
      cross_refs: ["specs/16-onboarding-and-discovery.md", "specs/15-announce-and-escalate.md"],
    },
  },
  {
    source: "skills/meta/creative-intake.md",
    target: "bundled/skills/meta/creative-intake.md",
    frontmatter: {
      name: "creative-intake",
      description: "Convert a production idea into a concrete brief without over-questioning the user.",
      applies_to: "meta",
    },
  },
  {
    source: "skills/meta/reviewer.md",
    target: "bundled/skills/meta/reviewer.md",
    frontmatter: {
      name: "reviewer",
      description: "Run CHAI-grounded artifact review before checkpoints and enforce specialty review passes.",
      applies_to: "meta",
      cross_refs: ["specs/13-reviewer-protocol.md", "specs/14-decision-log.md", "specs/17-self-review-of-output.md"],
    },
  },
  {
    source: "skills/meta/checkpoint-protocol.md",
    target: "bundled/skills/meta/checkpoint-protocol.md",
    frontmatter: {
      name: "checkpoint-protocol",
      description: "Write stage checkpoints, approval blocks, sample checkpoints, and resume state.",
      applies_to: "meta",
      cross_refs: ["specs/12-checkpoint-protocol.md"],
    },
  },
  {
    source: "skills/meta/animation-runtime-selector.md",
    target: "bundled/skills/meta/animation-runtime-selector.md",
    frontmatter: {
      name: "animation-runtime-selector",
      description: "Choose Remotion, HyperFrames, or FFmpeg and the right animation library for a scene.",
      applies_to: "meta",
      cross_refs: ["specs/14-decision-log.md", "specs/15-announce-and-escalate.md"],
    },
  },
  {
    source: "skills/meta/video-reference-analyst.md",
    target: "bundled/skills/meta/video-reference-analyst.md",
    frontmatter: {
      name: "video-reference-analyst",
      description: "Analyze reference videos, audit capabilities, propose differentiated treatments, and redirect into a pipeline.",
      applies_to: "meta",
    },
  },
  {
    source: "skills/meta/skill-creator.md",
    target: "bundled/skills/meta/skill-creator.md",
    frontmatter: {
      name: "skill-creator",
      description: "Author operational skills with clear triggers, structure, registration, and validation.",
      applies_to: "meta",
    },
  },
  {
    source: "skills/meta/capability-extension.md",
    target: "bundled/skills/meta/capability-extension.md",
    frontmatter: {
      name: "capability-extension",
      description: "Govern project-scoped capability extensions without mutating bundled tools.",
      applies_to: "meta",
      cross_refs: ["specs/14-decision-log.md"],
    },
  },
  {
    source: "skills/core/ffmpeg.md",
    target: "bundled/skills/core/ffmpeg.md",
    frontmatter: {
      name: "ffmpeg",
      description: "Practical FFmpeg recipes for probing, trimming, stitching, subtitles, normalization, and delivery checks.",
      applies_to: "core",
    },
  },
  {
    source: "skills/core/remotion.md",
    target: "bundled/skills/core/remotion.md",
    frontmatter: {
      name: "remotion",
      description: "predit Remotion composition routing, scene catalog, prop patterns, validation, and render verification.",
      applies_to: "core",
      cross_refs: ["bundled/skills/meta/animation-runtime-selector.md", "bundled/skills/core/hyperframes.md"],
    },
  },
  {
    source: "skills/core/hyperframes.md",
    target: "bundled/skills/core/hyperframes.md",
    frontmatter: {
      name: "hyperframes",
      description: "HyperFrames runtime selection, audio-reactive primitives, CSS bridge, validation, and render workflow.",
      applies_to: "core",
      cross_refs: ["bundled/skills/meta/animation-runtime-selector.md", "specs/15-announce-and-escalate.md"],
    },
  },
  {
    source: "skills/core/color-grading.md",
    target: "bundled/skills/core/color-grading.md",
    frontmatter: {
      name: "color-grading",
      description: "Color correction, LUT application, contrast/saturation tuning, skin-tone protection, and accessibility checks.",
      applies_to: "core",
    },
  },
  {
    source: "skills/core/subtitle-sync.md",
    target: "bundled/skills/core/subtitle-sync.md",
    frontmatter: {
      name: "subtitle-sync",
      description: "Segment-level and word-level subtitle timing, cuesheet caption highlights, and sync QA.",
      applies_to: "core",
    },
  },
  {
    source: "skills/core/whisperx.md",
    target: "bundled/skills/core/whisperx.md",
    frontmatter: {
      name: "whisperx",
      description: "WhisperX transcription model selection, diarization, long audio, and word-level timestamp practices.",
      applies_to: "core",
    },
  },
];

const playbooks = [
  "clean-professional.yaml",
  "flat-motion-graphics.yaml",
  "minimalist-diagram.yaml",
  "anime-ghibli.yaml",
  "news-broadcast.yaml",
  "news-song-protest.yaml",
  "news-song.yaml",
  "playful-hip-hop-explainer.yaml",
  "ps2-dystopian-news-rap.yaml",
  "thechaosfm-gta-political.yaml",
];

const rawCopies = [
  {
    source: "schemas/styles/playbook.schema.json",
    target: "bundled/schemas/styles/playbook.schema.json",
    transform: (value) =>
      value
        .replace(/"\$id":\s*"[^"]+\/styles\/playbook"/u, '"$id": "predit/styles/playbook"')
        .replaceAll(sourceBrand, "predit"),
  },
  {
    source: "docs/callouts_16x9.template.yaml",
    target: "bundled/playbooks/callouts_16x9.template.yaml",
    transform: normalizeRepoTerms,
  },
  ...playbooks.map((fileName) => ({
    source: `styles/${fileName}`,
    target: `bundled/playbooks/${fileName}`,
    transform: normalizeRepoTerms,
  })),
];

const pipelineCopies = [
  {
    source: "pipeline_defs/framework-smoke.yaml",
    target: "bundled/pipelines/framework-smoke.yaml",
    transform: normalizeFrameworkSmokePipeline,
  },
];

const missing = [];
let copied = 0;

for (const copy of skillCopies) {
  const sourcePath = path.join(sourceRoot, copy.source);
  const targetPath = path.join(repoRoot, copy.target);
  let original;

  try {
    original = await readFile(sourcePath, "utf8");
  } catch {
    missing.push(copy.source);
    continue;
  }

  const normalized = normalizeSkill(original, copy.frontmatter);
  await writeOutput(targetPath, normalized);
  copied += 1;
}

for (const copy of rawCopies) {
  const sourcePath = path.join(sourceRoot, copy.source);
  const targetPath = path.join(repoRoot, copy.target);
  let original;

  try {
    original = await readFile(sourcePath, "utf8");
  } catch {
    missing.push(copy.source);
    continue;
  }

  await writeOutput(targetPath, copy.transform(original));
  copied += 1;
}

for (const copy of pipelineCopies) {
  const sourcePath = path.join(sourceRoot, copy.source);
  const targetPath = path.join(repoRoot, copy.target);
  let original;

  try {
    original = await readFile(sourcePath, "utf8");
  } catch {
    missing.push(copy.source);
    continue;
  }

  await writeOutput(targetPath, copy.transform(original));
  copied += 1;
}

console.log(`Copied ${copied} bundled content files from ${sourceRoot}.`);
if (missing.length > 0) {
  console.log("Missing source files:");
  missing.forEach((entry) => console.log(`- ${entry}`));
  process.exitCode = 1;
}

async function writeOutput(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function normalizeSkill(markdown, frontmatter) {
  const body = stripFrontmatter(markdown);
  return `${formatFrontmatter(frontmatter)}\n${normalizeRepoTerms(body)}`;
}

function stripFrontmatter(markdown) {
  if (!markdown.startsWith("---\n")) {
    return markdown;
  }

  const end = markdown.indexOf("\n---\n", 4);
  return end === -1 ? markdown : markdown.slice(end + "\n---\n".length);
}

function formatFrontmatter(frontmatter) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      value.forEach((item) => lines.push(`  - ${quoteYaml(item)}`));
    } else {
      lines.push(`${key}: ${quoteYaml(value)}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function normalizeRepoTerms(value) {
  return value
    .replaceAll(sourceBrand, "predit")
    .replaceAll(sourceBrand.toLowerCase(), "predit")
    .replaceAll("skills/styles/", "bundled/playbooks/")
    .replaceAll("styles/", "playbooks/")
    .replaceAll("pipeline_defs/", "bundled/pipelines/")
    .replaceAll("remotion-composer/", "src/remotion/")
    .replaceAll("hyperframes_compose", "hyperframes")
    .replaceAll("cost_tracker", "cost tracker");
}

function normalizeFrameworkSmokePipeline(yaml) {
  const original = YAML.parse(yaml);
  const slug = normalizeRepoTerms(String(original?.name ?? "framework-smoke"));
  const stages = Array.isArray(original?.stages) ? original.stages : [];
  const lines = [
    `slug: ${slug}`,
    `display_name: ${quoteYaml(titleize(slug))}`,
    `description: ${quoteYaml(normalizeRepoTerms(String(original?.description ?? "")))}`,
    `status: ${mapPipelineStatus(original?.stability)}`,
    "master_clock: none",
    "stages:",
  ];

  for (const stage of stages) {
    const stageSlug = String(stage?.name ?? "");
    const produces = firstString(stage?.produces) ?? `${stageSlug}_artifact`;
    lines.push(
      `  - slug: ${stageSlug}`,
      `    skill: pipelines/${slug}/${stageSlug}-director.md`,
      `    produces: ${produces}`,
      "    success_criteria:",
    );

    const criteria = Array.isArray(stage?.success_criteria) ? stage.success_criteria : [];
    for (const criterion of criteria) {
      lines.push(`      - ${quoteYaml(normalizeRepoTerms(String(criterion)))}`);
    }

    lines.push("    human_approval: never");
  }

  return lines.join("\n");
}

function firstString(value) {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

function mapPipelineStatus(value) {
  return ["production", "beta", "experimental"].includes(value) ? value : "experimental";
}

function titleize(slug) {
  return slug
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
