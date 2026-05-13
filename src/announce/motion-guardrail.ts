import type { DecisionLog } from "../artifacts/decision-log.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import { currentDecisions } from "../decisions/store.js";
import { escalateBlocker } from "./escalate.js";
import type { AnnounceIO, InteractionMode } from "./io.js";

export type MotionGuardrailInput = {
  deliveryPromise?: { motion_led?: boolean } | string;
  availableRuntimes?: readonly RenderRuntime[];
  attemptedRuntime: RenderRuntime;
  lockedRuntime?: RenderRuntime;
  decisionLog?: DecisionLog;
  mode?: InteractionMode;
  io?: AnnounceIO;
};

export async function enforceMotionGuardrail(input: MotionGuardrailInput): Promise<void> {
  if (!isMotionLed(input.deliveryPromise)) {
    return;
  }

  if (hasDowngradeApproval(input.decisionLog)) {
    return;
  }

  const lockedUnavailable =
    input.lockedRuntime !== undefined &&
    input.availableRuntimes !== undefined &&
    !input.availableRuntimes.includes(input.lockedRuntime);
  const fallbackAttempted = input.lockedRuntime !== undefined && input.attemptedRuntime !== input.lockedRuntime;
  const stillLedAttempted = input.attemptedRuntime === "ffmpeg";

  if (!stillLedAttempted && !(lockedUnavailable && fallbackAttempted)) {
    return;
  }

  await escalateBlocker(
    {
      attempted: {
        attempted_runtime: input.attemptedRuntime,
        locked_runtime: input.lockedRuntime,
        available_runtimes: input.availableRuntimes,
      },
      failed:
        input.lockedRuntime === undefined
          ? "Motion-led delivery cannot silently route to a still-led runtime."
          : `${input.lockedRuntime} is locked for this motion-led promise, but a fallback runtime was attempted before approval.`,
      type: "provider_access",
      options: [
        {
          label: input.lockedRuntime === undefined ? "restore a motion-capable runtime" : `wait and retry ${input.lockedRuntime}`,
          cost_note: "no downgrade spend until the approved path is available",
          quality_note: "preserves the motion-led delivery promise",
        },
        {
          label: "approve still-led downgrade",
          cost_note: "may reduce runtime or generation cost",
          quality_note: "changes the approved motion-led promise into an animatic or still-led treatment",
        },
      ],
      recommendation:
        input.lockedRuntime === undefined
          ? "Use a motion-capable runtime or ask the user to approve a still-led downgrade before executing."
          : `Do not execute ${input.attemptedRuntime}; wait and retry ${input.lockedRuntime}, or ask the user to approve a still-led downgrade.`,
    },
    { mode: input.mode, io: input.io },
  );
}

function isMotionLed(deliveryPromise: MotionGuardrailInput["deliveryPromise"]): boolean {
  if (typeof deliveryPromise === "string") {
    return deliveryPromise === "motion_led" || deliveryPromise === "cinematic_hybrid";
  }

  return deliveryPromise?.motion_led === true;
}

function hasDowngradeApproval(decisionLog: DecisionLog | undefined): boolean {
  return currentDecisions(decisionLog ?? []).some((decision) => decision.category === "downgrade_approval");
}
