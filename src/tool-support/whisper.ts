import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const WHISPER_MODEL_ENV = "WHISPER_MODEL";
export const WHISPER_CLI_ENV = "WHISPER_CLI";
export const TRANSCRIPTION_PROVIDER_ENV = "TRANSCRIPTION_PROVIDER";

/** Binary names whisper.cpp ships under, in probe order. Homebrew installs `whisper-cli`. */
export const WHISPER_CLI_BINARIES = ["whisper-cli", "whisper-cpp"] as const;

export const WHISPER_MODEL_HELP =
  "set WHISPER_MODEL in the project .env to a ggml model file (e.g. WHISPER_MODEL=$HOME/.cache/whisper/ggml-medium.en.bin); download models from https://huggingface.co/ggerganov/whisper.cpp";

export type WhisperModelResolution =
  | { ok: true; path: string; source: "path" | "env" | "search" }
  | { ok: false; reason: string; searched: string[] };

type Env = Record<string, string | undefined>;

export type WhisperModelOptions = {
  env?: Env;
  projectRoot?: string;
};

/**
 * Turns a whisper model reference into a ggml file path whisper-cli can open.
 *
 * - A path (has a separator, `~`, or ends in `.bin`) is expanded and used as is.
 * - A bare name like `medium.en` is looked up as `ggml-<name>.bin` next to WHISPER_MODEL
 *   and in the usual whisper.cpp cache folders.
 * - With no model, WHISPER_MODEL wins; otherwise `medium.en` is looked up.
 */
export function resolveWhisperModel(model: string | undefined, options: WhisperModelOptions = {}): WhisperModelResolution {
  const env = options.env ?? process.env;
  const projectRoot = options.projectRoot ?? process.cwd();
  const configured = configuredWhisperModel(env);
  const requested = model?.trim() || configured || "medium.en";

  if (looksLikeModelPath(requested)) {
    const candidate = path.resolve(projectRoot, expandHome(requested, env));
    const source = model?.trim() ? "path" : "env";
    if (isReadableFile(candidate)) {
      return { ok: true, path: candidate, source };
    }

    const origin = source === "env" ? `${WHISPER_MODEL_ENV}=${requested}` : `model ${requested}`;
    return {
      ok: false,
      reason: `whisper model file not found: ${candidate} (from ${origin}); ${WHISPER_MODEL_HELP}`,
      searched: [candidate],
    };
  }

  const searched = modelSearchDirs(env, projectRoot).flatMap((dir) =>
    [`ggml-${requested}.bin`, `${requested}.bin`].map((file) => path.join(dir, file)),
  );
  const found = searched.find(isReadableFile);
  if (found !== undefined) {
    return { ok: true, path: found, source: "search" };
  }

  return {
    ok: false,
    reason: `whisper model '${requested}' not found; looked for ${searched.join(", ")}; ${WHISPER_MODEL_HELP}`,
    searched,
  };
}

export function configuredWhisperModel(env: Env = process.env): string | undefined {
  const value = env[WHISPER_MODEL_ENV]?.trim();
  return value ? value : undefined;
}

/** Binary names to try for whisper.cpp: WHISPER_CLI first when set, then the stock names. */
export function whisperCliCandidates(env: Env = process.env): string[] {
  const override = env[WHISPER_CLI_ENV]?.trim();
  return override ? [expandHome(override, env)] : [...WHISPER_CLI_BINARIES];
}

/** First whisper.cpp binary that resolves, or undefined when none do. */
export async function findWhisperCli(env: Env = process.env): Promise<string | undefined> {
  for (const candidate of whisperCliCandidates(env)) {
    if (path.isAbsolute(candidate) ? isExecutableFile(candidate) : onPath(candidate, env)) {
      return candidate;
    }
  }

  return undefined;
}

export type TranscriptionProviderPin = "whisper-cpp" | "elevenlabs-scribe";

const PROVIDER_ALIASES: Record<string, TranscriptionProviderPin> = {
  "whisper-cpp": "whisper-cpp",
  whisper: "whisper-cpp",
  "whisper.cpp": "whisper-cpp",
  local: "whisper-cpp",
  "elevenlabs-scribe": "elevenlabs-scribe",
  scribe: "elevenlabs-scribe",
  elevenlabs: "elevenlabs-scribe",
};

/** Reads TRANSCRIPTION_PROVIDER. Unset or `auto` means no pin; anything unknown throws. */
export function transcriptionProviderPin(env: Env = process.env): TranscriptionProviderPin | undefined {
  const raw = env[TRANSCRIPTION_PROVIDER_ENV]?.trim().toLowerCase();
  if (!raw || raw === "auto") {
    return undefined;
  }

  const pin = PROVIDER_ALIASES[raw];
  if (pin === undefined) {
    throw new Error(
      `${TRANSCRIPTION_PROVIDER_ENV}=${raw} is not a known transcription provider; use whisper-cpp, elevenlabs-scribe, or auto`,
    );
  }

  return pin;
}

function modelSearchDirs(env: Env, projectRoot: string): string[] {
  const home = env.HOME?.trim() || homedir();
  const configured = configuredWhisperModel(env);
  const dirs = [
    ...(configured && looksLikeModelPath(configured) ? [path.dirname(path.resolve(projectRoot, expandHome(configured, env)))] : []),
    path.join(home, ".cache", "whisper"),
    path.join(home, ".cache", "whisper.cpp"),
  ];

  return [...new Set(dirs)];
}

function looksLikeModelPath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.startsWith("~") || value.includes("$") || value.endsWith(".bin");
}

/** Expands `~`, `$HOME`, and `${VAR}` / `$VAR`; the project .env loader leaves them literal. */
export function expandHome(value: string, env: Env = process.env): string {
  const home = env.HOME?.trim() || homedir();
  const withHome = value === "~" ? home : value.startsWith("~/") ? path.join(home, value.slice(2)) : value;

  return withHome.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu, (match, braced: string | undefined, bare: string | undefined) => {
    const name = braced ?? bare ?? "";
    if (name === "HOME") {
      return home;
    }
    return env[name] ?? match;
  });
}

function isReadableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) {
      return false;
    }
    accessSync(candidate, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) {
      return false;
    }
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function onPath(binary: string, env: Env): boolean {
  return (env.PATH ?? "")
    .split(path.delimiter)
    .filter((dir) => dir !== "")
    .some((dir) => isExecutableFile(path.join(dir, binary)));
}
