import { access } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CuesheetSchema, type CuesheetWord } from "../artifacts/cuesheet.js";
import { ScriptSchema } from "../artifacts/script.js";
import { ConfigError, type ConfigIssue } from "../config/errors.js";
import { loadYaml } from "../config/loader.js";
import {
  AbsoluteFill,
  cuesheetToWords,
  overlayCatalog,
  renderOverlayByType,
  renderSceneByType,
  sceneCatalog,
  type OverlayType,
  type SceneNode,
  type SceneType,
} from "../remotion/index.js";

const RecipeTimelineSchema = z.record(z.string(), z.unknown()).default({});

const RecipeOverlayEntrySchema = z
  .object({
    component: z.string().min(1),
    props: z.record(z.string(), z.unknown()).default({}),
    timeline: RecipeTimelineSchema,
  })
  .strict();

export const ComposeOverlayRecipeSchema = z
  .object({
    overlays: z.array(RecipeOverlayEntrySchema).default([]),
  })
  .strict();

export const ResolvedComposeOverlaySchema = z.object({
  component: z.string().min(1),
  registry: z.enum(["overlay", "scene"]),
  props: z.record(z.string(), z.unknown()),
  timeline: RecipeTimelineSchema,
});

export const ResolvedComposeOverlaysSchema = z.array(ResolvedComposeOverlaySchema);

export type ComposeOverlayRecipe = z.output<typeof ComposeOverlayRecipeSchema>;
export type ResolvedComposeOverlay = z.output<typeof ResolvedComposeOverlaySchema>;

export type ComposeRecipeContext = {
  projectRoot: string;
  show: {
    slug: string;
    display_name: string;
    description?: string;
    rootDir: string;
    brandPath?: string;
    [key: string]: unknown;
  };
  episode: {
    slug: string;
    title: string;
    filePath?: string;
    [key: string]: unknown;
  };
  brand?: unknown;
  script?: unknown;
  cuesheet?: unknown;
  playbook?: unknown;
  fps?: number;
  resolution?: {
    width: number;
    height: number;
  };
  durationS?: number;
};

type CatalogEntry =
  | {
      registry: "overlay";
      component: OverlayType;
      schema: z.ZodType<unknown>;
    }
  | {
      registry: "scene";
      component: SceneType;
      schema: z.ZodType<unknown>;
    };

export async function loadShowComposeRecipe(context: ComposeRecipeContext): Promise<ResolvedComposeOverlay[]> {
  const recipePath = await findComposeRecipePath(context.show.rootDir);
  if (recipePath === undefined) {
    return [];
  }

  return loadComposeRecipeFile(recipePath, context);
}

export async function loadComposeRecipeFile(filePath: string, context: ComposeRecipeContext): Promise<ResolvedComposeOverlay[]> {
  const recipe = (await loadYaml(filePath, ComposeOverlayRecipeSchema)) as ComposeOverlayRecipe;
  return resolveComposeRecipe(recipe, context, filePath);
}

export function resolveComposeRecipe(
  recipe: ComposeOverlayRecipe,
  context: ComposeRecipeContext,
  filePath = path.join(context.show.rootDir, "compose", "recipe.yaml"),
): ResolvedComposeOverlay[] {
  const templateContext = buildTemplateContext(context);

  return recipe.overlays.map((entry, index) => {
    const catalog = catalogEntry(entry.component, filePath, index);
    const templatePath = `overlays.${index}`;
    const timeline = resolveTemplateValue(entry.timeline, templateContext, filePath, `${templatePath}.timeline`);
    const props = resolveTemplateValue(entry.props, templateContext, filePath, `${templatePath}.props`);
    const normalizedProps = normalizeProps(catalog, asRecord(props), context, asRecord(timeline), filePath, index);
    const propsWithDefaults = withBaseProps(normalizedProps, context, asRecord(timeline));
    const parsedProps = catalog.schema.safeParse(propsWithDefaults);

    if (!parsedProps.success) {
      throw new ConfigError({
        filePath,
        issues: parsedProps.error.issues.map((issue): ConfigIssue => {
          return {
            path: [`overlays.${index}.props`, ...issue.path].filter(Boolean).join("."),
            message: issue.message,
          };
        }),
      });
    }

    return ResolvedComposeOverlaySchema.parse({
      component: catalog.component,
      registry: catalog.registry,
      props: asRecord(parsedProps.data),
      timeline: asRecord(timeline),
    });
  });
}

export function renderResolvedOverlayFrame(overlays: ResolvedComposeOverlay[], frame = 0): SceneNode {
  const parsed = ResolvedComposeOverlaysSchema.parse(overlays);

  return AbsoluteFill({
    children: parsed.map((overlay) =>
      overlay.registry === "overlay"
        ? renderOverlayByType(overlay.component as OverlayType, overlay.props, frame)
        : renderSceneByType(overlay.component as SceneType, overlay.props, frame),
    ),
  });
}

export function overlayTimelineFrames(
  timeline: Record<string, unknown>,
  fps: number,
  fallbackDurationFrames: number,
): { startFrame: number; durationFrames: number } {
  const fallbackDurationS = fallbackDurationFrames / fps;
  const fromS = numericTimelineValue(timeline.from_s) ?? 0;
  const toS =
    timeline.to_s === "end" || timeline.to_s === undefined ? fallbackDurationS : numericTimelineValue(timeline.to_s) ?? fallbackDurationS;
  const boundedFromS = Math.max(0, Math.min(fromS, fallbackDurationS));
  const boundedToS = Math.max(boundedFromS + 1 / fps, Math.min(toS, fallbackDurationS));

  return {
    startFrame: Math.round(boundedFromS * fps),
    durationFrames: Math.max(1, Math.round((boundedToS - boundedFromS) * fps)),
  };
}

async function findComposeRecipePath(showRootDir: string): Promise<string | undefined> {
  for (const filename of ["recipe.yaml", "recipe.yml"]) {
    const candidate = path.join(showRootDir, "compose", filename);
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

function catalogEntry(component: string, filePath: string, index: number): CatalogEntry {
  if (component.startsWith("scene.")) {
    const name = component.slice("scene.".length);
    if (isSceneType(name)) {
      return { registry: "scene", component: name, schema: sceneCatalog[name].schema as z.ZodType<unknown> };
    }
  }

  if (component.startsWith("overlay.")) {
    const name = component.slice("overlay.".length);
    if (isOverlayType(name)) {
      return { registry: "overlay", component: name, schema: overlayCatalog[name].schema as z.ZodType<unknown> };
    }
  }

  if (isOverlayType(component)) {
    return { registry: "overlay", component, schema: overlayCatalog[component].schema as z.ZodType<unknown> };
  }

  if (isSceneType(component)) {
    return { registry: "scene", component, schema: sceneCatalog[component].schema as z.ZodType<unknown> };
  }

  throw new ConfigError({
    filePath,
    issues: [
      {
        path: `overlays.${index}.component`,
        message: `unknown component '${component}'. Available overlays: ${Object.keys(overlayCatalog).join(", ")}. Available scenes: ${Object.keys(sceneCatalog).join(", ")}.`,
      },
    ],
  });
}

function normalizeProps(
  catalog: CatalogEntry,
  props: Record<string, unknown>,
  context: ComposeRecipeContext,
  timeline: Record<string, unknown>,
  filePath: string,
  index: number,
): Record<string, unknown> {
  if (catalog.registry !== "overlay" || catalog.component !== "caption_burn") {
    return props;
  }

  const { source, ...rest } = props;
  if (rest.words !== undefined) {
    return rest;
  }

  if (source === "script") {
    return { ...rest, words: wordsFromScript(context.script, filePath, index) };
  }

  if (source === "cuesheet") {
    return { ...rest, words: wordsFromCuesheet(context.cuesheet, filePath, index) };
  }

  if (timeline.sync === "script") {
    return { ...rest, words: wordsFromScript(context.script, filePath, index) };
  }

  throw new ConfigError({
    filePath,
    issues: [
      {
        path: `overlays.${index}.props.source`,
        message: "caption_burn requires props.source to be 'script' or 'cuesheet', or a props.words array.",
      },
    ],
  });
}

function withBaseProps(
  props: Record<string, unknown>,
  context: ComposeRecipeContext,
  timeline: Record<string, unknown>,
): Record<string, unknown> {
  const fps = context.fps ?? 30;
  const fallbackDurationS = context.durationS ?? durationFromContext(context) ?? 5;
  const fallbackDurationFrames = Math.max(1, Math.round(fallbackDurationS * fps));
  const timelineFrames = overlayTimelineFrames(timeline, fps, fallbackDurationFrames);
  const base: Record<string, unknown> = {
    fps,
    duration_frames: timelineFrames.durationFrames,
  };

  if (context.resolution !== undefined) {
    base.width = context.resolution.width;
    base.height = context.resolution.height;
  }

  return {
    ...base,
    ...props,
  };
}

function buildTemplateContext(context: ComposeRecipeContext): Record<string, unknown> {
  const brandDir = context.show.brandPath ?? path.join(context.show.rootDir, "brand");
  const show = {
    ...context.show,
    root_dir: context.show.rootDir,
    brand_dir: brandDir,
    brand_path: context.show.brandPath,
  };
  const episode = {
    ...context.episode,
    file_path: context.episode.filePath,
  };
  const brand =
    context.brand === undefined
      ? {
          dir: brandDir,
          path: context.show.brandPath ?? brandDir,
        }
      : context.brand;

  return {
    brand,
    cuesheet: context.cuesheet,
    episode,
    playbook: context.playbook,
    project: {
      root: context.projectRoot,
    },
    script: context.script,
    show,
  };
}

function resolveTemplateValue(value: unknown, context: Record<string, unknown>, filePath: string, configPath: string): unknown {
  if (typeof value === "string") {
    return resolveTemplateString(value, context, filePath, configPath);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => resolveTemplateValue(item, context, filePath, `${configPath}.${index}`));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, resolveTemplateValue(nested, context, filePath, `${configPath}.${key}`)]),
    );
  }

  return value;
}

function resolveTemplateString(value: string, context: Record<string, unknown>, filePath: string, configPath: string): unknown {
  const exactMatch = /^\{\{\s*([^{}]+?)\s*\}\}$/u.exec(value);
  if (exactMatch) {
    return evaluateTemplateExpression(exactMatch[1] ?? "", context, filePath, configPath);
  }

  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/gu, (_match, expression: string) =>
    stringifyTemplateValue(evaluateTemplateExpression(expression, context, filePath, configPath)),
  );
}

function evaluateTemplateExpression(expression: string, context: Record<string, unknown>, filePath: string, configPath: string): unknown {
  const [pathExpression, ...filters] = expression.split("|").map((part) => part.trim());
  if (!pathExpression) {
    throw templateError(filePath, configPath, "empty template expression");
  }

  let value = lookupTemplatePath(pathExpression, context, filePath, configPath);
  for (const filter of filters) {
    value = applyTemplateFilter(value, filter, filePath, configPath);
  }

  return value;
}

function lookupTemplatePath(pathExpression: string, context: Record<string, unknown>, filePath: string, configPath: string): unknown {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*$/u.test(pathExpression)) {
    throw templateError(filePath, configPath, `unsupported template path '${pathExpression}'`);
  }

  const segments = pathExpression.split(".");
  let current: unknown = context;

  for (const segment of segments) {
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number.parseInt(segment, 10)];
      continue;
    }

    if (isRecord(current) && segment in current) {
      current = current[segment];
      continue;
    }

    throw templateError(filePath, configPath, `unknown template path '${pathExpression}'`);
  }

  return current;
}

function applyTemplateFilter(value: unknown, filter: string, filePath: string, configPath: string): unknown {
  if (filter === "upper") {
    return stringifyTemplateValue(value).toUpperCase();
  }

  if (filter === "lower") {
    return stringifyTemplateValue(value).toLowerCase();
  }

  if (filter === "trim") {
    return stringifyTemplateValue(value).trim();
  }

  if (filter === "json") {
    return JSON.stringify(value);
  }

  throw templateError(filePath, configPath, `unknown template filter '${filter}'`);
}

function wordsFromScript(script: unknown, filePath: string, index: number): CuesheetWord[] {
  const parsed = ScriptSchema.safeParse(script);
  if (!parsed.success) {
    throw new ConfigError({
      filePath,
      issues: [
        {
          path: `overlays.${index}.props.source`,
          message: "caption_burn source 'script' requires a valid script artifact in context.",
        },
      ],
    });
  }

  return parsed.data.sections.flatMap((section) => {
    const text = section.narration ?? section.dialogue.map((line) => line.line).join(" ");
    const words = text.match(/\S+/gu) ?? [];
    if (words.length === 0) {
      return [];
    }

    const durationS = Math.max(0.001, section.end_s - section.start_s);
    const wordDurationS = durationS / words.length;

    return words.map((word, wordIndex) => ({
      text: word,
      start_s: section.start_s + wordIndex * wordDurationS,
      end_s: Math.min(section.end_s, section.start_s + (wordIndex + 1) * wordDurationS),
      confidence: 1,
    }));
  });
}

function wordsFromCuesheet(cuesheet: unknown, filePath: string, index: number): CuesheetWord[] {
  const parsed = CuesheetSchema.safeParse(cuesheet);
  if (!parsed.success) {
    throw new ConfigError({
      filePath,
      issues: [
        {
          path: `overlays.${index}.props.source`,
          message: "caption_burn source 'cuesheet' requires a valid cuesheet artifact in context.",
        },
      ],
    });
  }

  return cuesheetToWords(parsed.data);
}

function durationFromContext(context: ComposeRecipeContext): number | undefined {
  const script = ScriptSchema.safeParse(context.script);
  if (script.success) {
    return script.data.sections.reduce((max, section) => Math.max(max, section.end_s), 0);
  }

  const cuesheet = CuesheetSchema.safeParse(context.cuesheet);
  if (cuesheet.success) {
    return cuesheet.data.audio.duration_s;
  }

  return undefined;
}

function numericTimelineValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringifyTemplateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function templateError(filePath: string, pathName: string, message: string): ConfigError {
  return new ConfigError({
    filePath,
    issues: [{ path: pathName, message }],
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOverlayType(value: string): value is OverlayType {
  return value in overlayCatalog;
}

function isSceneType(value: string): value is SceneType {
  return value in sceneCatalog;
}
