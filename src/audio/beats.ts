import type { Registry, Tool, ToolContext, ToolLogger } from "../registry/index.js";
import * as defaultLogger from "../log/logger.js";
import aubio from "../tools/aubio.js";
import type { AudioTrack, Beat } from "./types.js";

export interface DetectBeatsOptions {
  expect_bpm?: [number, number];
  prefer?: string[];
  registry?: Registry;
  logger?: ToolLogger;
  projectRoot?: string;
}

export interface BeatDetection {
  bpm: number;
  beats: Beat[];
}

type DetectBeatsToolInput = {
  audio_path: string;
  expect_bpm?: [number, number];
};

type DetectBeatsToolOutput = BeatDetection;

export async function detectBeats(track: AudioTrack, options: DetectBeatsOptions = {}): Promise<BeatDetection> {
  const tool = await selectBeatTool(options);
  const ctx: ToolContext = {
    projectRoot: options.projectRoot ?? process.cwd(),
    logger: options.logger ?? defaultLogger,
  };

  return tool.execute(
    {
      audio_path: track.path,
      ...(options.expect_bpm === undefined ? {} : { expect_bpm: options.expect_bpm }),
    },
    ctx,
  );
}

async function selectBeatTool(options: DetectBeatsOptions): Promise<Tool<DetectBeatsToolInput, DetectBeatsToolOutput>> {
  if (!options.registry) {
    return aubio;
  }

  return (await options.registry.select("beats", { prefer: options.prefer })) as Tool<
    DetectBeatsToolInput,
    DetectBeatsToolOutput
  >;
}
