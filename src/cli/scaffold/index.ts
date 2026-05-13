import { randomUUID } from "node:crypto";
import { cp, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { atomicWrite } from "../../checkpoints/io.js";
import { PipelineManifestSchema } from "../../pipelines/manifest.js";
import { projectPaths } from "../../paths/project.js";
import { EpisodeSchema, validateEpisodeAgainstShow } from "../../shows/episode.js";
import type { LoadedShow } from "../../shows/load.js";
import { ShowSchema } from "../../shows/show.js";

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
};

export async function scaffoldShow(projectRoot: string, options: ShowScaffoldOptions): Promise<ScaffoldResult> {
  const slug = safeSlug(options.slug, "show");
  const pipelines = normalizePipelines(options.pipelines);
  const paths = projectPaths(projectRoot);
  const showDir = path.join(paths.shows, slug);
  await assertMissing(showDir, "show");
  await mkdir(path.dirname(showDir), { recursive: true });

  if (options.fromStarter) {
    const starterDir = path.join(paths.predit, "starters", safeSlug(options.fromStarter, "starter"));
    if (await exists(starterDir)) {
      await cp(starterDir, showDir, { recursive: true });
    }
  }

  await mkdir(path.join(showDir, "brand"), { recursive: true });
  await mkdir(path.join(showDir, "characters"), { recursive: true });
  await mkdir(path.join(showDir, "skills"), { recursive: true });
  await mkdir(path.join(showDir, "pipelines"), { recursive: true });
  await mkdir(path.join(showDir, "episodes"), { recursive: true });

  const filePath = path.join(showDir, "show.yaml");
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
  const validation = validateEpisodeAgainstShow(
    EpisodeSchema.parse({
      slug,
      title: titleize(slug),
      created: today(),
      pipeline,
      inputs: {},
      cast: [],
      tags: [pipeline],
    }),
    options.show,
  );

  if (!validation.ok) {
    throw new Error(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }

  const filePath = path.join(projectPaths(projectRoot).shows, options.show.slug, "episodes", `${slug}.yaml`);
  await assertMissing(filePath, "episode");
  await atomicWrite(
    filePath,
    YAML.stringify({
      slug,
      title: titleize(slug),
      created: today(),
      pipeline,
      inputs: {},
      cast: [],
      tags: [pipeline],
    }),
  );

  return { slug, filePath };
}

export async function scaffoldPipeline(projectRoot: string, slugInput: string): Promise<ScaffoldResult> {
  const slug = safeSlug(slugInput, "pipeline");
  const filePath = path.join(projectPaths(projectRoot).pipelines, `${slug}.yaml`);
  await assertMissing(filePath, "pipeline");

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
  return { slug, filePath };
}

export async function scaffoldPlaybook(projectRoot: string, slugInput: string): Promise<ScaffoldResult> {
  const slug = safeSlug(slugInput, "playbook");
  const filePath = path.join(projectPaths(projectRoot).playbooks, `${slug}.yaml`);
  await assertMissing(filePath, "playbook");
  await atomicWrite(
    filePath,
    YAML.stringify({
      slug,
      display_name: titleize(slug),
      description: "Project-local playbook override.",
      palette: {},
      typography: {},
      motion: {},
    }),
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

async function assertMissing(targetPath: string, label: string): Promise<void> {
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
  const pipelines = (values && values.length > 0 ? values : ["default"]).map((value) => safeSlug(value, "pipeline"));
  return [...new Set(pipelines)];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEpisodeSlug(): string {
  return `${today()}-${randomUUID().slice(0, 8)}`;
}

function titleize(slug: string): string {
  return slug
    .split(/[-_]/u)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
