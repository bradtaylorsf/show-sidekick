import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import YAML from "yaml";
import { z } from "zod";
import { loadPipeline } from "../../pipelines/load.js";
import { findProjectRoot, projectPaths } from "../../paths/project.js";
import { Registry } from "../../registry/index.js";
import type { Availability, Tool } from "../../registry/tool.js";
import { safeSlug } from "../scaffold/index.js";
import { ShowSchema, type Show } from "../../shows/show.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type Source = "local" | "bundled";
type ErrorWithCode = Error & { code?: string };

type BaseRow = {
  event: string;
  kind: string;
  name: string;
  path?: string;
  source?: Source;
  [key: string]: unknown;
};

type ToolRow = BaseRow & {
  event: "tool_listed";
  kind: "tools";
  capability: string;
  provider: string;
  status: string;
  available: boolean;
  integration_kind: string;
  reason?: string;
};

type Row = BaseRow | ToolRow;

const StarterMetadataSchema = z
  .object({
    fixture_size_bytes: z.number().int().nonnegative().optional(),
    expected_sample_duration_s: z.number().positive().optional(),
    pending_pipelines: z.array(z.string()).default([]),
  })
  .default({});

type StarterMetadata = z.infer<typeof StarterMetadataSchema>;

export type LsHandlerOptions = {
  registryFactory?: () => Registry;
};

export function createLsHandler(io: CliIo, options: LsHandlerOptions = {}) {
  return async (kind: string, arg: string | undefined, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const globalOptions = command.optsWithGlobals<GlobalOptions>();
    const projectRoot = findProjectRoot();
    const rows = await loadRows(projectRoot, kind, arg, options.registryFactory ?? (() => new Registry()));

    if (globalOptions.json) {
      for (const row of rows) {
        io.stdout.write(`${JSON.stringify(row)}\n`);
      }
      return;
    }

    if (rows.length === 0) {
      io.stdout.write(`ls ${kind}: no rows\n`);
      return;
    }

    io.stdout.write(formatTable(rows) + "\n");
  };
}

async function loadRows(
  projectRoot: string,
  kind: string,
  arg: string | undefined,
  registryFactory: () => Registry,
): Promise<Row[]> {
  switch (kind) {
    case "shows":
      return listShows(projectRoot);
    case "episodes":
      return listEpisodes(projectRoot, requireArg(kind, arg));
    case "pipelines":
      return listPipelines(projectRoot);
    case "playbooks":
      return listPlaybooks(projectRoot);
    case "starters":
      return listStarters(projectRoot);
    case "tools":
      return listTools(registryFactory());
    default:
      throw new Error(`unknown ls kind '${kind}'; expected shows, episodes, pipelines, playbooks, starters, or tools`);
  }
}

async function listShows(projectRoot: string): Promise<Row[]> {
  const paths = projectPaths(projectRoot);
  return mergeNamedRows(
    await listDirectories(paths.shows),
    await listDirectories(path.join(paths.predit, "shows")),
    "show_listed",
    "shows",
  );
}

async function listEpisodes(projectRoot: string, showInput: string): Promise<Row[]> {
  const show = safeSlug(showInput, "show");
  const paths = projectPaths(projectRoot);
  return mergeNamedRows(
    await listYamlFiles(path.join(paths.shows, show, "episodes")),
    await listYamlFiles(path.join(paths.predit, "shows", show, "episodes")),
    "episode_listed",
    "episodes",
  );
}

async function listPipelines(projectRoot: string): Promise<Row[]> {
  const paths = projectPaths(projectRoot);
  const merged = mergeNamedEntries(
    await listYamlFiles(paths.pipelines),
    await listYamlFiles(path.join(paths.predit, "pipelines")),
  );
  const rows: Row[] = [];

  for (const entry of merged) {
    const pipeline = await loadPipeline(projectRoot, entry.name);
    rows.push({
      event: "pipeline_listed",
      kind: "pipelines",
      name: entry.name,
      path: entry.path,
      source: entry.source,
      display_name: pipeline.display_name,
      status: pipeline.status,
    });
  }

  return sortByName(rows);
}

async function listPlaybooks(projectRoot: string): Promise<Row[]> {
  const paths = projectPaths(projectRoot);
  return mergeNamedRows(
    await listYamlFiles(paths.playbooks),
    await listYamlFiles(path.join(paths.predit, "playbooks")),
    "playbook_listed",
    "playbooks",
  );
}

async function listStarters(projectRoot: string): Promise<Row[]> {
  const paths = projectPaths(projectRoot);
  const entries = await listDirectories(path.join(paths.predit, "starters"));
  const rows = await Promise.all(
    entries.map(async (entry) => {
      const showPath = path.join(entry.path, "show.yaml");
      const { show, metadata } = await loadStarterShow(showPath);
      const fixtureSizeBytes =
        metadata.fixture_size_bytes ?? (await directorySize(path.join(entry.path, "inputs")));

      return {
        event: "starter_listed",
        kind: "starters",
        name: entry.name,
        path: entry.path,
        source: "bundled" as const,
        description: show.description,
        pipelines: Object.keys(show.pipelines).sort(),
        fixture_size: formatBytes(fixtureSizeBytes),
        fixture_size_bytes: fixtureSizeBytes,
        sample_duration_s: metadata.expected_sample_duration_s,
      };
    }),
  );

  return sortByName(rows);
}

async function listTools(registry: Registry): Promise<Row[]> {
  await registry.discover();
  await registry.refreshAvailability();

  const tools = registry.all();
  return tools
    .map((tool) => {
      const availability = registry.getAvailability(tool.name);
      return toolRow(tool, availability);
    })
    .sort((left, right) => {
      return (
        left.capability.localeCompare(right.capability) ||
        left.provider.localeCompare(right.provider) ||
        left.name.localeCompare(right.name)
      );
    });
}

function toolRow(tool: Tool, availability: Availability | undefined): ToolRow {
  const unavailable = availability?.available === false ? availability.reason : undefined;

  return {
    event: "tool_listed",
    kind: "tools",
    name: tool.name,
    capability: tool.capability,
    provider: tool.provider,
    status: tool.status,
    available: availability?.available === true,
    integration_kind: tool.integration.kind,
    reason: unavailable,
  };
}

function mergeNamedRows(local: NamedEntry[], bundled: NamedEntry[], event: string, kind: string): Row[] {
  return sortByName(
    mergeNamedEntries(local, bundled).map((entry) => ({
      event,
      kind,
      name: entry.name,
      path: entry.path,
      source: entry.source,
    })),
  );
}

function mergeNamedEntries(local: NamedEntry[], bundled: NamedEntry[]): NamedEntry[] {
  const byName = new Map<string, NamedEntry>();
  for (const entry of bundled) {
    byName.set(entry.name, { ...entry, source: "bundled" });
  }
  for (const entry of local) {
    byName.set(entry.name, { ...entry, source: "local" });
  }
  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

type NamedEntry = {
  name: string;
  path: string;
  source: Source;
};

async function listDirectories(dir: string): Promise<NamedEntry[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(dir, entry.name),
        source: "local" as const,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listYamlFiles(dir: string): Promise<NamedEntry[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
      .map((entry) => ({
        name: path.basename(entry.name, ".yaml"),
        path: path.join(dir, entry.name),
        source: "local" as const,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function loadStarterShow(showPath: string): Promise<{ show: Show; metadata: StarterMetadata }> {
  const raw = await readFile(showPath, "utf8");
  const parsed = YAML.parse(raw) as unknown;
  return {
    show: ShowSchema.parse(parsed),
    metadata: parseStarterMetadata(parsed),
  };
}

function parseStarterMetadata(value: unknown): StarterMetadata {
  if (!isRecord(value) || value.starter === undefined) {
    return StarterMetadataSchema.parse({});
  }

  return StarterMetadataSchema.parse(value.starter);
}

async function directorySize(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          return directorySize(entryPath);
        }
        if (entry.isFile()) {
          return (await stat(entryPath)).size;
        }

        return 0;
      }),
    );

    return sizes.reduce((total, size) => total + size, 0);
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kibibytes = bytes / 1024;
  if (kibibytes < 1024) {
    const rounded = kibibytes >= 10 ? Math.round(kibibytes).toString() : kibibytes.toFixed(1);
    return `${rounded} KB`;
  }

  return `${(kibibytes / 1024).toFixed(1)} MB`;
}

function sortByName<T extends { name: string }>(rows: T[]): T[] {
  return rows.sort((left, right) => left.name.localeCompare(right.name));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireArg(kind: string, value: string | undefined): string {
  if (value === undefined) {
    throw new Error(`ls ${kind} requires an argument`);
  }

  return value;
}

function formatTable(rows: Row[]): string {
  const columns = pickColumns(rows);
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => formatCell(row[column as keyof Row]).length)),
  );
  const lines = [
    columns.map((column, index) => column.padEnd(widths[index] ?? column.length)).join("  "),
    ...rows.map((row) =>
      columns.map((column, index) => formatCell(row[column as keyof Row]).padEnd(widths[index] ?? column.length)).join("  "),
    ),
  ];

  return lines.join("\n");
}

function pickColumns(rows: Row[]): string[] {
  const first = rows[0];
  if (first?.kind === "tools") {
    return ["capability", "provider", "name", "status", "available", "integration_kind"];
  }

  if (first?.kind === "decisions") {
    return ["timestamp", "stage", "category", "picked", "name"];
  }

  if (first?.kind === "starters") {
    return ["name", "description", "pipelines", "fixture_size", "sample_duration_s"];
  }

  return ["name", "source", "path"];
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}
