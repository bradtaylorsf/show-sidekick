import type { PreComposeFinding } from "./pre-compose-validation.js";
import type { RenderReport } from "../artifacts/render-report.js";

export type ComposeBlockerType =
  | "pre_compose_failed"
  | "runtime_unavailable"
  | "runtime_swap_unlogged"
  | "hyperframes_validation_failed";

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
  readonly render_report?: RenderReport;

  constructor(blocker: ComposeBlocker, options: { render_report?: RenderReport } = {}) {
    super(`${blocker.type}: ${blocker.failed}`);
    this.name = "ComposeBlockerError";
    this.blocker = blocker;
    this.render_report = options.render_report;
  }
}

export function emitComposeBlocker(blocker: ComposeBlocker, options: { render_report?: RenderReport } = {}): never {
  throw new ComposeBlockerError(blocker, options);
}
