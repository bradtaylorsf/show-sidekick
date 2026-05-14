import {
  DecisionEntrySchema,
  type DecisionEntry,
  type DecisionLog,
} from "../artifacts/decision-log.js";
import { AwaitingHuman, AbortedByUser } from "./errors.js";
import { askForApproval, emitNdjson, isNonInteractive, type AnnounceIO, type InteractionMode, writeHuman } from "./io.js";

export type CapabilityExtensionAnnouncementKind = "script" | "tool" | "playbook" | "skill" | (string & {});

export type CapabilityExtensionWhy = {
  x: string;
  y: string;
};

export type AnnounceCapabilityExtensionInput = {
  kind: CapabilityExtensionAnnouncementKind;
  name: string;
  why: CapabilityExtensionWhy;
  io?: AnnounceIO;
  mode?: InteractionMode;
  showEpisode?: string | { show: string; episode: string };
  stage?: string;
  timestamp?: string;
  id?: string;
  path?: string;
  confidence?: number;
  requiresApproval?: boolean;
  recordDecision: (entry: DecisionEntry) => DecisionLog | Promise<DecisionLog>;
};

export async function announceCapabilityExtension(input: AnnounceCapabilityExtensionInput): Promise<DecisionEntry> {
  const phrase = capabilityExtensionPhrase(input.kind, input.why);

  if (input.requiresApproval === true && isNonInteractive(input.mode)) {
    const payload = {
      type: "capability_extension",
      kind: input.kind,
      name: input.name,
      phrase,
      recommendation: "Approve the custom capability before the first paid API call, or replace it with a bundled wrapper.",
    };
    emitNdjson(input.io, "awaiting_human", payload);
    throw new AwaitingHuman("Capability extension requires approval before first paid API call", payload);
  }

  writeHuman(input.io, phrase);
  if (input.requiresApproval === true && !(await askForApproval(input.io, "Approve this custom capability? [y/N] "))) {
    throw new AbortedByUser(`User did not approve custom ${input.kind} "${input.name}"`);
  }

  const entry = buildCapabilityExtensionDecision(input);
  await input.recordDecision(entry);
  return entry;
}

export function buildCapabilityExtensionDecision(input: {
  kind: CapabilityExtensionAnnouncementKind;
  name: string;
  why: CapabilityExtensionWhy;
  stage?: string;
  timestamp?: string;
  id?: string;
  path?: string;
  confidence?: number;
}): DecisionEntry {
  const picked = `${input.kind}:${input.name}`;
  const phrase = capabilityExtensionPhrase(input.kind, input.why);
  const idSuffix = safeDecisionSegment(`${input.kind}-${input.name}`);

  return DecisionEntrySchema.parse({
    id: input.id ?? `capability-extension-${idSuffix}-${Date.now()}`,
    stage: input.stage ?? "capability_extension",
    timestamp: input.timestamp ?? new Date().toISOString(),
    category: "capability_extension",
    options_considered: [
      {
        label: picked,
        rejected_because: null,
        notes: input.path === undefined ? "Project-scoped extension." : `Project-scoped extension at ${input.path}.`,
      },
      {
        label: "bundled capability surface",
        rejected_because: `no existing tool handles ${input.why.y}`,
        notes: "Default registry, playbook, script, and skill set before MET-11 extension.",
      },
    ],
    picked,
    reason: phrase,
    confidence: input.confidence ?? 0.8,
    user_visible: true,
    supersedes: null,
  });
}

export function capabilityExtensionPhrase(kind: CapabilityExtensionAnnouncementKind, why: CapabilityExtensionWhy): string {
  return `I wrote a custom ${kind} for ${why.x} because no existing tool handles ${why.y}.`;
}

function safeDecisionSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}
