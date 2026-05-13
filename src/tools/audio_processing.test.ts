import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import audioEnhance from "./audio_enhance.js";
import audioMixer from "./audio_mixer.js";
import silenceCutter from "./silence_cutter.js";
import subtitleGen from "./subtitle_gen.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(projectRoot: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot,
    logger: noopLogger(),
    runCli: vi.fn(async () => ({ stdout: "", stderr: "" })),
    ...overrides,
  };
}

describe("audio processing tools", () => {
  it("declares local metadata and setup contracts", () => {
    expect(audioEnhance).toMatchObject({
      name: "audio_enhance",
      capability: "audio_processing",
      provider: "local",
      integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
      cost: { unit: "call", usd: 0 },
    });
    expect(audioMixer).toMatchObject({
      name: "audio_mixer",
      capability: "audio_processing",
      provider: "local",
      integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
      cost: { unit: "call", usd: 0 },
    });
    expect(subtitleGen).toMatchObject({
      name: "subtitle_gen",
      capability: "subtitle_generation",
      provider: "local",
      integration: { kind: "library", package: "node:fs", install: "built into Node.js" },
      cost: { unit: "call", usd: 0 },
    });
    expect(silenceCutter).toMatchObject({
      name: "silence_cutter",
      capability: "audio_processing",
      provider: "local",
      integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
      cost: { unit: "call", usd: 0 },
    });
  });

  it("builds an ffmpeg enhancement chain with noise reduction, normalization, and EQ", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-audio-enhance-"));
    const ctx = context(projectRoot);

    const result = await audioEnhance.execute(
      audioEnhance.input.parse({
        audio_path: "audio/noisy.wav",
        eq: { low_db: -2, mid_db: 1.5, high_db: 3 },
      }),
      ctx,
    );
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const filter = args[args.indexOf("-af") + 1];

    expect(runCli).toHaveBeenCalledWith("ffmpeg", expect.any(Array), { cwd: projectRoot });
    expect(filter).toContain("afftdn");
    expect(filter).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(filter).toContain("equalizer=f=100");
    expect(filter).toContain("g=-2");
    expect(filter).toContain("equalizer=f=1000");
    expect(filter).toContain("g=1.5");
    expect(filter).toContain("equalizer=f=10000");
    expect(filter).toContain("g=3");
    expect(result).toEqual({
      audio_path: join(projectRoot, "projects", "_tool_runs", "audio_enhance", "noisy-enhanced.wav"),
      cost_usd: 0,
    });
  });

  it("mixes narration and music with boolean ducking through sidechaincompress", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-audio-mixer-"));
    const ctx = context(projectRoot);

    await audioMixer.execute(
      audioMixer.input.parse({
        narration_path: "audio/vo.wav",
        music_path: "audio/music.wav",
        ducking: true,
      }),
      ctx,
    );
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const graph = args[args.indexOf("-filter_complex") + 1];

    expect(graph).toContain("sidechaincompress");
    expect(graph).toContain("threshold=-24dB");
    expect(graph).toContain("ratio=12");
    expect(graph).toContain("amix=inputs=2");
  });

  it("propagates explicit ducking values into the mixer graph", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-audio-mixer-"));
    const ctx = context(projectRoot);

    await audioMixer.execute(
      audioMixer.input.parse({
        narration_path: "audio/vo.wav",
        music_path: "audio/music.wav",
        sfx: [{ path: "audio/hit.wav", start_s: 1.25, volume_db: -6 }],
        ducking: {
          enabled: true,
          threshold_db: -18,
          reduction_db: 8,
          attack_ms: 15,
          release_ms: 250,
        },
      }),
      ctx,
    );
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const graph = args[args.indexOf("-filter_complex") + 1];

    expect(graph).toContain("threshold=-18dB");
    expect(graph).toContain("ratio=8");
    expect(graph).toContain("attack=15");
    expect(graph).toContain("release=250");
    expect(graph).toContain("adelay=1250|1250");
    expect(graph).toContain("volume=-6dB");
    expect(graph).toContain("amix=inputs=3");
  });

  it("omits sidechaincompress when ducking is false", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-audio-mixer-"));
    const ctx = context(projectRoot);

    await audioMixer.execute(
      audioMixer.input.parse({
        narration_path: "audio/vo.wav",
        music_path: "audio/music.wav",
        ducking: false,
      }),
      ctx,
    );
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const graph = args[args.indexOf("-filter_complex") + 1];

    expect(graph).not.toContain("sidechaincompress");
    expect(graph).toContain("amix=inputs=2");
  });

  it("writes valid SRT from a cuesheet", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-subtitles-"));
    const result = await subtitleGen.execute(
      subtitleGen.input.parse({
        cuesheet: [
          { start_s: 0.5, end_s: 2.25, text: "Opening line." },
          { start_s: 3, end_s: 4.75, text: "Second line." },
        ],
      }),
      context(projectRoot),
    );

    const text = await readFile(result.subtitle_path, "utf8");
    expect(result).toEqual({
      subtitle_path: join(projectRoot, "projects", "_tool_runs", "subtitles", "subtitles.srt"),
      format: "srt",
      cue_count: 2,
      cost_usd: 0,
    });
    expect(text).toMatch(/1\n00:00:00,500 --> 00:00:02,250\nOpening line\./);
    expect(text).toMatch(/2\n00:00:03,000 --> 00:00:04,750\nSecond line\./);
  });

  it("groups word timestamps into multi-word subtitle cues", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-subtitles-"));
    const result = await subtitleGen.execute(
      subtitleGen.input.parse({
        words: [
          { start_s: 0, end_s: 0.2, word: "A" },
          { start_s: 0.21, end_s: 0.4, word: "tight" },
          { start_s: 0.41, end_s: 0.7, word: "line" },
          { start_s: 0.8, end_s: 1.1, word: "breaks" },
          { start_s: 1.2, end_s: 1.5, word: "here" },
        ],
        max_chars_per_line: 12,
        format: "vtt",
      }),
      context(projectRoot),
    );

    const text = await readFile(result.subtitle_path, "utf8");
    expect(result).toMatchObject({ format: "vtt", cue_count: 2, cost_usd: 0 });
    expect(text).toContain("WEBVTT");
    expect(text).toContain("00:00:00.000 --> 00:00:00.700\nA tight line");
    expect(text).toContain("00:00:00.800 --> 00:00:01.500\nbreaks here");
  });

  it("cuts detected silences and returns duration reduction metrics", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-silence-cutter-"));
    const runCli = vi.fn(async (command: string, args: string[]) => {
      if (command === "ffprobe" && args.some((arg) => arg.endsWith("clips/talking-head.mp4"))) {
        return { stdout: "10\n", stderr: "" };
      }

      if (command === "ffprobe") {
        return { stdout: "6\n", stderr: "" };
      }

      if (command === "ffmpeg" && args.includes("-af")) {
        return {
          stdout: "",
          stderr: [
            "[silencedetect @ 0x1] silence_start: 1",
            "[silencedetect @ 0x1] silence_end: 3 | silence_duration: 2",
            "[silencedetect @ 0x1] silence_start: 6",
            "[silencedetect @ 0x1] silence_end: 8 | silence_duration: 2",
          ].join("\n"),
        };
      }

      return { stdout: "", stderr: "" };
    });
    const ctx = context(projectRoot, { runCli });

    const result = await silenceCutter.execute(
      silenceCutter.input.parse({
        video_path: "clips/talking-head.mp4",
        threshold_db: -35,
        min_silence_s: 0.75,
        padding_s: 0.1,
      }),
      ctx,
    );
    const trimCall = runCli.mock.calls.find((call) => call[0] === "ffmpeg" && call[1].includes("-filter_complex"));
    const graph = trimCall?.[1][trimCall[1].indexOf("-filter_complex") + 1] ?? "";

    expect(graph).toContain("trim=start=0:end=1.1");
    expect(graph).toContain("trim=start=2.9:end=6.1");
    expect(graph).toContain("trim=start=7.9:end=10");
    expect(result).toEqual({
      video_path: join(projectRoot, "projects", "_tool_runs", "silence_cutter", "talking-head-cut.mp4"),
      duration_before_s: 10,
      duration_after_s: 6,
      reduction_ratio: 0.4,
      cost_usd: 0,
    });
    expect(result.reduction_ratio).toBeGreaterThanOrEqual(0.2);
  });
});
