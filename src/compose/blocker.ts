import type { PreComposeFinding } from "./pre-compose-validation.js";

export type ComposeBlockerType = "pre_compose_failed" | "runtime_unavailable" | "runtime_swap_unlogged";

export interface ComposeBlocker {
  type: ComposeBlockerType;
  attempted: string;
  failed: string;
  options: string[];
  recommendation: string;
  findings?: PreComposeFinding[];
}

export class ComposeBlockerError extends Error {
  readonly blocker: ComposeBlocker;

  constructor(blocker: ComposeBlocker) {
    super(`${blocker.type}: ${blocker.failed}`);
    this.name = "ComposeBlockerError";
    this.blocker = blocker;
  }
}

export function emitComposeBlocker(blocker: ComposeBlocker): never {
  throw new ComposeBlockerError(blocker);
}
