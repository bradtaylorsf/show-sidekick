import { AwaitingHuman } from "./errors.js";
import { askForApproval, emitNdjson, isNonInteractive, type AnnounceIO, type InteractionMode, writeHuman } from "./io.js";

export const BLOCKER_TYPES = ["auth", "provider_access", "tool_bug", "prompt_quality"] as const;
export type BlockerType = (typeof BLOCKER_TYPES)[number];

export type BlockerOption = {
  label: string;
  cost_note: string;
  quality_note: string;
};

export type EscalateBlockerInput = {
  attempted: unknown;
  failed: string;
  type: BlockerType;
  options: BlockerOption[];
  recommendation: string;
};

export type EscalateBlockerOptions = {
  mode?: InteractionMode;
  io?: AnnounceIO;
};

export async function escalateBlocker(input: EscalateBlockerInput, opts: EscalateBlockerOptions = {}): Promise<never> {
  if (isNonInteractive(opts.mode)) {
    emitNdjson(opts.io, "awaiting_human", input);
    throw new AwaitingHuman("Awaiting human approval for blocked production path", { event: "awaiting_human", ...input });
  }

  writeHuman(opts.io, formatBlocker(input));
  await askForApproval(opts.io, "Choose a path with the user before continuing. Press Enter when the blocker has been escalated. ");
  throw new AwaitingHuman("Awaiting human approval for blocked production path", input);
}

function formatBlocker(input: EscalateBlockerInput): string {
  return [
    "BLOCKER: approved path cannot continue",
    `What was attempted: ${formatValue(input.attempted)}`,
    `What failed: ${input.failed}`,
    `Issue type: ${input.type}`,
    "What options exist next:",
    ...input.options.map((option, index) => {
      return `${index + 1}. ${option.label} (cost: ${option.cost_note}; quality: ${option.quality_note})`;
    }),
    `Recommendation: ${input.recommendation}`,
  ].join("\n");
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}
