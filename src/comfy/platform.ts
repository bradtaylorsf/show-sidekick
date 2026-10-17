import { execFile } from "node:child_process";
import { arch, platform, totalmem } from "node:os";
import { ENGINES, type EngineDefinition, type EngineId } from "./models.js";

export type Accelerator = "mps" | "cuda" | "cpu";

export type Hardware = {
  os: NodeJS.Platform;
  arch: string;
  accelerator: Accelerator;
  /** Apple Silicon: total unified memory. */
  unifiedMemoryGb?: number;
  /** NVIDIA: per-GPU VRAM from nvidia-smi. */
  gpus: Array<{ name: string; vramGb: number }>;
  systemMemoryGb: number;
};

export type HardwareProbe = {
  platform: () => NodeJS.Platform;
  arch: () => string;
  totalMemoryBytes: () => number;
  nvidiaSmi: () => Promise<string | undefined>;
};

export const defaultHardwareProbe: HardwareProbe = {
  platform: () => platform(),
  arch: () => arch(),
  totalMemoryBytes: () => totalmem(),
  nvidiaSmi: () =>
    new Promise((resolve) => {
      execFile(
        "nvidia-smi",
        ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
        { timeout: 5_000 },
        (error, stdout) => resolve(error ? undefined : stdout),
      );
    }),
};

export async function detectHardware(probe: HardwareProbe = defaultHardwareProbe): Promise<Hardware> {
  const os = probe.platform();
  const cpu = probe.arch();
  const systemMemoryGb = round(probe.totalMemoryBytes() / 1024 ** 3);

  if (os === "darwin" && cpu === "arm64") {
    return { os, arch: cpu, accelerator: "mps", unifiedMemoryGb: systemMemoryGb, gpus: [], systemMemoryGb };
  }

  const smi = os === "darwin" ? undefined : await probe.nvidiaSmi();
  const gpus = parseNvidiaSmi(smi);
  return { os, arch: cpu, accelerator: gpus.length > 0 ? "cuda" : "cpu", gpus, systemMemoryGb };
}

export function parseNvidiaSmi(output: string | undefined): Array<{ name: string; vramGb: number }> {
  if (output === undefined) {
    return [];
  }

  return output
    .split(/\r?\n/u)
    .map((line) => line.split(",").map((part) => part.trim()))
    .filter((parts) => parts.length >= 2 && parts[0] !== "" && Number.isFinite(Number(parts[1])))
    .map(([name, mib]) => ({ name: name as string, vramGb: round(Number(mib) / 1024) }));
}

export type Tier = "minimal" | "light" | "standard" | "full";

export type TierRecommendation = {
  tier: Tier;
  /** Memory the engines may use: ~75% of unified memory on a Mac, the largest GPU's VRAM on CUDA. */
  budgetGb: number;
  /** Engines that fit and carry a permissive licence — the default download set. */
  recommended: EngineId[];
  /** Engines that fit but need a licence decision (research-only, gated/revenue-capped). */
  optIn: EngineId[];
  /** Engines that need more memory than this machine has. */
  tooLarge: EngineId[];
  installFlag: "--m-series" | "--nvidia" | "--cpu";
  notes: string[];
};

export function recommendTier(hardware: Hardware): TierRecommendation {
  const budgetGb =
    hardware.accelerator === "mps"
      ? round((hardware.unifiedMemoryGb ?? hardware.systemMemoryGb) * 0.75)
      : hardware.accelerator === "cuda"
        ? Math.max(...hardware.gpus.map((gpu) => gpu.vramGb))
        : round(hardware.systemMemoryGb * 0.5);
  // ComfyUI offloads weights to system RAM on CUDA, so a card can run models a little
  // larger than its VRAM; give CUDA a 1.5x allowance capped by system memory.
  const effectiveGb =
    hardware.accelerator === "cuda" ? Math.min(budgetGb * 1.5, Math.max(budgetGb, hardware.systemMemoryGb * 0.75)) : budgetGb;
  const tier: Tier = effectiveGb >= 80 ? "full" : effectiveGb >= 40 ? "standard" : effectiveGb >= 20 ? "light" : "minimal";
  const fits = (engine: EngineDefinition) => engine.memoryGb <= effectiveGb;
  const engines = Object.values(ENGINES);
  const recommended = engines.filter((engine) => fits(engine) && engine.licence === "apache-2.0").map((engine) => engine.id);
  const optIn = engines.filter((engine) => fits(engine) && engine.licence !== "apache-2.0").map((engine) => engine.id);
  const tooLarge = engines.filter((engine) => !fits(engine)).map((engine) => engine.id);

  if (!recommended.includes("z-image-turbo")) {
    // Even a small machine should get one working still engine; it will swap, but it runs.
    recommended.unshift("z-image-turbo");
  }

  const notes: string[] = [];
  if (hardware.accelerator === "mps") {
    notes.push("Apple Silicon: bf16/fp16 and GGUF weights only — fp8 has no Float8 kernels on MPS, and int8_convrot builds are unverified there.");
  }
  if (hardware.accelerator === "cpu") {
    notes.push("No GPU detected: ComfyUI will run on CPU and every engine will be very slow.");
  }
  if (tier === "minimal") {
    notes.push("Under ~20 GB for models: expect swapping; stills only is the realistic local route.");
  }

  return {
    tier,
    budgetGb: round(effectiveGb),
    recommended,
    optIn,
    tooLarge,
    installFlag: hardware.accelerator === "mps" ? "--m-series" : hardware.accelerator === "cuda" ? "--nvidia" : "--cpu",
    notes,
  };
}

export function describeHardware(hardware: Hardware): string {
  if (hardware.accelerator === "mps") {
    return `Apple Silicon (${hardware.arch}), ${hardware.unifiedMemoryGb ?? hardware.systemMemoryGb} GB unified memory`;
  }
  if (hardware.accelerator === "cuda") {
    return `${hardware.os}/${hardware.arch}, NVIDIA ${hardware.gpus.map((gpu) => `${gpu.name} ${gpu.vramGb} GB`).join(" + ")}, ${hardware.systemMemoryGb} GB RAM`;
  }
  return `${hardware.os}/${hardware.arch}, no supported GPU, ${hardware.systemMemoryGb} GB RAM`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
