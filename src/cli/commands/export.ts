import type { Command } from "commander";
import { writePublishLog } from "../../artifacts/index.js";
import { assembleExportPackage, type AssembleExportPackageResult } from "../../export/index.js";
import { loadRunTargetInput, selectRunTargetPipeline, type LoadedRunTarget, type LoadedRunTargetInput } from "./run-target.js";
import type { CliIo, GlobalOptions } from "./stub.js";

export type ExportCommandOptions = GlobalOptions & {
  target?: string;
  format?: string;
  assetLinkMode?: string;
  out?: string;
  overwrite?: boolean;
};

export type ExportDeps = {
  loadRunTargetInput: (target: string) => Promise<LoadedRunTargetInput>;
  selectRunTargetPipeline: (input: LoadedRunTargetInput) => Promise<LoadedRunTarget>;
  assembleExportPackage: typeof assembleExportPackage;
  writePublishLog: typeof writePublishLog;
};

const defaultDeps: ExportDeps = {
  loadRunTargetInput,
  selectRunTargetPipeline,
  assembleExportPackage,
  writePublishLog,
};

export function createExportHandler(io: CliIo, deps: ExportDeps = defaultDeps) {
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<ExportCommandOptions>();
    const input = await deps.loadRunTargetInput(target);
    const runTarget = await deps.selectRunTargetPipeline(input);
    const exportTarget = requestedExportTarget(options, runTarget);
    const result = await deps.assembleExportPackage({
      projectRoot: runTarget.projectRoot,
      show: runTarget.show,
      showSlug: runTarget.showSlug,
      episodeSlug: runTarget.episodeSlug,
      pipeline: runTarget.pipeline,
      target: exportTarget,
      assetLinkMode: options.assetLinkMode,
      outDir: options.out,
      overwrite: options.overwrite === true,
    });
    const publishLogPath = await deps.writePublishLog(
      runTarget.projectRoot,
      runTarget.showSlug,
      runTarget.episodeSlug,
      result.publishLog,
    );

    if (options.json === true) {
      io.stdout.write(`${JSON.stringify(exportEvent(runTarget, result, publishLogPath))}\n`);
      return;
    }

    io.stdout.write(
      [
        `exported ${runTarget.showSlug}/${runTarget.episodeSlug} for ${result.target}`,
        `package: ${result.packageDir}`,
        `timeline: ${result.timelinePath}`,
        `publish log: ${publishLogPath}`,
        `asset link mode: ${result.assetLinkMode}`,
        "",
      ].join("\n"),
    );
  };
}

function requestedExportTarget(options: ExportCommandOptions, runTarget: LoadedRunTarget): string {
  if (options.target !== undefined && options.format !== undefined) {
    throw new Error("use either --target or --format, not both");
  }

  const rawTarget =
    options.target ??
    formatToTarget(options.format) ??
    runTarget.show.export?.default_target ??
    runTarget.pipeline.export?.default_target;
  if (rawTarget === undefined || rawTarget.trim() === "") {
    throw new Error("predit export requires --target <target> or --format edl");
  }

  return rawTarget.trim().toLowerCase();
}

function formatToTarget(format: string | undefined): string | undefined {
  if (format === undefined) {
    return undefined;
  }

  const normalized = format.trim().toLowerCase();
  if (normalized === "edl") {
    return "edl";
  }

  throw new Error(`unsupported export format '${format}'; use --target premiere|davinci|capcut|edl or --format edl`);
}

function exportEvent(runTarget: LoadedRunTarget, result: AssembleExportPackageResult, publishLogPath: string): Record<string, unknown> {
  return {
    event: "exported",
    command: "export",
    show: runTarget.showSlug,
    episode: runTarget.episodeSlug,
    pipeline: runTarget.pipelineName,
    target: result.target,
    asset_link_mode: result.assetLinkMode,
    package_path: result.packageDir,
    timeline_path: result.timelinePath,
    captions_path: result.captionsPath,
    publish_log_path: publishLogPath,
    outputs: result.publishLog.outputs,
  };
}
