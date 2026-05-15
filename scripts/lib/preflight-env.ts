import { defaultSpawnCommand, type SpawnCommand } from "./spawn-cli.ts";

export type BinaryAvailability = {
  readonly available: boolean;
  readonly path?: string;
};

export type DemoMatrixEnvAvailability = {
  readonly OPENAI_API_KEY: boolean;
  readonly ELEVENLABS_API_KEY: boolean;
  readonly higgsfield: BinaryAvailability;
  readonly ffmpeg: BinaryAvailability;
};

export type DemoMatrixEnvOptions = {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly runCommand?: SpawnCommand;
};

export async function snapshotDemoMatrixEnv(options: DemoMatrixEnvOptions): Promise<DemoMatrixEnvAvailability> {
  const env = options.env ?? process.env;
  const runCommand = options.runCommand ?? defaultSpawnCommand;

  const [higgsfield, ffmpeg] = await Promise.all([
    whichBinary("higgsfield", options.cwd, env, runCommand),
    whichBinary("ffmpeg", options.cwd, env, runCommand),
  ]);

  return {
    OPENAI_API_KEY: hasEnv(env, "OPENAI_API_KEY"),
    ELEVENLABS_API_KEY: hasEnv(env, "ELEVENLABS_API_KEY"),
    higgsfield,
    ffmpeg,
  };
}

async function whichBinary(
  binary: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  runCommand: SpawnCommand,
): Promise<BinaryAvailability> {
  const result = await runCommand("which", [binary], { cwd, env, timeoutMs: 5_000 });
  const resolvedPath = result.stdout.trim().split(/\r?\n/u)[0];

  if (result.exitCode === 0 && resolvedPath !== undefined && resolvedPath.length > 0) {
    return { available: true, path: resolvedPath };
  }

  return { available: false };
}

function hasEnv(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name];
  return typeof value === "string" && value.length > 0;
}
