import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

/**
 * Thin HTTP client for a ComfyUI server the user runs themselves (by default the
 * one on this machine). It speaks ComfyUI's own API — nothing here talks to
 * Comfy Cloud or any metered service.
 */

export const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";

export type ComfyFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ComfyLink = [string, number];

export type ComfyNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title?: string };
};

export type ComfyGraph = Record<string, ComfyNode>;

export type ComfyFileRef = {
  filename: string;
  subfolder: string;
  type: string;
};

export type ComfyHistoryEntry = {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: unknown[];
  };
  outputs?: Record<string, Record<string, unknown>>;
};

export type ComfySystemStats = {
  system?: {
    os?: string;
    comfyui_version?: string;
    ram_total?: number;
    ram_free?: number;
    argv?: string[];
  };
  devices?: Array<{ name?: string; type?: string; vram_total?: number; vram_free?: number }>;
};

export type ComfyNodeInfo = {
  input?: {
    required?: Record<string, unknown>;
    optional?: Record<string, unknown>;
  };
  output?: string[];
  python_module?: string;
};

export type ComfyErrorCode = "unreachable" | "http" | "rejected" | "execution" | "timeout" | "missing_output";

export class ComfyError extends Error {
  readonly code: ComfyErrorCode;
  readonly details?: unknown;

  constructor(code: ComfyErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ComfyError";
    this.code = code;
    this.details = details;
  }
}

export type ComfyClientOptions = {
  baseUrl?: string;
  fetch?: ComfyFetch;
  /** Timeout for short metadata calls (stats, object_info, model lists). */
  requestTimeoutMs?: number;
  /** Delay between /history polls while a job runs. */
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export function resolveComfyUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SHOW_SIDEKICK_COMFY_URL ?? env.COMFY_URL;
  const value = configured === undefined || configured.trim() === "" ? DEFAULT_COMFY_URL : configured.trim();
  return value.replace(/\/+$/u, "");
}

export class ComfyClient {
  readonly baseUrl: string;
  private readonly fetchImpl: ComfyFetch;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private objectInfoCache: Promise<Record<string, ComfyNodeInfo>> | undefined;
  private readonly modelCache = new Map<string, Promise<string[] | undefined>>();

  constructor(options: ComfyClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? resolveComfyUrl()).replace(/\/+$/u, "");
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.requestTimeoutMs = options.requestTimeoutMs ?? 2_500;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  async systemStats(): Promise<ComfySystemStats> {
    return (await this.getJson("/system_stats")) as ComfySystemStats;
  }

  async isReachable(): Promise<{ reachable: true; stats: ComfySystemStats } | { reachable: false; reason: string }> {
    try {
      return { reachable: true, stats: await this.systemStats() };
    } catch (error) {
      return { reachable: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Node class catalog. Cached for the life of this client; pass refresh to re-read. */
  async objectInfo(options: { refresh?: boolean } = {}): Promise<Record<string, ComfyNodeInfo>> {
    if (options.refresh === true || this.objectInfoCache === undefined) {
      this.objectInfoCache = this.getJson("/object_info", { timeoutMs: Math.max(this.requestTimeoutMs, 15_000) }).then(
        (value) => (isRecord(value) ? (value as Record<string, ComfyNodeInfo>) : {}),
      );
      this.objectInfoCache.catch(() => {
        this.objectInfoCache = undefined;
      });
    }

    return await this.objectInfoCache;
  }

  /**
   * Files in one ComfyUI model folder (`GET /models/<folder>`), using the server's
   * folder keys (e.g. `unet_gguf`, `clip_gguf`, `seedvr2`). Returns undefined when
   * the server does not know the folder.
   */
  async listModels(folder: string): Promise<string[] | undefined> {
    let cached = this.modelCache.get(folder);
    if (cached === undefined) {
      cached = this.fetchModelFolder(folder);
      this.modelCache.set(folder, cached);
      cached.catch(() => this.modelCache.delete(folder));
    }

    return await cached;
  }

  async folderPaths(): Promise<Record<string, string[]> | undefined> {
    try {
      const value = await this.getJson("/internal/folder_paths");
      return isRecord(value) ? (value as Record<string, string[]>) : undefined;
    } catch {
      return undefined;
    }
  }

  async queueDepth(): Promise<{ running: number; pending: number }> {
    const value = await this.getJson("/queue");
    const record = isRecord(value) ? value : {};
    return {
      running: Array.isArray(record.queue_running) ? record.queue_running.length : 0,
      pending: Array.isArray(record.queue_pending) ? record.queue_pending.length : 0,
    };
  }

  /** Uploads a local image or video into ComfyUI's input folder and returns the name LoadImage/LoadVideo expect. */
  async uploadFile(path: string, options: { subfolder?: string; overwrite?: boolean } = {}): Promise<string> {
    const bytes = await readFile(path);
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(bytes)], { type: mimeFor(path) }), basename(path));
    if (options.subfolder !== undefined) {
      form.append("subfolder", options.subfolder);
    }
    form.append("overwrite", options.overwrite === false ? "false" : "true");

    const response = await this.request("/upload/image", { method: "POST", body: form }, Math.max(this.requestTimeoutMs, 60_000));
    if (!response.ok) {
      throw new ComfyError("http", `ComfyUI refused the upload of ${basename(path)} (${response.status})${summarize(await safeText(response))}`);
    }

    const info = (await response.json()) as { name?: string; subfolder?: string };
    if (typeof info.name !== "string" || info.name === "") {
      throw new ComfyError("http", `ComfyUI upload of ${basename(path)} returned no file name`);
    }

    return info.subfolder ? `${info.subfolder}/${info.name}` : info.name;
  }

  async queuePrompt(graph: ComfyGraph, clientId = "show-sidekick"): Promise<string> {
    const response = await this.request(
      "/prompt",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: graph, client_id: clientId }),
      },
      Math.max(this.requestTimeoutMs, 30_000),
    );
    const text = await safeText(response);

    if (!response.ok) {
      throw new ComfyError("rejected", `ComfyUI rejected the workflow (${response.status})${describeRefusal(text)}`, parseJson(text));
    }

    const payload = parseJson(text);
    const promptId = isRecord(payload) ? payload.prompt_id : undefined;
    if (typeof promptId !== "string" || promptId === "") {
      throw new ComfyError("rejected", `ComfyUI accepted the workflow but returned no prompt_id${summarize(text)}`, payload);
    }

    const nodeErrors = isRecord(payload) && isRecord(payload.node_errors) ? payload.node_errors : {};
    if (Object.keys(nodeErrors).length > 0) {
      throw new ComfyError("rejected", `ComfyUI rejected the workflow${describeRefusal(text)}`, payload);
    }

    return promptId;
  }

  async waitForPrompt(promptId: string, options: { timeoutMs: number }): Promise<ComfyHistoryEntry> {
    const started = this.now();

    while (this.now() - started < options.timeoutMs) {
      const history = await this.getJson(`/history/${encodeURIComponent(promptId)}`, {
        timeoutMs: Math.max(this.requestTimeoutMs, 10_000),
      });
      const entry = isRecord(history) ? (history[promptId] as ComfyHistoryEntry | undefined) : undefined;
      const status = entry?.status;

      if (status?.status_str === "error") {
        throw new ComfyError("execution", `ComfyUI failed while running the workflow: ${executionErrorMessage(status.messages)}`, entry);
      }

      if (entry !== undefined && (status?.completed === true || status?.status_str === "success")) {
        return entry;
      }

      await this.sleep(this.pollIntervalMs);
    }

    throw new ComfyError(
      "timeout",
      `ComfyUI job ${promptId} did not finish within ${Math.round(options.timeoutMs / 1000)}s; it may still be running — check the ComfyUI queue before re-queueing`,
    );
  }

  async download(file: ComfyFileRef): Promise<Buffer> {
    const params = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder, type: file.type });
    const response = await this.request(`/view?${params.toString()}`, { method: "GET" }, Math.max(this.requestTimeoutMs, 120_000));
    if (!response.ok) {
      throw new ComfyError("http", `ComfyUI finished but would not hand over ${file.filename} (${response.status})`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private async fetchModelFolder(folder: string): Promise<string[] | undefined> {
    const response = await this.request(`/models/${encodeURIComponent(folder)}`, { method: "GET" }, this.requestTimeoutMs);
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new ComfyError("http", `ComfyUI GET /models/${folder} failed (${response.status})`);
    }

    const value = (await response.json()) as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private async getJson(path: string, options: { timeoutMs?: number } = {}): Promise<unknown> {
    const response = await this.request(path, { method: "GET" }, options.timeoutMs ?? this.requestTimeoutMs);
    if (!response.ok) {
      throw new ComfyError("http", `ComfyUI GET ${path} failed (${response.status})${summarize(await safeText(response))}`);
    }

    return (await response.json()) as unknown;
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const message = error instanceof Error ? describeFetchError(error) : String(error);
      throw new ComfyError("unreachable", `ComfyUI is not reachable at ${this.baseUrl} (${message})`);
    }
  }
}

export function collectOutputFiles(entry: ComfyHistoryEntry, nodeId?: string): ComfyFileRef[] {
  const outputs = entry.outputs ?? {};
  const nodes = nodeId === undefined ? Object.values(outputs) : [outputs[nodeId]].filter(isRecord);
  const files: ComfyFileRef[] = [];

  for (const output of nodes) {
    for (const value of Object.values(output)) {
      if (!Array.isArray(value)) {
        continue;
      }

      for (const item of value) {
        if (isRecord(item) && typeof item.filename === "string") {
          files.push({
            filename: item.filename,
            subfolder: typeof item.subfolder === "string" ? item.subfolder : "",
            type: typeof item.type === "string" ? item.type : "output",
          });
        }
      }
    }
  }

  return files;
}

/** ComfyUI's validation answer names the node and input it rejected; surface that instead of "failed validation". */
export function describeRefusal(text: string): string {
  const parsed = parseJson(text);
  if (!isRecord(parsed)) {
    return summarize(text);
  }

  const nodeErrors = isRecord(parsed.node_errors) ? parsed.node_errors : {};
  const details = Object.entries(nodeErrors).flatMap(([node, info]) => {
    const record = isRecord(info) ? info : {};
    const classType = typeof record.class_type === "string" ? ` (${record.class_type})` : "";
    const errors = Array.isArray(record.errors) ? record.errors : [];
    return errors.map((error) => {
      const item = isRecord(error) ? error : {};
      return `${node}${classType}: ${String(item.message ?? "")} ${String(item.details ?? "")}`.trim();
    });
  });

  if (details.length > 0) {
    return `: ${details.join("; ").slice(0, 600)}`;
  }

  const error = isRecord(parsed.error) ? parsed.error : undefined;
  if (error !== undefined && typeof error.message === "string") {
    const detail = typeof error.details === "string" && error.details !== "" ? ` — ${error.details}` : "";
    return `: ${`${error.message}${detail}`.slice(0, 400)}`;
  }

  return summarize(text);
}

function executionErrorMessage(messages: unknown[] | undefined): string {
  for (const message of messages ?? []) {
    if (Array.isArray(message) && message[0] === "execution_error" && isRecord(message[1])) {
      const detail = message[1];
      const node = typeof detail.node_type === "string" ? `${detail.node_type}: ` : "";
      const text = typeof detail.exception_message === "string" ? detail.exception_message.trim() : "unknown error";
      return `${node}${text}`.slice(0, 600);
    }
  }

  return "see the ComfyUI log for details";
}

function describeFetchError(error: Error): string {
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return "request timed out";
  }

  const cause = (error as Error & { cause?: unknown }).cause;
  if (isRecord(cause) && typeof cause.code === "string") {
    return cause.code;
  }

  return error.message;
}

function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    default:
      return "image/png";
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function summarize(text: string): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  return trimmed === "" ? "" : `: ${trimmed.slice(0, 200)}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
