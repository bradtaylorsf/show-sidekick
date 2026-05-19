import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { publicCacheDir } from "../paths/project.js";

type QuotaStore = Record<string, Record<string, number>>;

export type QuotaOptions = {
  projectRoot?: string;
  now?: Date;
};

export type UploadRecord = {
  count_today: number;
  warned: boolean;
};

const RETENTION_DAYS = 7;

export function recordUpload(provider: string, options: Date | QuotaOptions = {}): UploadRecord {
  const normalized = normalizeOptions(options);
  const projectRoot = normalized.projectRoot ?? process.cwd();
  const now = normalized.now ?? new Date();
  const today = dateKey(now);
  const store = prune(readStore(projectRoot), now);
  const providerCounts = store[provider] ?? {};
  const count = (providerCounts[today] ?? 0) + 1;
  providerCounts[today] = count;
  store[provider] = providerCounts;
  writeStore(projectRoot, store);

  return {
    count_today: count,
    warned: shouldWarn(provider, count),
  };
}

export function getUploadCount(provider: string, options: Date | QuotaOptions = {}): number {
  const normalized = normalizeOptions(options);
  const projectRoot = normalized.projectRoot ?? process.cwd();
  const now = normalized.now ?? new Date();
  const path = quotaFilePath(projectRoot);
  const store = prune(readStore(projectRoot), now);
  if (existsSync(path)) {
    writeStore(projectRoot, store);
  }
  return store[provider]?.[dateKey(now)] ?? 0;
}

export function shouldWarn(provider: string, count: number): boolean {
  return provider === "catbox" && count === 40;
}

export function quotaFilePath(projectRoot: string): string {
  return join(publicCacheDir(projectRoot), "host-quota.json");
}

function normalizeOptions(options: Date | QuotaOptions): Required<QuotaOptions> | QuotaOptions {
  if (options instanceof Date) {
    return { now: options };
  }

  return options;
}

function readStore(projectRoot: string): QuotaStore {
  const path = quotaFilePath(projectRoot);
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf8")) as QuotaStore;
  } catch {
    return {};
  }
}

function writeStore(projectRoot: string, store: QuotaStore): void {
  const path = quotaFilePath(projectRoot);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function prune(store: QuotaStore, now: Date): QuotaStore {
  const todayMs = Date.parse(`${dateKey(now)}T00:00:00.000Z`);
  const pruned: QuotaStore = {};

  for (const [provider, counts] of Object.entries(store)) {
    const providerCounts: Record<string, number> = {};
    for (const [date, count] of Object.entries(counts)) {
      const ageDays = Math.floor((todayMs - Date.parse(`${date}T00:00:00.000Z`)) / 86_400_000);
      if (ageDays <= RETENTION_DAYS) {
        providerCounts[date] = count;
      }
    }

    if (Object.keys(providerCounts).length > 0) {
      pruned[provider] = providerCounts;
    }
  }

  return pruned;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
