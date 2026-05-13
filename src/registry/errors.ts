import type { Capability } from "./tool.js";

export type RegistryErrorCode = "duplicate-tool" | "invalid-tool" | "discover-failed";

export class RegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly sourcePath?: string;

  constructor(code: RegistryErrorCode, message: string, sourcePath?: string) {
    super(message);
    this.name = "RegistryError";
    this.code = code;
    this.sourcePath = sourcePath;
  }
}

export class NoToolAvailable extends Error {
  readonly capability: Capability;
  readonly reasons: Array<{ name: string; reason: string }>;

  constructor(capability: Capability, reasons: Array<{ name: string; reason: string }>) {
    const detail = reasons.length === 0 ? "no candidates discovered" : reasons.map((r) => `${r.name}: ${r.reason}`).join("; ");
    super(`No available tool for capability "${capability}": ${detail}`);
    this.name = "NoToolAvailable";
    this.capability = capability;
    this.reasons = reasons;
  }
}
