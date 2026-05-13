import { execFile } from "node:child_process";
import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  path: z.string().min(1),
  window_s: z.number().positive().default(0.5),
});

const energyWindowSchema = z.object({
  start_s: z.number(),
  end_s: z.number(),
  rms: z.number(),
  lufs: z.number(),
});

const outputSchema = z.object({
  windows: z.array(energyWindowSchema),
});

type AudioEnergyInput = z.infer<typeof inputSchema>;
type AudioEnergyOutput = z.infer<typeof outputSchema>;

export function parseAudioEnergyLog(log: string, windowS: number): AudioEnergyOutput {
  const windows: AudioEnergyOutput["windows"] = [];
  let current: AudioEnergyOutput["windows"][number] | undefined;

  for (const line of log.split(/\r?\n/)) {
    const pts = /pts_time[:=](-?\d+(?:\.\d+)?)/.exec(line);
    if (pts) {
      const start = Number(pts[1]);
      if (Number.isFinite(start)) {
        current = { start_s: start, end_s: start + windowS, rms: 0, lufs: 0 };
        windows.push(current);
      }
    }

    const rms = /(?:lavfi\.astats\.Overall\.RMS_level|RMS level dB)[:=]\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (rms) {
      current ??= { start_s: 0, end_s: windowS, rms: 0, lufs: 0 };
      if (!windows.includes(current)) {
        windows.push(current);
      }
      current.rms = Number(rms[1]);
    }

    const lufs = /(?:lavfi\.r128\.[MIS]|Integrated loudness|LUFS)[:=]\s*(-?\d+(?:\.\d+)?)/.exec(line);
    if (lufs) {
      current ??= { start_s: 0, end_s: windowS, rms: 0, lufs: 0 };
      if (!windows.includes(current)) {
        windows.push(current);
      }
      current.lufs = Number(lufs[1]);
    }
  }

  return {
    windows: windows.filter((window) => Number.isFinite(window.rms) && Number.isFinite(window.lufs)),
  };
}

async function runFile(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

const audioEnergy = defineTool({
  name: "audio_energy",
  capability: "audio_energy",
  provider: "ffmpeg",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: "brew install ffmpeg",
  },
  best_for: "audio energy windows for beat-aware and voiceover-aware analysis",
  supports: ["audio-rms", "lufs", "ffmpeg-astats"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: AudioEnergyInput) {
    const input = inputSchema.parse(params);
    const filter = `astats=metadata=1:reset=${input.window_s},ebur128=metadata=1`;
    const result = await runFile("ffmpeg", ["-hide_banner", "-nostats", "-i", input.path, "-af", filter, "-f", "null", "-"]);

    return outputSchema.parse(parseAudioEnergyLog(`${result.stdout}\n${result.stderr}`, input.window_s));
  },
});

export default audioEnergy;
