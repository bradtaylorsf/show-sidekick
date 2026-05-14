#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const force = args.includes("--force");
const dryRun = args.includes("--dry-run");
const positionalArgs = args.filter((arg) => arg !== "--force" && arg !== "--dry-run");
const sourceArg = positionalArgs[0];

if (!sourceArg) {
  console.error("Usage: node scripts/port-pipeline-content.mjs [--dry-run] [--force] <reference-repo-root> [pipeline...]");
  process.exit(1);
}

const sourceRoot = path.resolve(repoRoot, sourceArg);
const requestedPipelines = new Set(positionalArgs.slice(1));
const sourceBrand = process.env.PREDIT_REFERENCE_BRAND ?? ["Open", "Montage"].join("");

const pipelineConfigs = {
  hybrid: {
    sourceManifest: "pipeline_defs/hybrid.yaml",
    targetManifest: "bundled/pipelines/hybrid.yaml",
    sourceSkillsDir: "skills/pipelines/hybrid",
    targetSkillsDir: "bundled/skills/pipelines/hybrid",
    extraRequiredSkills: ["pipelines/hybrid/source-review-director.md"],
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
  "localization-dub": {
    sourceManifest: "pipeline_defs/localization-dub.yaml",
    targetManifest: "bundled/pipelines/localization-dub.yaml",
    sourceSkillsDir: "skills/pipelines/localization-dub",
    targetSkillsDir: "bundled/skills/pipelines/localization-dub",
    extraRequiredSkills: ["pipelines/localization-dub/source-review-director.md"],
    extraStages: [localizationSourceReviewStage()],
    extraSkills: [
      {
        fileName: "source-review-director.md",
        content: localizationSourceReviewDirector(),
      },
    ],
    frontmatter: {
      "source-review-director.md": {
        name: "localization-dub-source-review-director",
        description: "Inspect source video before localization planning and translation.",
        applies_to: "pipelines/localization-dub",
        stage: "source_review",
        produces: "source_media_review",
      },
      "idea-director.md": {
        name: "localization-dub-idea-director",
        description: "Define localization scope, target languages, dub modes, and runtime constraints.",
        applies_to: "pipelines/localization-dub",
        stage: "idea",
        produces: "brief",
      },
      "script-director.md": {
        name: "localization-dub-script-director",
        description: "Create transcript-backed, reviewable target-language scripts before dubbing.",
        applies_to: "pipelines/localization-dub",
        stage: "script",
        produces: "script",
      },
      "scene-director.md": {
        name: "localization-dub-scene-director",
        description: "Plan timing, visible speech, subtitles, and on-screen text per locale.",
        applies_to: "pipelines/localization-dub",
        stage: "scene_plan",
        produces: "scene_plan",
      },
      "asset-director.md": {
        name: "localization-dub-asset-director",
        description: "Prepare translated subtitles, dubbed audio, and optional lip-sync assets.",
        applies_to: "pipelines/localization-dub",
        stage: "assets",
        produces: "asset_manifest",
      },
      "edit-director.md": {
        name: "localization-dub-edit-director",
        description: "Convert localization plans into per-locale edit decisions.",
        applies_to: "pipelines/localization-dub",
        stage: "edit",
        produces: "edit_decisions",
      },
      "compose-director.md": {
        name: "localization-dub-compose-director",
        description: "Render localized outputs with timing, subtitles, and labels intact.",
        applies_to: "pipelines/localization-dub",
        stage: "compose",
        produces: "render_report",
      },
      "publish-director.md": {
        name: "localization-dub-publish-director",
        description: "Package per-locale localized videos, subtitles, scripts, and review notes.",
        applies_to: "pipelines/localization-dub",
        stage: "publish",
        produces: "publish_log",
      },
      "executive-producer.md": {
        name: "localization-dub-executive-producer",
        description: "Orchestrate translation accuracy, timing preservation, lip-sync quality, and locale consistency.",
        applies_to: "pipelines/localization-dub",
        role: "executive-producer",
      },
    },
  },
  "daily-news": {
    sourceManifest: "pipeline_defs/daily-news.yaml",
    targetManifest: "bundled/pipelines/daily-news.yaml",
    sourceSkillsDir: "skills/pipelines/daily-news",
    targetSkillsDir: "bundled/skills/pipelines/daily-news",
    stageOrder: "manifest",
    transformStages: dailyNewsStages,
    extraSkills: [
      {
        fileName: "publish-director.md",
        content: dailyNewsPublishDirector(),
      },
    ],
    frontmatter: {
      "research-director.md": {
        name: "daily-news-research-director",
        description: "Find timely, attributed story candidates for a recurring news roundup.",
        applies_to: "pipelines/daily-news",
        stage: "research",
        produces: "research_brief",
      },
      "idea-director.md": {
        name: "daily-news-idea-director",
        description: "Lock the daily news angle, story slate, voice, platform, and runtime.",
        applies_to: "pipelines/daily-news",
        stage: "idea",
        produces: "brief",
      },
      "script-director.md": {
        name: "daily-news-script-director",
        description: "Write neutral, source-attributed broadcast narration for selected stories.",
        applies_to: "pipelines/daily-news",
        stage: "script",
        produces: "script",
      },
      "capture-director.md": {
        name: "daily-news-capture-director",
        description: "Capture real source-page screenshots for each selected news story.",
        applies_to: "pipelines/daily-news",
        stage: "capture",
        produces: "capture_manifest",
      },
      "scene-director.md": {
        name: "daily-news-scene-director",
        description: "Map narration and real screenshots into a broadcast-style timeline.",
        applies_to: "pipelines/daily-news",
        stage: "scene_plan",
        produces: "scene_plan",
      },
      "asset-director.md": {
        name: "daily-news-asset-director",
        description: "Generate consistent TTS narration and optional newsroom audio beds.",
        applies_to: "pipelines/daily-news",
        stage: "assets",
        produces: "asset_manifest",
      },
      "edit-director.md": {
        name: "daily-news-edit-director",
        description: "Lock lower-third timing, audio ducking, and render runtime for the roundup.",
        applies_to: "pipelines/daily-news",
        stage: "edit",
        produces: "edit_decisions",
      },
      "compose-director.md": {
        name: "daily-news-compose-director",
        description: "Render and self-review the daily news episode with broadcast chrome intact.",
        applies_to: "pipelines/daily-news",
        stage: "compose",
        produces: "render_report",
      },
      "publish-director.md": {
        name: "daily-news-publish-director",
        description: "Package the rendered news episode, sources, screenshots, and captions for delivery.",
        applies_to: "pipelines/daily-news",
        stage: "publish",
        produces: "publish_log",
      },
      "executive-producer.md": {
        name: "daily-news-executive-producer",
        description: "Orchestrate fast recurring news production with source capture and strict revision limits.",
        applies_to: "pipelines/daily-news",
        role: "executive-producer",
      },
    },
  },
};

let copied = 0;
const missing = [];
const conflicts = [];
const wouldWrite = [];

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
if (dryRun && wouldWrite.length > 0) {
  console.log("Dry run would write:");
  wouldWrite.forEach((entry) => console.log(`- ${entry}`));
}
if (missing.length > 0) {
  console.log("Missing source files:");
  missing.forEach((entry) => console.log(`- ${entry}`));
  process.exitCode = 1;
}
if (conflicts.length > 0) {
  console.log("Refusing to overwrite edited files without --force:");
  conflicts.forEach((entry) => console.log(`- ${entry}`));
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
  const normalizedContent = content.endsWith("\n") ? content : `${content}\n`;

  if (dryRun) {
    wouldWrite.push(path.relative(repoRoot, targetPath));
    return;
  }

  if (!force) {
    try {
      const existing = await readFile(targetPath, "utf8");
      if (existing !== normalizedContent) {
        conflicts.push(path.relative(repoRoot, targetPath));
        return;
      }
    } catch {
      // New files are safe to create without --force.
    }
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, normalizedContent, "utf8");
}

function normalizePipelineManifest(slug, yaml, config) {
  const original = YAML.parse(yaml);
  const orchestration = original?.orchestration ?? {};
  const stages = [
    ...(config.extraStages ?? []),
    ...(Array.isArray(original?.stages) ? original.stages.map((stage) => normalizeStage(slug, stage)) : []),
  ];
  const transformedStages =
    typeof config.transformStages === "function" ? config.transformStages(stages) : stages;

  return YAML.stringify(
    compactObject({
      slug,
      display_name: titleize(slug),
      description: normalizeRepoTerms(String(original?.description ?? "")).replace(/\s+/gu, " ").trim(),
      status: mapPipelineStatus(original?.stability),
      master_clock: "none",
      stage_order: config.stageOrder,
      default_checkpoint_policy: original?.default_checkpoint_policy,
      reference_input: normalizeUnknown(original?.reference_input),
      extensions: normalizeUnknown(original?.extensions),
      required_skills: uniqueStrings([
        ...normalizeStringList(original?.required_skills).map(normalizeRequiredSkillPath),
        ...(config.extraRequiredSkills ?? []),
      ]),
      compatible_playbooks: normalizeCompatiblePlaybooks(original?.compatible_playbooks),
      orchestration: {
        mode: typeof orchestration.mode === "string" ? orchestration.mode : undefined,
        skill:
          typeof orchestration.skill === "string"
            ? normalizeSkillPath(slug, orchestration.skill)
            : `pipelines/${slug}/executive-producer.md`,
        budget_default_usd: numberOrDefault(orchestration.budget_default_usd, 3),
        max_revisions_per_stage: numberOrDefault(orchestration.max_revisions_per_stage, 2),
        max_send_backs: numberOrDefault(orchestration.max_send_backs, 3),
        max_wall_time_minutes: numberOrDefault(orchestration.max_wall_time_minutes, 30),
      },
      stages: transformedStages,
    }),
    { lineWidth: 0 },
  );
}

function normalizeStage(slug, stage) {
  const stageSlug = String(stage?.name ?? "");
  return compactObject({
    slug: stageSlug,
    skill: normalizeSkillPath(slug, String(stage?.skill ?? `pipelines/${slug}/${stageSlug}-director`)),
    produces: firstString(stage?.produces) ?? `${stageSlug}_artifact`,
    produces_artifacts: normalizeStringList(stage?.produces),
    required_artifacts_in: normalizeStringList(stage?.required_artifacts_in),
    optional_artifacts_in: normalizeStringList(stage?.optional_artifacts_in),
    required_tools: normalizeToolNames(stage?.required_tools),
    optional_tools: normalizeToolNames(stage?.optional_tools),
    tools_available: normalizeToolNames(stage?.tools_available),
    review_focus: normalizeStringList(stage?.review_focus),
    success_criteria: normalizeStringList(stage?.success_criteria),
    human_approval: stage?.human_approval_default === true ? "required" : "optional",
    human_approval_default:
      typeof stage?.human_approval_default === "boolean" ? stage.human_approval_default : undefined,
    checkpoint_required: typeof stage?.checkpoint_required === "boolean" ? stage.checkpoint_required : undefined,
  });
}

function hybridSourceReviewStage() {
  return {
    slug: "source_review",
    skill: "pipelines/hybrid/source-review-director.md",
    produces: "source_media_review",
    produces_artifacts: ["source_media_review"],
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
    human_approval_default: false,
  };
}

function localizationSourceReviewStage() {
  return {
    slug: "source_review",
    skill: "pipelines/localization-dub/source-review-director.md",
    produces: "source_media_review",
    produces_artifacts: ["source_media_review"],
    tools_available: ["source_media_review", "transcriber", "frame_sampler", "scene_detect", "video_understand"],
    review_focus: [
      "Source video is probed before translation",
      "Speech-bearing sections and on-screen text are identified",
      "Localization constraints are explicit before script",
    ],
    success_criteria: [
      "Schema-valid source_media_review artifact for the source video",
      "Speech, subtitle, and on-screen text risks are ready for localization planning",
    ],
    human_approval: "optional",
    human_approval_default: false,
  };
}

function dailyNewsStages(stages) {
  const bySlug = new Map(stages.map((stage) => [stage.slug, stage]));
  const idea = bySlug.get("idea");
  const research = bySlug.get("research");
  const capture = bySlug.get("capture");
  const script = bySlug.get("script");
  const scene = bySlug.get("scene_plan");
  const assets = bySlug.get("assets");
  const edit = bySlug.get("edit");
  const compose = bySlug.get("compose");

  return [
    idea && {
      ...idea,
      review_focus: [
        "Topic scope, source list, recency window, and selected story slate are explicit",
        "Episode date, target runtime, platform, and TTS voice are locked",
        "Render runtime choice is recorded before script",
      ],
      success_criteria: [
        "Schema-valid brief artifact",
        "Brief records selected stories and runtime/platform decisions",
      ],
      human_approval: "required",
    },
    research && {
      ...research,
      review_focus: [
        "At least 8-12 candidate headlines fetched before slate selection",
        "Every headline has source URL, publisher, publish date, and brief summary",
        "Recency window is honored and stale stories are dropped",
      ],
      success_criteria: [
        "Schema-valid research_brief artifact",
        "research_brief.headlines contains attributed, deduplicated candidates",
      ],
      human_approval: "required",
    },
    capture && {
      ...capture,
      tools_available: ["playwright_recording"],
      review_focus: [
        "Captures are real source screenshots. Do not generate fake article pages.",
        "Every selected story has an above-the-fold screenshot or explicit failure flag",
        "Paywall, cookie banner, geo-block, and page-error issues are recorded",
      ],
      success_criteria: [
        "Schema-valid capture_manifest artifact",
        "All referenced screenshot files exist on disk",
      ],
      human_approval: "optional",
    },
    script && {
      ...script,
      review_focus: [
        "Each selected story has neutral, source-attributed narration",
        "Episode opens with date and closes with a sign-off",
        "No editorializing, clickbait, or unsupported claims",
      ],
      success_criteria: [
        "Schema-valid script artifact",
        "Script story count matches the selected story slate",
      ],
      human_approval: "required",
    },
    scene && {
      ...scene,
      review_focus: [
        "Episode timeline maps intro, story screenshots, lower thirds, and outro",
        "Publisher, headline, and date lower-third format is consistent",
        "Capture quality flags are handled before compose",
      ],
      success_criteria: [
        "Schema-valid scene_plan artifact",
        "Total scene duration matches planned narration and screenshot hold timing",
      ],
      human_approval: "optional",
    },
    assets && {
      ...assets,
      review_focus: [
        "One TTS audio file exists per intro, story, and outro block",
        "Voice id and provider remain consistent across all narration",
        "Narration loudness is normalized for broadcast clarity",
      ],
      success_criteria: [
        "Schema-valid asset_manifest artifact",
        "All referenced audio files exist on disk",
      ],
      human_approval: "optional",
    },
    edit && {
      ...edit,
      review_focus: [
        "Render runtime remains the one locked in the brief",
        "silent runtime swap is a CRITICAL governance violation",
        "Lower-third timing and hard-cut story cadence are locked",
        "Music ducking and narration timing match asset durations",
      ],
      success_criteria: [
        "Schema-valid edit_decisions artifact",
        "edit_decisions.render_runtime is present and matches the brief",
      ],
      human_approval: "optional",
    },
    compose && {
      ...compose,
      review_focus: [
        "Rendered output duration matches planned duration within 2 seconds",
        "Lower thirds render consistently across every story",
        "Real screenshots do not show unwanted browser chrome, cookie banners, or scrollbars",
        "Audio mix is clear and narration remains intelligible",
      ],
      success_criteria: [
        "Schema-valid render_report artifact",
        "Output file exists and passes ffprobe validation",
      ],
      human_approval: "optional",
    },
    dailyNewsPublishStage(),
  ].filter(Boolean);
}

function dailyNewsPublishStage() {
  return {
    slug: "publish",
    skill: "pipelines/daily-news/publish-director.md",
    produces: "publish_log",
    produces_artifacts: ["publish_log"],
    required_artifacts_in: ["render_report", "final_review"],
    optional_artifacts_in: ["brief", "script", "capture_manifest"],
    checkpoint_required: true,
    review_focus: [
      "Rendered episode, source URLs, screenshots, and captions are packaged together",
      "Publisher attribution and episode date survive into delivery metadata",
      "Review notes identify any capture-quality or source-access caveats",
    ],
    success_criteria: [
      "Schema-valid publish_log artifact",
      "Export package contains rendered video, source manifest, screenshots, and metadata",
    ],
    human_approval: "required",
    human_approval_default: true,
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

function uniqueStrings(values) {
  return [...new Set(values)];
}

function normalizeRequiredSkillPath(value) {
  return normalizeRepoTerms(value).replace(/^pipelines\/([^/]+)\/([^/.]+)$/u, "pipelines/$1/$2.md");
}

function normalizeCompatiblePlaybooks(value) {
  if (!isRecord(value)) {
    return undefined;
  }

  return compactObject({
    recommended: normalizeStringList(value.recommended),
    also_works: normalizeStringList(value.also_works),
    custom_allowed: typeof value.custom_allowed === "boolean" ? value.custom_allowed : undefined,
  });
}

function normalizeUnknown(value) {
  if (typeof value === "string") {
    return normalizeRepoTerms(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizeUnknown);
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeUnknown(entry)]));
  }

  return value;
}

function normalizeRepoTerms(value) {
  return value
    .replaceAll(sourceBrand, "predit")
    .replaceAll(sourceBrand.toLowerCase(), "predit")
    .replaceAll("AGENT_GUIDE.md", "specs/15-announce-and-escalate.md")
    .replaceAll("pipeline_defs/", "bundled/pipelines/")
    .replaceAll("skills/core/", "bundled/skills/core/")
    .replaceAll("skills/meta/", "bundled/skills/meta/")
    .replaceAll(".claude/skills/", ".predit/skills/agents/")
    .replaceAll(".agents/skills/", ".predit/skills/agents/")
    .replaceAll("docs/localization-dubbing-best-practices.md", "bundled/skills/agents/video-translate.md")
    .replaceAll("skills/creative/short-form.md", "bundled/skills/agents/video-edit.md")
    .replaceAll("skills/creative/long-form.md", "bundled/skills/agents/video-edit.md")
    .replaceAll("skills/creative/storytelling.md", "bundled/skills/meta/creative-intake.md")
    .replaceAll("skills/creative/video-editing.md", "bundled/skills/agents/video-edit.md")
    .replaceAll("skills/creative/", "bundled/skills/creative/");
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
    Object.entries(value).filter(([, entryValue]) => {
      if (entryValue === undefined) {
        return false;
      }

      if (Array.isArray(entryValue) && entryValue.length === 0) {
        return false;
      }

      if (isRecord(entryValue) && Object.keys(entryValue).length === 0) {
        return false;
      }

      return true;
    }),
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function localizationSourceReviewDirector() {
  return `# Source Review Director - Localization Dub Pipeline

## When To Use

Run this first for the existing source video. Localization quality depends on knowing what speech, on-screen text, music, and visible-mouth sections are actually present before translation starts.

## Process

### 1. Probe The Source Video

Use the registry tool \`source_media_review\` for the source video. Add transcription, frame sampling, or scene detection when it helps identify speech-bearing sections, baked-in captions, or visible-mouth shots.

### 2. Ground The Source Summary

Each summary must cite technical probe fields such as duration_seconds, resolution, codec, audio streams, or frame-rate details. Do not infer speaker count, dialogue density, or subtitle timing without evidence.

### 3. Identify Localization Risks

Record:

- source language and likely target-language needs,
- visible-mouth sections that may need lip sync or coverage,
- on-screen text, captions, lower thirds, charts, or UI that may need replacement,
- music or effects that should remain under dubbed audio,
- any sections unsuitable for automated video translation.

### 4. Handoff To IDEA And SCRIPT

Give downstream stages a grounded source inventory, transcript confidence notes, timing risks, and protected source elements so translation decisions do not drift away from the actual video.

## Quality Gate

- source video is reviewed before target-language planning,
- summaries cite probe data,
- visible speech and on-screen text risks are explicit,
- no target-language script or HeyGen video-translate job starts from an unreviewed source.
`;
}

function dailyNewsPublishDirector() {
  return `# Publish Director - Daily News Pipeline

## When To Use

Package the finished news roundup after compose has rendered and self-reviewed the episode. Daily-news delivery must preserve provenance: the viewer-facing video, source URLs, real screenshots, captions, and caveats should stay together.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Schema | \`schemas/artifacts/publish_log.schema.json\` | Artifact validation |
| Prior artifacts | \`priorArtifacts.compose\`, \`priorArtifacts.capture\`, \`priorArtifacts.research\`, \`priorArtifacts.script\` | Rendered output, source evidence, and narration context |
| Playbook | Active news-broadcast playbook | Metadata and naming consistency |

## Process

### 1. Package The Episode

Create a delivery folder containing the rendered episode, thumbnail or poster frame, optional caption files, and a source manifest.

### 2. Preserve Source Provenance

Include each selected story's publisher, headline, URL, publish date, captured screenshot path, and capture-quality flags. Do not strip paywall, cookie-banner, or geo-block notes; those notes explain visible artifacts.

### 3. Label Recurring Outputs

Use ISO episode dates and platform labels in filenames so scheduled runs do not collide:

- \`daily-news-YYYY-MM-DD-vertical.mp4\`
- \`daily-news-YYYY-MM-DD-sources.yaml\`
- \`daily-news-YYYY-MM-DD-captions.srt\`

### 4. Quality Gate

- rendered video exists,
- source manifest includes every selected story,
- screenshots and captions are referenced by relative paths,
- capture caveats remain visible in review notes,
- the package is ready for upload or handoff without manual cleanup.

## Common Pitfalls

- Publishing the video without the source manifest.
- Losing capture caveats that explain visible paywalls or cookie banners.
- Reusing yesterday's date or filename in a scheduled run.
`;
}
