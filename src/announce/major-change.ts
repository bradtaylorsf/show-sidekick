import {
  DecisionEntrySchema,
  type DecisionCategory,
  type DecisionEntry,
  type DecisionLog,
} from "../artifacts/decision-log.js";
import { currentDecisions, recordDecision as recordDecisionToStore, type ShowEpisodeTarget } from "../decisions/store.js";
import { MajorChangeBlocked } from "./errors.js";
import { escalateBlocker } from "./escalate.js";
import { askForApproval, isNonInteractive, type AnnounceIO, type InteractionMode, writeHuman } from "./io.js";

export const MAJOR_CHANGE_TYPES = [
  "provider_swap",
  "model_swap",
  "runtime_swap",
  "narration_dropped",
  "music_dropped",
  "sample_to_batch",
  "none",
] as const;

export type MajorChangeType = (typeof MAJOR_CHANGE_TYPES)[number];

export type MajorChangeState = {
  provider?: string;
  model?: string;
  runtime?: string;
  narrationPresent?: boolean;
  musicPresent?: boolean;
  sampleOrBatch?: "sample" | "batch";
};

export type DetectMajorChangeInput = {
  previous: MajorChangeState;
  next: MajorChangeState;
  decisionLog?: DecisionLog;
};

export type RequireApprovalOptions = DetectMajorChangeInput & {
  mode?: InteractionMode;
  io?: AnnounceIO;
  recordDecision?: (entry: DecisionEntry) => DecisionLog | Promise<DecisionLog>;
  showEpisode?: ShowEpisodeTarget;
  projectRoot?: string;
  stage?: string;
  timestamp?: string;
  reason?: string;
  id?: string;
};

export function detectMajorChange(input: DetectMajorChangeInput): MajorChangeType {
  if (changed(input.previous.provider, input.next.provider)) {
    return "provider_swap";
  }

  if (changed(input.previous.model, input.next.model)) {
    return "model_swap";
  }

  if (changed(input.previous.runtime, input.next.runtime)) {
    return "runtime_swap";
  }

  if (input.previous.narrationPresent === true && input.next.narrationPresent === false) {
    return "narration_dropped";
  }

  if (input.previous.musicPresent === true && input.next.musicPresent === false) {
    return "music_dropped";
  }

  if (input.previous.sampleOrBatch === "sample" && input.next.sampleOrBatch === "batch") {
    return "sample_to_batch";
  }

  return "none";
}

export async function requireApproval(change: MajorChangeType, opts: RequireApprovalOptions): Promise<DecisionEntry | undefined> {
  if (change === "none") {
    return undefined;
  }

  if (isNonInteractive(opts.mode)) {
    await escalateBlocker(
      {
        attempted: { change, previous: opts.previous, next: opts.next },
        failed: "A major production change requires explicit user approval and a superseding decision log entry.",
        type: "provider_access",
        options: [
          {
            label: "keep approved path",
            cost_note: "no new spend until the approved path is restored",
            quality_note: "preserves the user's approved production promise",
          },
          {
            label: "approve substituted path",
            cost_note: "may change cost or runtime",
            quality_note: "requires a user-visible supersession decision before execution",
          },
        ],
        recommendation: "Pause execution, ask the user to approve or reject the substitution, then record the superseding decision.",
      },
      { mode: opts.mode, io: opts.io },
    );
  }

  writeHuman(opts.io, formatMajorChange(change, opts.previous, opts.next));
  if (!(await askForApproval(opts.io, "Approve this major change? [y/N] "))) {
    throw new MajorChangeBlocked(change, `User did not approve major change "${change}"`);
  }

  const entry = buildSupersessionDecision(change, opts);
  await writeDecision(entry, opts);
  return entry;
}

function buildSupersessionDecision(change: MajorChangeType, opts: RequireApprovalOptions): DecisionEntry {
  const category = categoryForChange(change);
  const previousDecision = latestActiveDecision(opts.decisionLog, category);
  const previousLabel = labelForChange(change, opts.previous) ?? previousDecision?.picked ?? "previous approved path";
  const nextLabel = labelForChange(change, opts.next) ?? "new approved path";

  return DecisionEntrySchema.parse({
    id: opts.id ?? `${category}-${opts.stage ?? stageForChange(change)}-${Date.now()}`,
    stage: opts.stage ?? stageForChange(change),
    timestamp: opts.timestamp ?? new Date().toISOString(),
    category,
    options_considered: [
      {
        label: previousLabel,
        rejected_because: `superseded by user-approved ${change.replace(/_/gu, " ")}`,
        notes: "Previously approved path before the major change.",
      },
      {
        label: nextLabel,
        rejected_because: null,
        notes: "User explicitly approved this substituted path.",
      },
    ],
    picked: nextLabel,
    reason: opts.reason ?? `User approved ${change.replace(/_/gu, " ")} before execution continued.`,
    confidence: 1,
    user_visible: true,
    supersedes: previousDecision?.id ?? null,
  });
}

async function writeDecision(entry: DecisionEntry, opts: RequireApprovalOptions): Promise<void> {
  if (opts.recordDecision !== undefined) {
    await opts.recordDecision(entry);
    return;
  }

  if (opts.showEpisode !== undefined) {
    await recordDecisionToStore(opts.showEpisode, entry, { root: opts.projectRoot });
    return;
  }

  throw new MajorChangeBlocked(entry.category, "Major change was approved, but no decision recorder was available");
}

function categoryForChange(change: MajorChangeType): DecisionCategory {
  switch (change) {
    case "provider_swap":
      return "provider_selection";
    case "model_swap":
      return "model_selection";
    case "runtime_swap":
      return "render_runtime_selection";
    case "music_dropped":
      return "music_source";
    case "narration_dropped":
    case "sample_to_batch":
      return "downgrade_approval";
    case "none":
      throw new MajorChangeBlocked(change);
  }
}

function stageForChange(change: MajorChangeType): string {
  switch (change) {
    case "provider_swap":
    case "model_swap":
      return "assets";
    case "runtime_swap":
      return "compose";
    case "music_dropped":
    case "narration_dropped":
    case "sample_to_batch":
      return "edit";
    case "none":
      return "proposal";
  }
}

function labelForChange(change: MajorChangeType, state: MajorChangeState): string | undefined {
  switch (change) {
    case "provider_swap":
      return state.provider;
    case "model_swap":
      return state.model;
    case "runtime_swap":
      return state.runtime;
    case "narration_dropped":
      return state.narrationPresent === false ? "drop_narration" : "keep_narration";
    case "music_dropped":
      return state.musicPresent === false ? "drop_music" : "keep_music";
    case "sample_to_batch":
      return state.sampleOrBatch;
    case "none":
      return undefined;
  }
}

function latestActiveDecision(log: DecisionLog | undefined, category: DecisionCategory): DecisionEntry | undefined {
  return currentDecisions(log ?? [])
    .filter((decision) => decision.category === category)
    .at(-1);
}

function changed(previous: string | undefined, next: string | undefined): boolean {
  return previous !== undefined && next !== undefined && previous !== next;
}

function formatMajorChange(change: MajorChangeType, previous: MajorChangeState, next: MajorChangeState): string {
  return [
    `Major change requires approval: ${change}`,
    `Previous: ${JSON.stringify(previous)}`,
    `Next: ${JSON.stringify(next)}`,
    "Execution will not continue until this is approved and logged as a superseding decision.",
  ].join("\n");
}
