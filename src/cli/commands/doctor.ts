import type { Command } from "commander";
import { BRANDING } from "../../branding.js";
import { describeEngineBlockers, inspectComfy } from "../../comfy/availability.js";
import { ComfyClient } from "../../comfy/client.js";
import { ENGINES, LICENCES, NODE_PACKS, type ComfyToolKind, type NodePackId } from "../../comfy/models.js";
import {
  getProviderProfile,
  LOCAL_COMFY_PROFILE_SLUG,
  LOCAL_COMFY_ROUTE,
  PAID_DEMO_PROFILE,
  providerProfileNames,
  type ProviderProfile,
} from "../../providers/profiles.js";
import { findProjectRoot } from "../../paths/project.js";
import { probe, Registry, type Availability, type Integration } from "../../registry/index.js";
import {
  findWhisperCli,
  resolveWhisperModel,
  transcriptionProviderPin,
  whisperCliCandidates,
  WHISPER_MODEL_HELP,
  type TranscriptionProviderPin,
} from "../../tool-support/whisper.js";
import type { CliIo, GlobalOptions } from "./stub.js";

export type DoctorDeps = {
  createRegistry: () => Promise<Registry>;
  probeIntegration: (integration: Integration) => Promise<Availability>;
  /** Local ComfyUI checks. When absent, doctor reports only the provider profile. */
  localComfy?: () => Promise<DoctorRow[]>;
  /** Cuesheet transcription checks (whisper-cli, whisper model, provider pin). */
  localAudio?: () => Promise<DoctorRow[]>;
};

type DoctorOptions = GlobalOptions & {
  profile?: string;
};

type DoctorStatus = "ok" | "missing";

export type DoctorRow = {
  event: "doctor";
  profile: string;
  check: string;
  description: string;
  status: DoctorStatus;
  reason?: string;
  setup?: string;
  tools: string[];
};

const defaultDeps: DoctorDeps = {
  createRegistry: createDefaultRegistry,
  probeIntegration: (integration) => probe(integration),
  localComfy: () => checkLocalComfy(new ComfyClient(), (integration) => probe(integration)),
  localAudio: () => checkLocalAudio(process.env, projectRootOrCwd()),
};

export const LOCAL_AUDIO_SLUG = "local-audio";

function projectRootOrCwd(): string {
  try {
    return findProjectRoot();
  } catch {
    return process.cwd();
  }
}

export function createDoctorHandler(io: CliIo, deps: DoctorDeps = defaultDeps) {
  return async (...actionArgs: unknown[]): Promise<void> => {
    const options = doctorOptions(actionArgs);
    const localOnly = options.profile === LOCAL_COMFY_PROFILE_SLUG;
    const includeLocal = deps.localComfy !== undefined && (options.profile === undefined || localOnly);
    if (localOnly && deps.localComfy === undefined) {
      throw new Error("local-comfy checks are not available in this doctor run");
    }

    const localRows = includeLocal && deps.localComfy !== undefined ? await deps.localComfy() : [];
    const includeAudio = deps.localAudio !== undefined && options.profile === undefined;
    const audioRows = includeAudio && deps.localAudio !== undefined ? await deps.localAudio() : [];
    const profile = localOnly ? undefined : resolveProfile(options.profile);
    const rows = profile === undefined ? [] : await checkProfile(profile, await deps.createRegistry(), deps);

    if (options.json === true) {
      for (const row of [...localRows, ...audioRows, ...rows]) {
        io.stdout.write(`${JSON.stringify(row)}\n`);
      }
      return;
    }

    if (includeLocal) {
      io.stdout.write(formatLocalHuman(localRows));
      if (includeAudio || profile !== undefined) {
        io.stdout.write("\n");
      }
    }
    if (includeAudio) {
      io.stdout.write(formatRows("doctor: local audio (cuesheet transcription)", "whisper.cpp word timing for track and narration cuesheets.", audioRows));
      if (profile !== undefined) {
        io.stdout.write("\n");
      }
    }
    if (profile !== undefined) {
      io.stdout.write(formatHuman(profile, rows));
    }
  };
}

function doctorOptions(actionArgs: unknown[]): DoctorOptions {
  const command = [...actionArgs].reverse().find(isCommand);
  if (command !== undefined) {
    return command.optsWithGlobals<DoctorOptions>();
  }

  const options = actionArgs.find(isRecord);
  return options === undefined ? {} : (options as DoctorOptions);
}

function isCommand(value: unknown): value is Command {
  return isRecord(value) && typeof value.optsWithGlobals === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function createDefaultRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

function resolveProfile(slug: string | undefined = PAID_DEMO_PROFILE.slug): ProviderProfile {
  const profile = getProviderProfile(slug);
  if (profile !== undefined) {
    return profile;
  }

  throw new Error(
    `unknown provider profile "${slug}"; expected one of: ${[LOCAL_COMFY_PROFILE_SLUG, ...providerProfileNames()].join(", ")}`,
  );
}

const TOOLS_BY_KIND: Record<ComfyToolKind, string[]> = {
  image: ["comfy_image"],
  video: ["comfy_video", "comfy_text_to_video"],
  upscale: ["comfy_upscale"],
};

/** Server, comfy-cli, node packs, and per-engine model readiness for the default local route. */
export async function checkLocalComfy(
  client: ComfyClient,
  probeIntegration: (integration: Integration) => Promise<Availability>,
): Promise<DoctorRow[]> {
  const row = (check: string, description: string, ok: boolean, extra: { reason?: string; setup?: string; tools?: string[] }): DoctorRow => ({
    event: "doctor",
    profile: LOCAL_COMFY_PROFILE_SLUG,
    check,
    description,
    status: ok ? "ok" : "missing",
    ...(ok ? {} : { reason: extra.reason, setup: extra.setup }),
    tools: extra.tools ?? Object.values(LOCAL_COMFY_ROUTE.selected_stack).filter((name, index, all) => all.indexOf(name) === index),
  });
  const rows: DoctorRow[] = [];

  let cli: Availability;
  try {
    cli = await probeIntegration({ kind: "binary", binary: "comfy", install: "uv tool install comfy-cli" });
  } catch (error) {
    cli = { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
  rows.push(
    row("comfy-cli", "comfy-cli on PATH (installs ComfyUI, node packs, models)", cli.available, {
      reason: cli.available ? undefined : cli.reason,
      setup: "Run `showkick setup comfy` (it asks before `uv tool install comfy-cli`).",
    }),
  );

  const inspection = await inspectComfy(client);
  if (!inspection.reachable) {
    rows.push(
      row("ComfyUI server", `ComfyUI answering at ${inspection.url}`, false, {
        reason: inspection.reason,
        setup: "Start it with `comfy launch --background`, or run `showkick setup comfy` to install it. Set COMFY_URL if it runs elsewhere.",
      }),
    );
    return rows;
  }

  rows.push(row("ComfyUI server", `ComfyUI ${inspection.version ?? ""} answering at ${inspection.url}`.replace(/\s+/gu, " "), true, {}));

  const packStatus = new Map<NodePackId, string[]>();
  for (const status of inspection.engines) {
    for (const node of status.missingNodes) {
      packStatus.set(node.pack, [...new Set([...(packStatus.get(node.pack) ?? []), node.classType])]);
    }
  }
  for (const pack of ["comfyui-gguf", "comfyui-seedvr2_videoupscaler", "comfyui-frame-interpolation"] as const) {
    const missing = packStatus.get(pack) ?? [];
    rows.push(
      row(`node pack ${pack}`, NODE_PACKS[pack].label, missing.length === 0, {
        reason: `missing node class ${missing.join(", ")}`,
        setup: `Run ${NODE_PACKS[pack].fix} (or \`showkick setup comfy\`).`,
      }),
    );
  }
  const coreMissing = packStatus.get("core") ?? [];
  if (coreMissing.length > 0) {
    rows.push(
      row("ComfyUI version", "ComfyUI core nodes the engines need", false, {
        reason: `missing core node class ${coreMissing.join(", ")}`,
        setup: `Update ComfyUI: ${NODE_PACKS.core.fix}.`,
      }),
    );
  }

  for (const status of inspection.engines) {
    const engine = ENGINES[status.engine];
    rows.push(
      row(`engine ${engine.id}`, `${engine.label} — ${LICENCES[engine.licence].label}`, status.available, {
        reason: describeEngineBlockers(status).replace(/^[^:]+: /u, "").replace(/ — fix: .*$/u, ""),
        setup: status.fixes.join("; "),
        tools: TOOLS_BY_KIND[engine.tool],
      }),
    );
  }

  return rows;
}

/**
 * Preflights what `showkick cuesheet` needs to transcribe: a whisper.cpp binary, a
 * model file it can open (WHISPER_MODEL or the cache default), and a valid
 * TRANSCRIPTION_PROVIDER pin.
 */
export async function checkLocalAudio(
  env: Record<string, string | undefined> = process.env,
  projectRoot: string = process.cwd(),
): Promise<DoctorRow[]> {
  const row = (check: string, description: string, ok: boolean, extra: { reason?: string; setup?: string; tools: string[] }): DoctorRow => ({
    event: "doctor",
    profile: LOCAL_AUDIO_SLUG,
    check,
    description,
    status: ok ? "ok" : "missing",
    ...(ok ? {} : { reason: extra.reason, setup: extra.setup }),
    tools: extra.tools,
  });

  let pin: TranscriptionProviderPin | undefined;
  let pinError: string | undefined;
  try {
    pin = transcriptionProviderPin(env);
  } catch (error) {
    pinError = error instanceof Error ? error.message : String(error);
  }

  const rows: DoctorRow[] = [
    row(
      "transcription provider",
      pin === undefined ? "local whisper-cpp (default); set TRANSCRIPTION_PROVIDER to pin another" : `pinned to ${pin} by TRANSCRIPTION_PROVIDER`,
      pinError === undefined,
      { reason: pinError, setup: "Set TRANSCRIPTION_PROVIDER to whisper-cpp, elevenlabs-scribe, or auto.", tools: ["whisper-cpp", "elevenlabs-scribe"] },
    ),
  ];

  if (pin === "elevenlabs-scribe") {
    const hasKey = (env.ELEVENLABS_API_KEY ?? "").trim() !== "";
    rows.push(
      row("ELEVENLABS_API_KEY", "ElevenLabs Scribe transcription", hasKey, {
        reason: "missing env: ELEVENLABS_API_KEY",
        setup: "Set ELEVENLABS_API_KEY, or unset TRANSCRIPTION_PROVIDER to use local whisper-cpp.",
        tools: ["elevenlabs-scribe"],
      }),
    );
    return rows;
  }

  const binary = await findWhisperCli(env);
  rows.push(
    row("whisper-cli", binary === undefined ? "whisper.cpp binary on PATH" : `whisper.cpp binary: ${binary}`, binary !== undefined, {
      reason: `binary not on PATH: ${whisperCliCandidates(env).join(" or ")}`,
      setup: "brew install whisper-cpp (macOS), or set WHISPER_CLI to the whisper.cpp binary.",
      tools: ["whisper-cpp"],
    }),
  );

  const model = resolveWhisperModel(undefined, { env, projectRoot });
  rows.push(
    row("whisper model", model.ok ? `whisper model: ${model.path}` : "ggml model file whisper-cli can open", model.ok, {
      reason: model.ok ? undefined : model.reason,
      setup: WHISPER_MODEL_HELP,
      tools: ["whisper-cpp"],
    }),
  );

  return rows;
}

function formatRows(title: string, description: string, rows: DoctorRow[]): string {
  const lines = [title, description, ""];

  for (const row of rows) {
    lines.push(`${row.status} ${row.check} - ${row.description}`);
    if (row.reason !== undefined) {
      lines.push(`  reason: ${row.reason}`);
    }
    if (row.setup !== undefined) {
      lines.push(`  setup: ${row.setup}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatLocalHuman(rows: DoctorRow[]): string {
  const lines = [`doctor: ${LOCAL_COMFY_ROUTE.slug} (default local route)`, LOCAL_COMFY_ROUTE.description, ""];

  for (const row of rows) {
    lines.push(`${row.status} ${row.check} - ${row.description}`);
    if (row.reason !== undefined) {
      lines.push(`  reason: ${row.reason}`);
    }
    if (row.setup !== undefined) {
      lines.push(`  setup: ${row.setup}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function checkProfile(profile: ProviderProfile, registry: Registry, deps: DoctorDeps): Promise<DoctorRow[]> {
  const rows: DoctorRow[] = [];

  for (const check of profile.checks) {
    const missingTools = check.tool_names.filter((toolName) => registry.get(toolName) === undefined);
    if (missingTools.length > 0) {
      rows.push({
        event: "doctor",
        profile: profile.slug,
        check: check.label,
        description: check.description,
        status: "missing",
        reason: `unregistered tool: ${missingTools.join(", ")}`,
        setup: `Refresh the installed harness cache with \`${BRANDING.primaryCli} update\`.`,
        tools: check.tool_names,
      });
      continue;
    }

    let availability: Availability;
    try {
      availability = await deps.probeIntegration(check.integration);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      availability = { available: false, reason: `probe failed: ${message}`, fix: "manual" };
    }

    rows.push({
      event: "doctor",
      profile: profile.slug,
      check: check.label,
      description: check.description,
      status: availability.available ? "ok" : "missing",
      ...(availability.available ? {} : { reason: availability.reason, setup: check.setup }),
      tools: check.tool_names,
    });
  }

  return rows;
}

function formatHuman(profile: ProviderProfile, rows: DoctorRow[]): string {
  const lines = [`doctor: ${profile.slug} provider profile`, profile.description, ""];

  for (const row of rows) {
    lines.push(`${row.status} ${row.check} - ${row.description}`);
    if (row.reason !== undefined) {
      lines.push(`  reason: ${row.reason}`);
    }
    if (row.setup !== undefined) {
      lines.push(`  setup: ${row.setup}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
