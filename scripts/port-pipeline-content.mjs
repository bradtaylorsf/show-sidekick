#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const repoRoot = process.cwd();
const sourceArg = process.argv[2];

if (!sourceArg) {
  console.error("Usage: node scripts/port-pipeline-content.mjs <reference-repo-root> [pipeline...]");
  process.exit(1);
}

const sourceRoot = path.resolve(repoRoot, sourceArg);
const requestedPipelines = new Set(process.argv.slice(3));
const sourceBrand = process.env.PREDIT_REFERENCE_BRAND ?? ["Open", "Montage"].join("");

const pipelineConfigs = {
  hybrid: {
    sourceManifest: "pipeline_defs/hybrid.yaml",
    targetManifest: "bundled/pipelines/hybrid.yaml",
    sourceSkillsDir: "skills/pipelines/hybrid",
    targetSkillsDir: "bundled/skills/pipelines/hybrid",
    extraStages: [hybridSourceReviewStage()],
    extraSkills: [
      {
        fileName: "source-review-director.md",
        content: hybridSourceReviewDirector(),
      },
    ],
    frontmatter: {
      "source-review-director.md": {
        name: "hybrid-source-review-director",
        description: "Inspect supplied source media before hybrid planning begins.",
        applies_to: "pipelines/hybrid",
        stage: "source_review",
        produces: "source_media_review",
      },
      "idea-director.md": {
        name: "hybrid-idea-director",
        description: "Define the hybrid anchor medium, support layers, deliverables, and runtime choice.",
        applies_to: "pipelines/hybrid",
        stage: "idea",
        produces: "brief",
      },
      "script-director.md": {
        name: "hybrid-script-director",
        description: "Separate source-led and support-led beats for a hybrid video.",
        applies_to: "pipelines/hybrid",
        stage: "script",
        produces: "script",
      },
      "scene-director.md": {
        name: "hybrid-scene-director",
        description: "Plan source/support scene treatments, overlays, and variant safety.",
        applies_to: "pipelines/hybrid",
        stage: "scene_plan",
        produces: "scene_plan",
      },
      "asset-director.md": {
        name: "hybrid-asset-director",
        description: "Prepare support assets without eclipsing source media.",
        applies_to: "pipelines/hybrid",
        stage: "assets",
        produces: "asset_manifest",
      },
      "edit-director.md": {
        name: "hybrid-edit-director",
        description: "Create anchor-first edit decisions and support layer timing.",
        applies_to: "pipelines/hybrid",
        stage: "edit",
        produces: "edit_decisions",
      },
      "compose-director.md": {
        name: "hybrid-compose-director",
        description: "Render hybrid source footage, support graphics, and audio coherently.",
        applies_to: "pipelines/hybrid",
        stage: "compose",
        produces: "render_report",
      },
      "publish-director.md": {
        name: "hybrid-publish-director",
        description: "Package hybrid master and derivative outputs with source/support metadata.",
        applies_to: "pipelines/hybrid",
        stage: "publish",
        produces: "publish_log",
      },
      "executive-producer.md": {
        name: "hybrid-executive-producer",
        description: "Orchestrate hybrid source/support balance, overlay density, and cross-medium coherence.",
        applies_to: "pipelines/hybrid",
        role: "executive-producer",
      },
    },
  },
};

let copied = 0;
const missing = [];

for (const [slug, config] of Object.entries(pipelineConfigs)) {
  if (requestedPipelines.size > 0 && !requestedPipelines.has(slug)) {
    continue;
  }

  const manifest = await readSource(config.sourceManifest);
  if (manifest === undefined) {
    continue;
  }

  await writeOutput(path.join(repoRoot, config.targetManifest), normalizePipelineManifest(slug, manifest, config));
  copied += 1;

  const skillFiles = await readMarkdownFiles(config.sourceSkillsDir);
  for (const fileName of skillFiles) {
    const original = await readSource(path.join(config.sourceSkillsDir, fileName));
    if (original === undefined) {
      continue;
    }

    const frontmatter = config.frontmatter[fileName];
    await writeOutput(
      path.join(repoRoot, config.targetSkillsDir, fileName),
      normalizeSkill(original, frontmatter ?? fallbackFrontmatter(slug, fileName)),
    );
    copied += 1;
  }

  for (const skill of config.extraSkills) {
    const frontmatter = config.frontmatter[skill.fileName];
    await writeOutput(
      path.join(repoRoot, config.targetSkillsDir, skill.fileName),
      normalizeSkill(skill.content, frontmatter ?? fallbackFrontmatter(slug, skill.fileName)),
    );
    copied += 1;
  }
}

console.log(`Copied ${copied} pipeline content files from ${sourceRoot}.`);
if (missing.length > 0) {
  console.log("Missing source files:");
  missing.forEach((entry) => console.log(`- ${entry}`));
  process.exitCode = 1;
}

async function readSource(relativePath) {
  try {
    return await readFile(path.join(sourceRoot, relativePath), "utf8");
  } catch {
    missing.push(relativePath);
    return undefined;
  }
}

async function readMarkdownFiles(relativeDir) {
  try {
    const entries = await readdir(path.join(sourceRoot, relativeDir), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    missing.push(relativeDir);
    return [];
  }
}

async function writeOutput(targetPath, content) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}

function normalizePipelineManifest(slug, yaml, config) {
  const original = YAML.parse(yaml);
  const orchestration = original?.orchestration ?? {};
  const stages = [
    ...(config.extraStages ?? []),
    ...(Array.isArray(original?.stages) ? original.stages.map((stage) => normalizeStage(slug, stage)) : []),
  ];

  return YAML.stringify(
    {
      slug,
      display_name: titleize(slug),
      description: normalizeRepoTerms(String(original?.description ?? "")).replace(/\s+/gu, " ").trim(),
      status: mapPipelineStatus(original?.stability),
      master_clock: "none",
      orchestration: {
        budget_default_usd: numberOrDefault(orchestration.budget_default_usd, 3),
        max_revisions_per_stage: numberOrDefault(orchestration.max_revisions_per_stage, 2),
        max_send_backs: numberOrDefault(orchestration.max_send_backs, 3),
        max_wall_time_minutes: numberOrDefault(orchestration.max_wall_time_minutes, 30),
      },
      stages,
    },
    { lineWidth: 0 },
  );
}

function normalizeStage(slug, stage) {
  const stageSlug = String(stage?.name ?? "");
  return compactObject({
    slug: stageSlug,
    skill: normalizeSkillPath(slug, String(stage?.skill ?? `pipelines/${slug}/${stageSlug}-director`)),
    produces: firstString(stage?.produces) ?? `${stageSlug}_artifact`,
    tools_available: normalizeToolNames(stage?.tools_available),
    review_focus: normalizeStringList(stage?.review_focus),
    success_criteria: normalizeStringList(stage?.success_criteria),
    human_approval: stage?.human_approval_default === true ? "required" : "optional",
  });
}

function hybridSourceReviewStage() {
  return {
    slug: "source_review",
    skill: "pipelines/hybrid/source-review-director.md",
    produces: "source_media_review",
    tools_available: ["source_media_review", "frame_sampler", "transcriber", "scene_detect", "video_understand"],
    review_focus: [
      "Supplied footage is probed before planning",
      "Content summary is grounded in technical probe fields",
      "Reusable source moments are identified for the script and scene plan",
    ],
    success_criteria: [
      "Schema-valid source_media_review artifact when user media is supplied",
      "Known source constraints are explicit before script",
    ],
    human_approval: "optional",
  };
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
    lines.push(`${key}: ${quoteYaml(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function fallbackFrontmatter(slug, fileName) {
  return {
    name: `${slug}-${path.basename(fileName, ".md")}`,
    description: `Ported ${titleize(slug)} ${path.basename(fileName, ".md")} instructions.`,
    applies_to: `pipelines/${slug}`,
  };
}

function normalizeSkillPath(slug, value) {
  const normalized = normalizeRepoTerms(value);
  return normalized.endsWith(".md") ? normalized : `${normalized}.md`;
}

function normalizeToolNames(value) {
  return normalizeStringList(value).map((tool) => normalizeRepoTerms(tool));
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map((item) => normalizeRepoTerms(String(item))) : [];
}

function normalizeRepoTerms(value) {
  return value
    .replaceAll(sourceBrand, "predit")
    .replaceAll(sourceBrand.toLowerCase(), "predit")
    .replaceAll("AGENT_GUIDE.md", "specs/15-announce-and-escalate.md")
    .replaceAll("pipeline_defs/", "bundled/pipelines/")
    .replaceAll("skills/core/", "bundled/skills/core/")
    .replaceAll("skills/meta/", "bundled/skills/meta/")
    .replaceAll("skills/creative/storytelling.md", "bundled/skills/meta/creative-intake.md")
    .replaceAll("skills/creative/video-editing.md", "bundled/skills/agents/video-edit.md")
    .replaceAll("hyperframes_compose", "hyperframes");
}

function firstString(value) {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

function numberOrDefault(value, fallback) {
  return typeof value === "number" ? value : fallback;
}

function mapPipelineStatus(value) {
  return ["production", "beta", "experimental"].includes(value) ? value : "experimental";
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => !(Array.isArray(entryValue) && entryValue.length === 0)),
  );
}

function titleize(slug) {
  return slug
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hybridSourceReviewDirector() {
  return `# Source Review Director - Hybrid Pipeline

## When To Use

Run this first when the episode includes supplied footage, screen recordings, audio, stills, or product clips. The goal is to create a grounded source inventory before idea and script decisions depend on the media.

## Process

### 1. Review Supplied Media

Use the registry tool \`source_media_review\` for each supplied file. Add frame sampling, transcription, or scene detection only when it clarifies the source.

### 2. Ground The Summary

Each content summary must cite technical probe fields such as duration_seconds, resolution, codec, or audio stream details.

### 3. Identify Reusable Moments

Mark the source moments that can carry story beats directly, plus any gaps that need generated support visuals later.

### 4. Handoff To IDEA And SCRIPT

Record anchor media, constraints, standout moments, unusable sections, and risks so downstream directors do not invent source facts.

## Quality Gate

- every supplied file is reviewed or explicitly marked out of scope,
- summaries are grounded in probe data,
- source constraints are ready for source-vs-generated decisioning,
- no generated support need is proposed before the source evidence is understood.
`;
}
