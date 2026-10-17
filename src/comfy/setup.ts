import { dirname, join } from "node:path";
import { inspectComfy } from "./availability.js";
import type { ComfyClient } from "./client.js";
import {
  ENGINES,
  LICENCES,
  MODEL_FILES,
  NODE_PACKS,
  hfUrl,
  type EngineDefinition,
  type EngineId,
  type ModelFile,
  type NodePackId,
} from "./models.js";
import { describeHardware, recommendTier, type Hardware } from "./platform.js";

/**
 * `showkick setup comfy`: a guided ComfyUI install. It detects the machine, prints
 * every command and every model file (size, source repo, licence) before acting, and
 * runs nothing — no install, no launch, no node pack, no download — without an
 * explicit yes at its own prompt. It never stores or passes credentials: gated
 * downloads rely on the user's own `hf auth login`.
 */

export type SetupCommand = { command: string; args: string[] };

export type CommandResult = { ok: boolean; stdout: string };

export type ComfySetupDeps = {
  write: (line: string) => void;
  confirm: (question: string) => Promise<boolean>;
  /** Runs a command with output streamed to the user. */
  run: (command: SetupCommand) => Promise<CommandResult>;
  /** Runs a read-only probe quietly (e.g. `comfy which`, `hf auth whoami`). */
  capture: (command: SetupCommand) => Promise<CommandResult>;
  commandExists: (binary: string) => Promise<boolean>;
  hardware: () => Promise<Hardware>;
  client: ComfyClient;
  sleep: (ms: number) => Promise<void>;
};

export type ComfySetupOptions = {
  engines?: EngineId[];
  skipModels?: boolean;
  /** Print the plan only: never prompt, never run. Used for --dry-run, --json and non-TTY runs. */
  planOnly?: boolean;
  workspace?: string;
  launchWaitMs?: number;
};

export type SetupStepStatus = "ok" | "done" | "declined" | "planned" | "blocked" | "failed" | "skipped";

export type ComfySetupStep = {
  id: string;
  status: SetupStepStatus;
  detail: string;
  commands?: string[];
};

export type ModelDownload = {
  file: ModelFile;
  engines: EngineId[];
  command: SetupCommand;
};

export async function runComfySetup(options: ComfySetupOptions, deps: ComfySetupDeps): Promise<ComfySetupStep[]> {
  const steps: ComfySetupStep[] = [];
  const record = (step: ComfySetupStep): ComfySetupStep => {
    steps.push(step);
    deps.write(`${statusLabel(step.status)} ${step.id}: ${step.detail}`);
    for (const command of step.commands ?? []) {
      deps.write(`    ${command}`);
    }
    return step;
  };
  const ask = async (question: string): Promise<boolean> => (options.planOnly === true ? false : await deps.confirm(question));

  // 1. Hardware and engine tier ------------------------------------------------
  const hardware = await deps.hardware();
  const tier = recommendTier(hardware);
  const engines = options.engines ?? tier.recommended;
  deps.write(`ComfyUI local setup for ${describeHardware(hardware)}`);
  deps.write(`Recommended tier: ${tier.tier} (about ${tier.budgetGb} GB for models).`);
  deps.write(`  default engines (Apache-2.0): ${tier.recommended.join(", ") || "none"}`);
  if (tier.optIn.length > 0) {
    deps.write(`  also fit, licence decision needed: ${tier.optIn.map((id) => `${id} (${LICENCES[ENGINES[id].licence].label})`).join(", ")}`);
  }
  if (tier.tooLarge.length > 0) {
    deps.write(`  too large for this machine: ${tier.tooLarge.join(", ")}`);
  }
  for (const note of tier.notes) {
    deps.write(`  note: ${note}`);
  }
  deps.write(`Engines for this run: ${engines.join(", ")}${options.engines === undefined ? " (pass --engines to change)" : ""}`);
  deps.write("Nothing below runs without a yes at its prompt.");
  deps.write("");
  record({ id: "hardware", status: "ok", detail: `${tier.tier} tier; engines ${engines.join(", ")}` });

  // 2. comfy-cli ---------------------------------------------------------------
  if (!(await deps.commandExists("comfy"))) {
    const install: SetupCommand = { command: "uv", args: ["tool", "install", "comfy-cli"] };
    if (!(await deps.commandExists("uv"))) {
      record({
        id: "comfy-cli",
        status: "blocked",
        detail:
          "comfy-cli is installed with uv, and uv is not on PATH. Install uv first (https://docs.astral.sh/uv/getting-started/installation/), then rerun `showkick setup comfy`. Show Sidekick does not install system tools for you.",
      });
      return steps;
    }

    if (!(await ask(`Install comfy-cli now with \`${formatCommand(install)}\`? [y/N] `))) {
      record({ id: "comfy-cli", status: options.planOnly === true ? "planned" : "declined", detail: "comfy-cli not installed", commands: [formatCommand(install)] });
      return finish(steps, deps, options);
    }

    const result = await deps.run(install);
    record({ id: "comfy-cli", status: result.ok ? "done" : "failed", detail: result.ok ? "installed comfy-cli" : "uv tool install comfy-cli failed", commands: [formatCommand(install)] });
    if (!result.ok) {
      return steps;
    }
  } else {
    record({ id: "comfy-cli", status: "ok", detail: "comfy-cli is on PATH" });
  }

  // 3. ComfyUI install + server ------------------------------------------------
  let workspace = options.workspace ?? (await findWorkspace(deps));
  let reach = await deps.client.isReachable();

  if (!reach.reachable) {
    if (workspace === undefined) {
      const install: SetupCommand = { command: "comfy", args: ["--skip-prompt", "install", tier.installFlag] };
      if (!(await ask(`Install ComfyUI with \`${formatCommand(install)}\`? This downloads ComfyUI and PyTorch (several GB). [y/N] `))) {
        record({ id: "comfyui-install", status: options.planOnly === true ? "planned" : "declined", detail: "ComfyUI not installed", commands: [formatCommand(install)] });
        return finish(steps, deps, options);
      }

      const result = await deps.run(install);
      record({ id: "comfyui-install", status: result.ok ? "done" : "failed", detail: result.ok ? "ComfyUI installed" : "comfy install failed", commands: [formatCommand(install)] });
      if (!result.ok) {
        return steps;
      }
      workspace = await findWorkspace(deps);
    } else {
      record({ id: "comfyui-install", status: "ok", detail: `ComfyUI workspace at ${workspace}` });
    }

    const launch: SetupCommand = { command: "comfy", args: ["launch", "--background"] };
    if (!(await ask(`ComfyUI is not running at ${deps.client.baseUrl}. Start it with \`${formatCommand(launch)}\`? [y/N] `))) {
      record({ id: "comfyui-server", status: options.planOnly === true ? "planned" : "declined", detail: `not running at ${deps.client.baseUrl}`, commands: [formatCommand(launch)] });
      return finish(steps, deps, options);
    }

    await deps.run(launch);
    reach = await waitForServer(deps, options.launchWaitMs ?? 120_000);
    if (!reach.reachable) {
      record({
        id: "comfyui-server",
        status: "failed",
        detail: `launched, but ${deps.client.baseUrl} did not answer (${reach.reason}). Check \`comfy logs\`. If ComfyUI runs on another port, set COMFY_URL.`,
      });
      return steps;
    }
    record({ id: "comfyui-server", status: "done", detail: `ComfyUI is answering at ${deps.client.baseUrl}`, commands: [formatCommand(launch)] });
  } else {
    record({
      id: "comfyui-server",
      status: "ok",
      detail: `ComfyUI ${reach.stats.system?.comfyui_version ?? ""} answering at ${deps.client.baseUrl}`.replace(/\s+/gu, " "),
    });
  }

  // 4. Custom node packs -------------------------------------------------------
  const selected = engines.map((id) => ENGINES[id]);
  const objectInfo = await deps.client.objectInfo({ refresh: true });
  const missingPacks = missingNodePacks(selected, objectInfo);

  if (missingPacks.core.length > 0) {
    record({
      id: "comfyui-version",
      status: "blocked",
      detail: `this ComfyUI build lacks ${missingPacks.core.join(", ")} (needed by ${missingPacks.coreEngines.join(", ")}). Update ComfyUI yourself when no job is running, then restart it:`,
      commands: ["comfy update comfy", "comfy stop && comfy launch --background"],
    });
  }

  if (missingPacks.packs.length > 0) {
    const install: SetupCommand = {
      command: "comfy",
      args: ["node", "install", ...missingPacks.packs.map((pack) => NODE_PACKS[pack].installName as string)],
    };
    if (await ask(`Install node pack(s) ${missingPacks.packs.map((pack) => NODE_PACKS[pack].label).join(", ")} with \`${formatCommand(install)}\`? [y/N] `)) {
      const result = await deps.run(install);
      record({ id: "node-packs", status: result.ok ? "done" : "failed", detail: result.ok ? "node packs installed" : "comfy node install failed", commands: [formatCommand(install)] });
      if (result.ok) {
        const stop: SetupCommand = { command: "comfy", args: ["stop"] };
        const launch: SetupCommand = { command: "comfy", args: ["launch", "--background"] };
        if (await ask("New nodes load on restart. Restart ComfyUI now (`comfy stop` then `comfy launch --background`)? Running jobs are interrupted. [y/N] ")) {
          await deps.run(stop);
          await deps.run(launch);
          const restarted = await waitForServer(deps, options.launchWaitMs ?? 120_000);
          record({ id: "comfyui-restart", status: restarted.reachable ? "done" : "failed", detail: restarted.reachable ? "ComfyUI restarted" : "ComfyUI did not come back; check `comfy logs`" });
        } else {
          record({ id: "comfyui-restart", status: "declined", detail: "restart ComfyUI before using the new nodes", commands: ["comfy stop && comfy launch --background"] });
        }
      }
    } else {
      record({ id: "node-packs", status: options.planOnly === true ? "planned" : "declined", detail: "node packs not installed", commands: [formatCommand(install)] });
    }
  } else {
    record({ id: "node-packs", status: "ok", detail: "required custom node packs are present" });
  }

  // 5. Models ------------------------------------------------------------------
  if (options.skipModels === true) {
    record({ id: "models", status: "skipped", detail: "--skip-models" });
    return finish(steps, deps, options);
  }

  if (workspace === undefined) {
    record({
      id: "models",
      status: "blocked",
      detail: "could not find the ComfyUI workspace (`comfy which` gave nothing). Rerun with --workspace <path-to-ComfyUI>.",
    });
    return finish(steps, deps, options);
  }

  const inspection = await inspectComfy(deps.client, selected);
  const hfOnPath = await deps.commandExists("hf");
  const missing = inspection.reachable
    ? missingDownloads(
        inspection.engines.map((status) => ENGINES[status.engine]),
        inspection.engines,
        workspace,
        { hfAvailable: hfOnPath },
      )
    : [];
  if (missing.length === 0) {
    record({ id: "models", status: "ok", detail: `all model files for ${engines.join(", ")} are present` });
    return finish(steps, deps, options);
  }

  const gated = missing.filter((download) => download.file.gated === true);
  let downloadable = missing;
  if (gated.length > 0) {
    const hfReady = hfOnPath && (await deps.capture({ command: "hf", args: ["auth", "whoami"] })).ok;
    if (!hfReady) {
      downloadable = missing.filter((download) => download.file.gated !== true);
      record({
        id: "models-gated",
        status: "blocked",
        detail: `${gated.length} file(s) are on a gated Hugging Face repo (${[...new Set(gated.map((download) => download.file.repo))].join(", ")}). Accept the licence at https://huggingface.co/Lightricks/LTX-2.5, then log in yourself; Show Sidekick never stores the token:`,
        commands: ["hf auth login"],
      });
    }
  }

  deps.write("");
  deps.write(`Missing model files (${workspace}/models):`);
  for (const download of missing) {
    const licence = LICENCES[ENGINES[download.engines[0] as EngineId].licence].label;
    const gate = download.file.gated === true ? " [gated]" : "";
    deps.write(
      `  ${download.file.folder}/${download.file.filename}  ${download.file.sizeGb.toFixed(2)} GB  from ${download.file.repo}  ${licence}${gate}  (for ${download.engines.join(", ")})`,
    );
  }
  for (const engine of licenceNotices(missing)) {
    deps.write(`  licence — ${engine.id}: ${LICENCES[engine.licence].summary} ${LICENCES[engine.licence].url}`);
  }

  if (downloadable.length === 0) {
    return finish(steps, deps, options);
  }

  const totalGb = downloadable.reduce((sum, download) => sum + download.file.sizeGb, 0);
  const commands = downloadable.map((download) => formatCommand(download.command));
  if (!(await ask(`Download ${downloadable.length} file(s), ${totalGb.toFixed(1)} GB, into ${workspace}/models? [y/N] `))) {
    record({
      id: "models",
      status: options.planOnly === true ? "planned" : "declined",
      detail: `${downloadable.length} file(s), ${totalGb.toFixed(1)} GB not downloaded`,
      commands,
    });
    return finish(steps, deps, options);
  }

  let failed = 0;
  for (const download of downloadable) {
    deps.write(`downloading ${download.file.filename} (${download.file.sizeGb.toFixed(2)} GB)...`);
    const result = await deps.run(download.command);
    if (!result.ok) {
      failed += 1;
      deps.write(`  failed: ${formatCommand(download.command)}`);
    }
  }
  record({
    id: "models",
    status: failed === 0 ? "done" : "failed",
    detail: failed === 0 ? `downloaded ${downloadable.length} file(s)` : `${failed} of ${downloadable.length} download(s) failed`,
  });

  return finish(steps, deps, options);
}

export function missingNodePacks(
  engines: EngineDefinition[],
  objectInfo: Record<string, unknown>,
): { packs: NodePackId[]; core: string[]; coreEngines: EngineId[] } {
  const packs = new Set<NodePackId>();
  const core = new Set<string>();
  const coreEngines = new Set<EngineId>();

  for (const engine of engines) {
    for (const node of engine.nodes) {
      if (objectInfo[node.classType] !== undefined) {
        continue;
      }
      if (node.pack === "core") {
        core.add(node.classType);
        coreEngines.add(engine.id);
      } else {
        packs.add(node.pack);
      }
    }
  }

  return { packs: [...packs], core: [...core], coreEngines: [...coreEngines] };
}

export function missingDownloads(
  engines: EngineDefinition[],
  statuses: Array<{ engine: EngineId; missingFiles: ModelFile[]; missingOptionalFiles: ModelFile[] }>,
  workspace: string,
  options: { hfAvailable: boolean } = { hfAvailable: true },
): ModelDownload[] {
  const byPath = new Map<string, ModelDownload>();

  for (const engine of engines) {
    const status = statuses.find((candidate) => candidate.engine === engine.id);
    for (const file of [...(status?.missingFiles ?? []), ...(status?.missingOptionalFiles ?? [])]) {
      // clip_vision_h is listed for completeness but unused by the Wan 2.2 graph; do not download it by default.
      if (file === MODEL_FILES.clipVisionH) {
        continue;
      }
      const key = `${file.folder}/${file.filename}`;
      const existing = byPath.get(key);
      if (existing !== undefined) {
        existing.engines.push(engine.id);
        continue;
      }
      byPath.set(key, { file, engines: [engine.id], command: downloadCommand(file, workspace, options) });
    }
  }

  return [...byPath.values()];
}

/**
 * When the repo already mirrors ComfyUI's folder layout (`<folder>/<file>`), `hf download`
 * lands the file in place and uses the user's own `hf auth login` for gated repos.
 * Otherwise (or without `hf` on PATH) comfy-cli fetches the resolve URL into the right
 * folder under a stable name. Gated files always go through `hf`.
 */
export function downloadCommand(
  file: ModelFile,
  workspace: string,
  options: { hfAvailable: boolean } = { hfAvailable: true },
): SetupCommand {
  const mirrorsLayout = dirname(file.repoPath) === file.folder && file.repoPath.endsWith(`/${file.filename}`);
  if (file.gated === true || (mirrorsLayout && options.hfAvailable)) {
    return { command: "hf", args: ["download", file.repo, file.repoPath, "--local-dir", join(workspace, "models")] };
  }

  return {
    command: "comfy",
    args: [
      "--workspace",
      workspace,
      "--skip-prompt",
      "model",
      "download",
      "--url",
      hfUrl(file),
      "--relative-path",
      `models/${file.folder}`,
      "--filename",
      file.filename,
    ],
  };
}

export function formatCommand(command: SetupCommand): string {
  return [command.command, ...command.args].map(shellWord).join(" ");
}

function licenceNotices(downloads: ModelDownload[]): EngineDefinition[] {
  const engines = new Map<EngineId, EngineDefinition>();
  for (const download of downloads) {
    for (const id of download.engines) {
      if (ENGINES[id].licence !== "apache-2.0") {
        engines.set(id, ENGINES[id]);
      }
    }
  }
  return [...engines.values()];
}

async function findWorkspace(deps: ComfySetupDeps): Promise<string | undefined> {
  if (!(await deps.commandExists("comfy"))) {
    return undefined;
  }

  const result = await deps.capture({ command: "comfy", args: ["--skip-prompt", "which"] });
  if (!result.ok) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(result.stdout) as { data?: { workspace_path?: unknown }; ok?: boolean };
    return typeof parsed.data?.workspace_path === "string" && parsed.data.workspace_path !== "" ? parsed.data.workspace_path : undefined;
  } catch {
    const match = /(\/[^\s'"]*ComfyUI[^\s'"]*)/u.exec(result.stdout);
    return match?.[1];
  }
}

async function waitForServer(
  deps: ComfySetupDeps,
  timeoutMs: number,
): Promise<Awaited<ReturnType<ComfyClient["isReachable"]>>> {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 3_000));
  let last = await deps.client.isReachable();
  for (let attempt = 1; attempt < attempts && !last.reachable; attempt += 1) {
    await deps.sleep(3_000);
    last = await deps.client.isReachable();
  }
  return last;
}

function finish(steps: ComfySetupStep[], deps: ComfySetupDeps, options: ComfySetupOptions): ComfySetupStep[] {
  deps.write("");
  if (options.planOnly === true) {
    deps.write("Plan only: nothing was installed or downloaded. Rerun `showkick setup comfy` in a terminal to be asked step by step.");
  }
  deps.write("Check the result with: showkick doctor --profile local-comfy");
  return steps;
}

function statusLabel(status: SetupStepStatus): string {
  return status === "ok" || status === "done" ? "ok" : status;
}

function shellWord(value: string): string {
  return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`;
}
