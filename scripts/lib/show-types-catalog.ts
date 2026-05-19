import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import {
  APPROVED_BUNDLED_PIPELINE_SLUGS,
  SHOW_ONLY_DENYLIST,
  classifyForDefaultStarter,
  isShowOnlyConcept,
} from "../../src/pipelines/demo-inventory.js";

export const SHOW_TYPES_DOC_PATH = "docs/show-types.md";

export const SHOW_TYPE_CATALOG_COLUMNS = [
  "lane_id",
  "description",
  "best_for",
  "pipeline_slug",
  "starter_slug",
  "required_inputs",
  "provider_profile",
  "sample_support",
  "duration_range",
  "aspect_ratios",
  "master_clock",
  "output_artifacts",
  "export_targets",
  "sample_command",
] as const;

export type CatalogLaneKind = "pipeline" | "starter";
export type SampleSupport = "zero-key" | "paid" | "both" | "unsupported";

export type ShowTypeCatalogRow = {
  readonly laneId: string;
  readonly section: string;
  readonly sectionKind: CatalogLaneKind | "unknown";
  readonly description: string;
  readonly bestFor: string;
  readonly pipelineSlug: string;
  readonly starterSlug?: string;
  readonly requiredInputs: readonly string[];
  readonly providerProfile?: string;
  readonly sampleSupport: string;
  readonly durationRange: string;
  readonly aspectRatios: string;
  readonly masterClock: string;
  readonly outputArtifacts: readonly string[];
  readonly exportTargets: readonly string[];
  readonly sampleCommand: string;
  readonly line: number;
};

export type ParsedShowTypeCatalog = {
  readonly rows: readonly ShowTypeCatalogRow[];
};

export type BundledPipelineInfo = {
  readonly slug: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly sampleSupport: SampleSupport;
  readonly masterClock: string;
  readonly defaultAspect?: string;
  readonly durationRange?: string;
  readonly outputArtifacts: readonly string[];
  readonly exportTargets: readonly string[];
  readonly defaultExportTarget?: string;
};

export type BundledStarterInfo = {
  readonly slug: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly sampleSupport: SampleSupport;
  readonly defaultPipeline: string;
  readonly providerProfile?: string;
  readonly expectedSampleDurationS?: number;
  readonly aspect?: string;
  readonly inputs: readonly string[];
};

export type BundledShowTypeInventory = {
  readonly pipelines: ReadonlyMap<string, BundledPipelineInfo>;
  readonly starters: ReadonlyMap<string, BundledStarterInfo>;
};

export type ShowTypeCatalogResolution = {
  readonly row: ShowTypeCatalogRow;
  readonly laneKind?: CatalogLaneKind;
  readonly laneSlug?: string;
  readonly pipeline?: BundledPipelineInfo;
  readonly starter?: BundledStarterInfo;
  readonly errors: readonly string[];
};

export type ShowTypeCatalogValidation = {
  readonly catalog: ParsedShowTypeCatalog;
  readonly inventory: BundledShowTypeInventory;
  readonly resolutions: readonly ShowTypeCatalogResolution[];
  readonly errors: readonly string[];
};

const approvedPipelineSlugs = new Set<string>(APPROVED_BUNDLED_PIPELINE_SLUGS);
const supportedSampleValues = new Set<string>(["zero-key", "paid", "both", "unsupported"]);

export async function loadShowTypeCatalog(input: {
  readonly repoRoot: string;
  readonly catalogPath?: string;
}): Promise<ParsedShowTypeCatalog> {
  const catalogPath = input.catalogPath ?? path.join(input.repoRoot, SHOW_TYPES_DOC_PATH);
  return parseShowTypeCatalog(await readFile(catalogPath, "utf8"));
}

export function parseShowTypeCatalog(markdown: string): ParsedShowTypeCatalog {
  const rows: ShowTypeCatalogRow[] = [];
  const lines = markdown.split(/\r?\n/);
  let currentSection = "";
  let header: string[] | undefined;
  let headerSection = "";
  let headerSectionKind: CatalogLaneKind | "unknown" = "unknown";

  for (const [index, line] of lines.entries()) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      currentSection = heading[1] ?? "";
      header = undefined;
      continue;
    }

    if (!isMarkdownTableLine(line)) {
      header = undefined;
      continue;
    }

    const cells = parseTableCells(line);
    if (cells.length === 0) {
      continue;
    }

    if (normalizeColumnName(cells[0] ?? "") === "lane_id") {
      header = cells.map(normalizeColumnName);
      headerSection = currentSection;
      headerSectionKind = sectionKind(currentSection);
      for (const required of SHOW_TYPE_CATALOG_COLUMNS) {
        if (!header.includes(required)) {
          throw new Error(`show type catalog table is missing column '${required}' near line ${index + 1}`);
        }
      }
      continue;
    }

    if (header === undefined || isMarkdownSeparator(cells)) {
      continue;
    }

    const byColumn = new Map<string, string>();
    for (const [cellIndex, column] of header.entries()) {
      byColumn.set(column, normalizeCell(cells[cellIndex] ?? ""));
    }

    rows.push(rowFromColumns(byColumn, headerSection, headerSectionKind, index + 1));
  }

  return { rows };
}

export async function loadBundledShowTypeInventory(repoRoot: string): Promise<BundledShowTypeInventory> {
  const pipelines = new Map<string, BundledPipelineInfo>();
  const starters = new Map<string, BundledStarterInfo>();
  const pipelinesRoot = path.join(repoRoot, "bundled", "pipelines");
  const startersRoot = path.join(repoRoot, "bundled", "starters");

  for (const slug of APPROVED_BUNDLED_PIPELINE_SLUGS) {
    pipelines.set(slug, pipelineInfo(await readYamlRecord(path.join(pipelinesRoot, `${slug}.yaml`))));
  }

  for (const starterSlug of await directoryNames(startersRoot)) {
    const starterRoot = path.join(startersRoot, starterSlug);
    const show = await readYamlRecord(path.join(starterRoot, "show.yaml"));
    const episode = await readYamlRecord(path.join(starterRoot, "episodes", "sample-episode.yaml"));
    starters.set(starterSlug, starterInfo(starterSlug, show, episode));
  }

  return { pipelines, starters };
}

export async function validateShowTypeCatalog(input: {
  readonly repoRoot: string;
  readonly markdown?: string;
}): Promise<ShowTypeCatalogValidation> {
  const catalog = input.markdown === undefined ? await loadShowTypeCatalog({ repoRoot: input.repoRoot }) : parseShowTypeCatalog(input.markdown);
  const inventory = await loadBundledShowTypeInventory(input.repoRoot);
  const resolutions = resolveShowTypeCatalog(catalog, inventory);
  const errors: string[] = [];

  errors.push(...resolutions.flatMap((resolution) => resolution.errors));
  errors.push(...coverageErrors(catalog, inventory));
  errors.push(...duplicateLaneErrors(catalog));

  return { catalog, inventory, resolutions, errors };
}

export function resolveShowTypeCatalog(
  catalog: ParsedShowTypeCatalog,
  inventory: BundledShowTypeInventory,
): ShowTypeCatalogResolution[] {
  return catalog.rows.map((row) => resolveShowTypeCatalogRow(row, inventory));
}

export function parseLaneId(laneId: string): { readonly kind: CatalogLaneKind; readonly slug: string } | undefined {
  const [kind, slug, ...extra] = laneId.split(":");
  if ((kind === "pipeline" || kind === "starter") && slug !== undefined && slug.length > 0 && extra.length === 0) {
    return { kind, slug };
  }

  return undefined;
}

export function sampleSupportAllowsMode(support: SampleSupport, mode: "zero-key" | "paid-demo"): boolean {
  if (mode === "paid-demo") {
    return support === "paid" || support === "both";
  }

  return support === "zero-key" || support === "both";
}

function resolveShowTypeCatalogRow(
  row: ShowTypeCatalogRow,
  inventory: BundledShowTypeInventory,
): ShowTypeCatalogResolution {
  const errors: string[] = [];
  const lane = parseLaneId(row.laneId);
  let pipeline = inventory.pipelines.get(row.pipelineSlug);
  let starter = row.starterSlug === undefined ? undefined : inventory.starters.get(row.starterSlug);

  if (lane === undefined) {
    errors.push(`${row.laneId}: lane_id must be prefixed with 'pipeline:' or 'starter:'`);
  } else if (lane.kind !== row.sectionKind) {
    errors.push(`${row.laneId}: lane kind does not match catalog section '${row.section}'`);
  }

  if (row.pipelineSlug.length === 0) {
    errors.push(`${row.laneId}: pipeline_slug is required`);
  } else if (isShowOnlyConcept(row.pipelineSlug)) {
    errors.push(`${row.laneId}: '${row.pipelineSlug}' is a show starter concept, not a pipeline slug`);
  } else if (!approvedPipelineSlugs.has(row.pipelineSlug)) {
    errors.push(`${row.laneId}: unknown public pipeline '${row.pipelineSlug}'`);
  } else if (pipeline === undefined) {
    errors.push(`${row.laneId}: bundled pipeline '${row.pipelineSlug}' could not be loaded`);
  }

  if (row.starterSlug !== undefined && starter === undefined) {
    errors.push(`${row.laneId}: unknown bundled starter '${row.starterSlug}'`);
  }

  if (lane?.kind === "pipeline") {
    if (lane.slug !== row.pipelineSlug) {
      errors.push(`${row.laneId}: pipeline lane slug must match pipeline_slug '${row.pipelineSlug}'`);
    }
    if (row.starterSlug !== undefined && starter !== undefined && starter.defaultPipeline !== row.pipelineSlug) {
      errors.push(
        `${row.laneId}: starter '${starter.slug}' defaults to pipeline '${starter.defaultPipeline}', not '${row.pipelineSlug}'`,
      );
    }
  }

  if (lane?.kind === "starter") {
    if (row.starterSlug === undefined) {
      errors.push(`${row.laneId}: starter lanes must name a starter_slug`);
    } else if (lane.slug !== row.starterSlug) {
      errors.push(`${row.laneId}: starter lane slug must match starter_slug '${row.starterSlug}'`);
    }
    if (starter !== undefined) {
      if (starter.defaultPipeline !== row.pipelineSlug) {
        errors.push(
          `${row.laneId}: starter '${starter.slug}' defaults to pipeline '${starter.defaultPipeline}', not '${row.pipelineSlug}'`,
        );
      }
      if (classifyForDefaultStarter(starter.defaultPipeline) === undefined) {
        errors.push(`${row.laneId}: starter default pipeline '${starter.defaultPipeline}' is not approved for default starters`);
      }
    }
  }

  if (!supportedSampleValues.has(row.sampleSupport)) {
    errors.push(`${row.laneId}: sample_support must be zero-key, paid, both, or unsupported`);
  } else {
    const expectedSupport = starter?.sampleSupport ?? pipeline?.sampleSupport;
    if (expectedSupport !== undefined && row.sampleSupport !== expectedSupport) {
      errors.push(`${row.laneId}: sample_support '${row.sampleSupport}' does not match bundled metadata '${expectedSupport}'`);
    }
  }

  if (pipeline !== undefined) {
    if (row.masterClock !== pipeline.masterClock) {
      errors.push(`${row.laneId}: master_clock '${row.masterClock}' does not match pipeline '${pipeline.masterClock}'`);
    }

    const missingExports = pipeline.exportTargets.filter((target) => !row.exportTargets.includes(target));
    if (missingExports.length > 0) {
      errors.push(`${row.laneId}: export_targets is missing ${missingExports.join(", ")}`);
    }

    const missingArtifacts = pipeline.outputArtifacts.filter((artifact) => !row.outputArtifacts.includes(artifact));
    if (missingArtifacts.length > 0) {
      errors.push(`${row.laneId}: output_artifacts is missing ${missingArtifacts.join(", ")}`);
    }
  }

  if (starter !== undefined) {
    const missingInputs = starter.inputs.filter((input) => !row.requiredInputs.includes(input));
    if (missingInputs.length > 0) {
      errors.push(`${row.laneId}: required_inputs is missing ${missingInputs.join(", ")}`);
    }

    const rowProvider = row.providerProfile ?? "none";
    const expectedProvider = starter.providerProfile ?? "none";
    if (rowProvider !== expectedProvider) {
      errors.push(`${row.laneId}: provider_profile '${rowProvider}' does not match starter metadata '${expectedProvider}'`);
    }
  }

  return {
    row,
    laneKind: lane?.kind,
    laneSlug: lane?.slug,
    pipeline,
    starter,
    errors,
  };
}

function coverageErrors(catalog: ParsedShowTypeCatalog, inventory: BundledShowTypeInventory): string[] {
  const errors: string[] = [];
  const documentedPipelines = new Set(
    catalog.rows.filter((row) => parseLaneId(row.laneId)?.kind === "pipeline").map((row) => row.pipelineSlug),
  );
  const documentedStarters = new Set(
    catalog.rows.flatMap((row) => {
      const lane = parseLaneId(row.laneId);
      return lane?.kind === "starter" && row.starterSlug !== undefined ? [row.starterSlug] : [];
    }),
  );

  for (const slug of APPROVED_BUNDLED_PIPELINE_SLUGS) {
    if (!documentedPipelines.has(slug)) {
      errors.push(`missing public pipeline catalog row for '${slug}'`);
    }
  }

  for (const slug of inventory.starters.keys()) {
    if (!documentedStarters.has(slug)) {
      errors.push(`missing public starter catalog row for '${slug}'`);
    }
  }

  for (const slug of SHOW_ONLY_DENYLIST) {
    if (documentedPipelines.has(slug)) {
      errors.push(`show-only concept '${slug}' must not appear as a pipeline catalog row`);
    }
  }

  return errors;
}

function duplicateLaneErrors(catalog: ParsedShowTypeCatalog): string[] {
  const counts = new Map<string, number>();
  for (const row of catalog.rows) {
    counts.set(row.laneId, (counts.get(row.laneId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([laneId]) => `duplicate show type lane '${laneId}'`);
}

function rowFromColumns(
  byColumn: ReadonlyMap<string, string>,
  section: string,
  sectionKindValue: CatalogLaneKind | "unknown",
  line: number,
): ShowTypeCatalogRow {
  return {
    laneId: requiredColumn(byColumn, "lane_id", line),
    section,
    sectionKind: sectionKindValue,
    description: requiredColumn(byColumn, "description", line),
    bestFor: requiredColumn(byColumn, "best_for", line),
    pipelineSlug: requiredSlugColumn(byColumn, "pipeline_slug", line),
    starterSlug: optionalSlug(requiredColumn(byColumn, "starter_slug", line)),
    requiredInputs: commaList(requiredColumn(byColumn, "required_inputs", line)),
    providerProfile: optionalSlug(requiredColumn(byColumn, "provider_profile", line)),
    sampleSupport: requiredColumn(byColumn, "sample_support", line),
    durationRange: requiredColumn(byColumn, "duration_range", line),
    aspectRatios: requiredColumn(byColumn, "aspect_ratios", line),
    masterClock: requiredColumn(byColumn, "master_clock", line),
    outputArtifacts: commaList(requiredColumn(byColumn, "output_artifacts", line)),
    exportTargets: commaList(requiredColumn(byColumn, "export_targets", line)),
    sampleCommand: requiredColumn(byColumn, "sample_command", line),
    line,
  };
}

function pipelineInfo(record: Record<string, unknown>): BundledPipelineInfo {
  const outputArtifacts = new Set<string>();
  for (const stage of arrayAt(record, "stages")) {
    if (!isRecord(stage)) {
      continue;
    }
    const produces = stringAt(stage, "produces");
    if (produces !== undefined) {
      outputArtifacts.add(produces);
    }
    for (const artifact of stringArrayAt(stage, "produces_artifacts")) {
      outputArtifacts.add(artifact);
    }
  }

  const sample = recordAt(record, "sample");
  const durationMin = numberAt(sample, "duration_s_min");
  const durationMax = numberAt(sample, "duration_s_max");

  return {
    slug: requiredStringAt(record, "slug"),
    displayName: stringAt(record, "display_name"),
    description: stringAt(record, "description"),
    sampleSupport: sampleSupportAt(record, "sample_support") ?? "unsupported",
    masterClock: stringAt(record, "master_clock") ?? "none",
    defaultAspect: stringAt(recordAt(record, "defaults"), "aspect"),
    durationRange: durationMin === undefined || durationMax === undefined ? undefined : `${durationMin}-${durationMax}s`,
    outputArtifacts: [...outputArtifacts],
    exportTargets: stringArrayAt(recordAt(record, "export"), "supported_targets"),
    defaultExportTarget: stringAt(recordAt(record, "export"), "default_target"),
  };
}

function starterInfo(
  fallbackSlug: string,
  show: Record<string, unknown>,
  episode: Record<string, unknown>,
): BundledStarterInfo {
  return {
    slug: stringAt(show, "slug") ?? fallbackSlug,
    displayName: stringAt(show, "display_name"),
    description: stringAt(show, "description"),
    sampleSupport: sampleSupportAt(show, "sample_support") ?? "unsupported",
    defaultPipeline: defaultPipelineSlug(show, fallbackSlug),
    providerProfile: stringAt(recordAt(show, "defaults"), "provider_profile"),
    expectedSampleDurationS:
      numberAt(recordAt(show, "starter"), "expected_sample_duration_s") ??
      numberAt(recordAt(episode, "starter"), "expected_sample_duration_s"),
    aspect: stringAt(episode, "aspect"),
    inputs: Object.keys(recordAt(episode, "inputs") ?? {}).sort((left, right) => left.localeCompare(right)),
  };
}

function defaultPipelineSlug(show: Record<string, unknown>, starterSlug: string): string {
  const defaultPipeline = stringAt(recordAt(show, "defaults"), "pipeline");
  if (defaultPipeline !== undefined) {
    return defaultPipeline;
  }

  const pipelines = recordAt(show, "pipelines");
  const firstPipeline = Object.keys(pipelines ?? {}).sort((left, right) => left.localeCompare(right))[0];
  if (firstPipeline !== undefined) {
    return firstPipeline;
  }

  throw new Error(`starter '${starterSlug}' has no default pipeline`);
}

async function directoryNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function readYamlRecord(filePath: string): Promise<Record<string, unknown>> {
  const parsed = YAML.parse(await readFile(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`expected YAML object at ${filePath}`);
  }

  return parsed;
}

function isMarkdownTableLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line);
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownSeparator(cells: readonly string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeCell(value: string): string {
  const trimmed = value.trim();
  const code = /^`([^`]+)`$/.exec(trimmed);
  return code?.[1]?.trim() ?? trimmed;
}

function sectionKind(section: string): CatalogLaneKind | "unknown" {
  const normalized = section.toLowerCase();
  if (normalized.includes("pipeline")) {
    return "pipeline";
  }
  if (normalized.includes("starter")) {
    return "starter";
  }
  return "unknown";
}

function requiredColumn(columns: ReadonlyMap<string, string>, column: string, line: number): string {
  const value = columns.get(column);
  if (value === undefined || value.length === 0) {
    throw new Error(`show type catalog row at line ${line} is missing '${column}'`);
  }
  return value;
}

function requiredSlugColumn(columns: ReadonlyMap<string, string>, column: string, line: number): string {
  const value = optionalSlug(requiredColumn(columns, column, line));
  if (value === undefined) {
    throw new Error(`show type catalog row at line ${line} is missing '${column}'`);
  }
  return value;
}

function optionalSlug(value: string): string | undefined {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized === "none" || normalized === "-" || normalized.toLowerCase() === "n/a") {
    return undefined;
  }
  return normalized;
}

function commaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => normalizeCell(item))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function sampleSupportAt(record: Record<string, unknown> | undefined, key: string): SampleSupport | undefined {
  const value = stringAt(record, key);
  if (value === "zero-key" || value === "paid" || value === "both" || value === "unsupported") {
    return value;
  }
  return undefined;
}

function stringArrayAt(record: Record<string, unknown> | undefined, key: string): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function arrayAt(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function recordAt(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function requiredStringAt(record: Record<string, unknown>, key: string): string {
  const value = stringAt(record, key);
  if (value === undefined) {
    throw new Error(`expected string field '${key}'`);
  }
  return value;
}

function stringAt(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberAt(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
