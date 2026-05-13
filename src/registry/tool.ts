import type { z } from "zod";

export type CostUnit = "clip" | "second" | "minute" | "token" | "image" | "call";

export type KnownCapability =
  | "image_to_video"
  | "tts"
  | "music_generation"
  | "image_generation"
  | "image_hosting"
  | "video_compose"
  | "research"
  | "web_search"
  | "transcribe"
  | "beats"
  | "asr"
  | "vision"
  | "whisper"
  | "aubio"
  | "audio_energy"
  | "transcriber"
  | "stock_image"
  | "stock_video"
  | "stock_cross_search";

export type Capability = KnownCapability | (string & {});

export type CliAuth =
  | { mode: "cli-login"; check: string; timeoutMs?: number }
  | { mode: "env"; env: string[] }
  | { mode: "none" };

export type Integration =
  | { kind: "cli"; binary: string; auth: CliAuth; install: string }
  | { kind: "api"; env: string[]; install: string }
  | { kind: "binary"; binary: string; install: string }
  | { kind: "library"; package: string; install: string };

export type Availability =
  | { available: true }
  | { available: false; reason: string; fix?: "cli-login" | "env" | "install" | "manual" };

export type ToolStatus = "production" | "beta" | "experimental";

export interface ToolLogger {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
  debug(msg: string, meta?: unknown): void;
  event(name: string, payload?: unknown): void;
}

export type ToolCommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string },
) => Promise<{ stdout: string; stderr: string }>;

export interface ToolSelector {
  select(capability: Capability, prefs?: { prefer?: string[]; runtime?: Integration["kind"] }): Promise<Tool>;
  listByCapability?(capability: Capability): Promise<Tool[]>;
}

export interface ToolContext {
  projectRoot: string;
  logger: ToolLogger;
  registry?: ToolSelector;
  runCli?: ToolCommandRunner;
}

export interface Tool<I = unknown, O = unknown> {
  name: string;
  capability: Capability;
  provider: string;
  status: ToolStatus;
  integration: Integration;
  best_for: string;
  supports?: string[];
  cost?: { unit: CostUnit; usd: number };
  agent_skills?: string[];
  input: z.ZodSchema<I>;
  output: z.ZodSchema<O>;
  isAvailable(): Promise<Availability>;
  execute(params: I, ctx: ToolContext): Promise<O>;
}
