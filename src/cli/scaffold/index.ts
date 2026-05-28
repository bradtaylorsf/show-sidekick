import { randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { atomicWrite } from "../../checkpoints/io.js";
import { loadYaml } from "../../config/loader.js";
import { PipelineManifestSchema } from "../../pipelines/manifest.js";
import { projectPaths } from "../../paths/project.js";
import { generatePlaybook } from "../../playbooks/generator.js";
import { EpisodeSchema, validateEpisodeAgainstShow, type Episode } from "../../shows/episode.js";
import { deriveInputs } from "../../shows/ingest.js";
import type { LoadedShow } from "../../shows/load.js";
import { ShowSchema } from "../../shows/show.js";

const DEFAULT_SHOW_PIPELINE = "music-video";

type ErrorWithCode = Error & { code?: string };

export type ScaffoldResult = {
  slug: string;
  filePath: string;
};

export type ShowScaffoldOptions = {
  slug: string;
  pipelines?: string[];
  fromStarter?: string;
};

export type EpisodeScaffoldOptions = {
  show: LoadedShow;
  slug?: string;
  pipeline?: string;
  fromPath?: string;
};

export async function scaffoldShow(projectRoot: string, options: ShowScaffoldOptions): Promise<ScaffoldResult> {
  const slug = safeSlug(options.slug, "show");
  const pipelines = normalizePipelines(options.pipelines);
  const paths = projectPaths(projectRoot);
  const showDir = path.join(paths.shows, slug);
  const starter = options.fromStarter ? safeSlug(options.fromStarter, "starter") : undefined;
  await assertMissing(showDir, "show");
  await mkdir(path.dirname(showDir), { recursive: true });

  if (starter) {
    const starterDir = path.join(paths.cache, "starters", starter);
    const starterShowPath = path.join(starterDir, "show.yaml");
    if (!(await exists(starterDir))) {
      throw new Error(`starter '${starter}' not found at ${starterDir}`);
    }
    if (!(await exists(starterShowPath))) {
      throw new Error(`starter '${starter}' is missing show.yaml at ${starterShowPath}`);
    }
    await cp(starterDir, showDir, { recursive: true });
  }

  await mkdir(path.join(showDir, "brand"), { recursive: true });
  await mkdir(path.join(showDir, "characters"), { recursive: true });
  await mkdir(path.join(showDir, "skills"), { recursive: true });
  await mkdir(path.join(showDir, "pipelines"), { recursive: true });
  await mkdir(path.join(showDir, "episodes"), { recursive: true });

  const filePath = path.join(showDir, "show.yaml");
  if (starter) {
    await normalizeStarterShow(filePath, slug);
    await rewriteStarterShowReferences(showDir, starter, slug);
    return { slug, filePath };
  }

  const show = ShowSchema.parse({
    slug,
    display_name: titleize(slug),
    created: today(),
    brand: "./brand/",
    characters: "./characters/",
    skills: "./skills/",
    pipelines: Object.fromEntries(pipelines.map((pipeline) => [pipeline, {}])),
    defaults: {
      pipeline: pipelines[0],
      language: "en",
    },
  });

  await atomicWrite(filePath, YAML.stringify(show));
  return { slug, filePath };
}

export async function scaffoldEpisode(
  projectRoot: string,
  options: EpisodeScaffoldOptions,
): Promise<ScaffoldResult> {
  const slug = safeSlug(options.slug ?? defaultEpisodeSlug(), "episode");
  const pipeline = options.pipeline ?? options.show.defaults.pipeline;
  const filePath = path.join(projectPaths(projectRoot).shows, options.show.slug, "episodes", `${slug}.yaml`);
  await assertMissing(filePath, "episode");
  assertEpisodePipelineAllowed({ slug, pipeline }, options.show);

  const template = options.fromPath === undefined ? undefined : await loadEpisodeTemplate(options.show);
  const inputs =
    options.fromPath === undefined
      ? {}
      : await deriveEpisodeInputsFromSource(projectRoot, {
          show: options.show,
          episode: slug,
          sourcePath: options.fromPath,
          templateInputs: template?.inputs,
        });
  const episode = {
    slug,
    title: titleize(slug),
    created: today(),
    pipeline,
    inputs,
    cast: template?.cast ?? [],
    tags: mergeTags(template?.tags, pipeline),
  };
  const parsedEpisode = EpisodeSchema.parse(episode);
  const validation = validateEpisodeAgainstShow(parsedEpisode, options.show);

  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }

  await atomicWrite(filePath, YAML.stringify(episode));

  return { slug, filePath };
}

function assertEpisodePipelineAllowed(input: { slug: string; pipeline: string }, show: LoadedShow): void {
  const validation = validateEpisodeAgainstShow(
    EpisodeSchema.parse({
      slug: input.slug,
      title: titleize(input.slug),
      created: today(),
      pipeline: input.pipeline,
      inputs: {},
      cast: [],
      tags: [input.pipeline],
    }),
    show,
  );

  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }
}

async function loadEpisodeTemplate(show: LoadedShow): Promise<Episode | undefined> {
  if (show.ingest?.episode_template === undefined) {
    return undefined;
  }

  const templatePath = path.resolve(show.rootDir, show.ingest.episode_template);
  return EpisodeSchema.parse(await loadYaml(templatePath, EpisodeSchema));
}

async function deriveEpisodeInputsFromSource(
  projectRoot: string,
  input: {
    show: LoadedShow;
    episode: string;
    sourcePath: string;
    templateInputs?: Record<string, unknown>;
  },
): Promise<Record<string, string>> {
  const copied = await copyEpisodeSource(projectRoot, input);
  return deriveInputs(copied.primaryFilePath, { show: input.show }, { templateInputs: input.templateInputs });
}

async function copyEpisodeSource(
  projectRoot: string,
  input: {
    show: LoadedShow;
    episode: string;
    sourcePath: string;
  },
): Promise<{ primaryFilePath: string }> {
  const sourcePath = path.resolve(input.sourcePath);
  const sourceStats = await stat(sourcePath);
  const inputDir = path.join(projectPaths(projectRoot).inputs, input.show.slug, input.episode);

  await assertMissing(inputDir, "episode input folder");
  await mkdir(path.dirname(inputDir), { recursive: true });

  if (sourceStats.isDirectory()) {
    const sourcePrimaryFilePath = await findPrimaryInputFile(sourcePath);
    if (sourcePrimaryFilePath === undefined) {
      throw new Error(`source folder contains no input files: ${sourcePath}`);
    }
    await cp(sourcePath, inputDir, { recursive: true, errorOnExist: true, force: false });
    const primaryFilePath = path.join(inputDir, path.relative(sourcePath, sourcePrimaryFilePath));
    return { primaryFilePath };
  }

  if (!sourceStats.isFile()) {
    throw new Error(`source path is not a file or folder: ${sourcePath}`);
  }

  await mkdir(inputDir, { recursive: true });
  const copiedPath = path.join(inputDir, path.basename(sourcePath));
  await cp(sourcePath, copiedPath, { errorOnExist: true, force: false });
  return { primaryFilePath: copiedPath };
}

async function findPrimaryInputFile(root: string): Promise<string | undefined> {
  const files = await listFilesRecursive(root);
  return files.sort(byInputPriority)[0];
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort(byName)) {
    const absolutePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function byInputPriority(left: string, right: string): number {
  const priority = inputPriority(left) - inputPriority(right);
  return priority === 0 ? left.localeCompare(right) : priority;
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function inputPriority(filePath: string): number {
  const extension = path.extname(filePath).toLowerCase();

  if ([".pdf", ".ppt", ".pptx"].includes(extension)) {
    return 0;
  }

  if ([".mp3", ".wav", ".m4a", ".aac", ".aiff"].includes(extension)) {
    return 1;
  }

  if ([".mp4", ".mov", ".webm", ".mpeg"].includes(extension)) {
    return 2;
  }

  if ([".jpg", ".jpeg", ".png", ".gif"].includes(extension)) {
    return 3;
  }

  if ([".txt", ".md", ".srt"].includes(extension)) {
    return 4;
  }

  if ([".yaml", ".yml", ".json", ".csv", ".tsv"].includes(extension)) {
    return 5;
  }

  return 6;
}

function mergeTags(templateTags: string[] | undefined, pipeline: string): string[] {
  return [...new Set([pipeline, ...(templateTags ?? [])])];
}

export async function scaffoldPipeline(projectRoot: string, slugInput: string): Promise<ScaffoldResult> {
  const slug = safeSlug(slugInput, "pipeline");
  const filePath = path.join(projectPaths(projectRoot).pipelines, `${slug}.yaml`);
  const skillPath = path.join(projectPaths(projectRoot).skills, "pipelines", slug, "idea-director.md");
  await assertMissing(filePath, "pipeline");
  await assertMissing(skillPath, "director skill");

  const manifest = PipelineManifestSchema.parse({
    slug,
    display_name: titleize(slug),
    status: "experimental",
    master_clock: "none",
    stages: [
      {
        slug: "idea",
        skill: `pipelines/${slug}/idea-director.md`,
        produces: "brief",
        human_approval: "optional",
      },
    ],
  });

  await atomicWrite(filePath, YAML.stringify(manifest));
  await atomicWrite(skillPath, directorSkill(slug));
  return { slug, filePath };
}

export async function scaffoldPlaybook(projectRoot: string, slugInput: string): Promise<ScaffoldResult> {
  const slug = safeSlug(slugInput, "playbook");
  const filePath = path.join(projectPaths(projectRoot).playbooks, `${slug}.yaml`);
  await assertMissing(filePath, "playbook");
  await atomicWrite(
    filePath,
    YAML.stringify(generatePlaybook({ slug, name: titleize(slug), brief: "Project-local playbook override." })),
  );
  return { slug, filePath };
}

export async function listYamlSlugs(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => path.basename(entry.name, ".yaml"))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function safeSlug(value: string, label: string): string {
  if (
    value === "" ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error(`invalid ${label} slug '${value}'`);
  }

  return value;
}

async function normalizeStarterShow(filePath: string, slug: string): Promise<void> {
  const starterShow = YAML.parse(await readFile(filePath, "utf8")) as unknown;

  if (!isRecord(starterShow)) {
    throw new Error(`starter show.yaml must be an object at ${filePath}`);
  }

  const show = {
    ...starterShow,
    slug,
    display_name: typeof starterShow.display_name === "string" ? starterShow.display_name : titleize(slug),
    created: starterShow.created ?? today(),
  };

  ShowSchema.parse(show);
  await atomicWrite(filePath, YAML.stringify(show));
}

async function rewriteStarterShowReferences(showDir: string, starter: string, slug: string): Promise<void> {
  if (starter === slug) {
    return;
  }

  const files = [path.join(showDir, "episode.template.yaml"), ...(await listYamlFiles(path.join(showDir, "episodes")))];
  const from = `shows/${starter}/`;
  const to = `shows/${slug}/`;

  for (const filePath of files) {
    if (!(await exists(filePath))) {
      continue;
    }

    const current = await readFile(filePath, "utf8");
    const next = current.replaceAll(from, to);
    if (next !== current) {
      await atomicWrite(filePath, next);
    }
  }
}

async function listYamlFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function assertMissing(targetPath: string, label: string): Promise<void> {
  if (await exists(targetPath)) {
    throw new Error(`refuses to clobber existing ${label} at ${targetPath}`);
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function normalizePipelines(values: string[] | undefined): string[] {
  const pipelines = (values && values.length > 0 ? values : [DEFAULT_SHOW_PIPELINE]).map((value) =>
    safeSlug(value, "pipeline"),
  );
  return [...new Set(pipelines)];
}

function directorSkill(slug: string): string {
  const title = titleize(slug);

  return [
    "---",
    `name: "${slug}-idea-director"`,
    `description: "Produce brief for the ${title} pipeline."`,
    `applies_to: "pipelines/${slug}"`,
    'stage: "idea"',
    'produces: "brief"',
    "---",
    `# Idea Director - ${title}`,
    "",
    "## Goal",
    "",
    `Produce a schema-valid brief for the ${title} pipeline that gives downstream stages a concrete creative direction.`,
    "",
    "## Inputs",
    "",
    "Read the show defaults, episode inputs, playbook, prior artifacts, and any user notes before making creative decisions.",
    "",
    "## Workflow",
    "",
    "1. Restate the episode objective in one sentence.",
    "2. Identify the intended audience, platform, tone, duration, and key points.",
    "3. Name unresolved assumptions instead of inventing unavailable source material.",
    "4. Keep sample runs small and explicit about cost-sensitive choices.",
    "",
    "## Quality Bar",
    "",
    "- The artifact matches `schemas/artifacts/brief.schema.json`.",
    "- The handoff is specific enough for the next stage to act on.",
    "- The output avoids references to private harness paths or migration-only material.",
    "",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEpisodeSlug(): string {
  return `${today()}-${randomUUID().slice(0, 8)}`;
}

export function titleize(slug: string): string {
  return slug
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
