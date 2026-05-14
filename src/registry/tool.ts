import type { z } from "zod";
import type { CostLog } from "../artifacts/cost-log.js";
import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import type { RenderRuntime } from "../artifacts/enums.js";

export type CostUnit = "clip" | "second" | "minute" | "token" | "image" | "call";

export type KnownCapability =
  | "image_to_video"
  | "text_to_video"
  | "tts"
  | "music_generation"
  | "music_search"
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
  | "stock_cross_search"
  | "clip_cache"
  | "clip_search"
  | "clip_embedder"
  | "video_reframe"
  | "auto_reframe"
  | "face_tracker"
  | "audio_processing"
  | "subtitle_generation";

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
  select(
    capability: Capability,
    prefs?: { prefer?: string[]; runtime?: Integration["kind"]; context?: ToolAvailabilityContext },
  ): Promise<Tool>;
  listByCapability?(capability: Capability): Promise<Tool[]>;
}

export type ToolInteractionMode = "interactive" | "non_interactive" | { json: boolean };

export type ToolInteractionIO = {
  write?: (message: string) => void;
  event?: (event: string, payload: unknown) => void;
  prompt?: (message: string) => boolean | string | Promise<boolean | string>;
};

export type ToolExecutionState = {
  provider?: string;
  model?: string;
  runtime?: string;
  narrationPresent?: boolean;
  musicPresent?: boolean;
  sampleOrBatch?: "sample" | "batch";
};

export interface ToolExecutionPolicy {
  reason?: string;
  sampleOrBatch?: "sample" | "batch";
  model?: string;
  units?: number;
  budgetUsd?: number;
  budgetRemainingUsd?: number | "unknown";
  costLog?: CostLog;
  showEpisode?: string | { show: string; episode: string };
  mode?: ToolInteractionMode;
  io?: ToolInteractionIO;
  majorChange?: {
    previous: ToolExecutionState;
    next: ToolExecutionState;
    decisionLog?: DecisionLog;
    recordDecision?: (entry: DecisionEntry) => DecisionLog | Promise<DecisionLog>;
    stage?: string;
    timestamp?: string;
    reason?: string;
    id?: string;
  };
  motionGuardrail?: {
    deliveryPromise?: { motion_led?: boolean } | string;
    availableRuntimes?: readonly RenderRuntime[];
    attemptedRuntime: RenderRuntime;
    lockedRuntime?: RenderRuntime;
    decisionLog?: DecisionLog;
  };
}

export interface ToolContext {
  projectRoot: string;
  logger: ToolLogger;
  registry?: ToolSelector;
  runCli?: ToolCommandRunner;
  execution?: ToolExecutionPolicy;
}

export type ToolAvailabilityContext = Pick<ToolContext, "projectRoot">;

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
  isAvailable(ctx?: ToolAvailabilityContext): Promise<Availability>;
  execute(params: I, ctx: ToolContext): Promise<O>;
}
