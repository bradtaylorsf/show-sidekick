import type { Command } from "commander";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Cuesheet } from "../../artifacts/cuesheet.js";
import type { DecisionEntry } from "../../artifacts/decision-log.js";
import { defineTool, Registry } from "../../registry/index.js";
import type { Episode } from "../../shows/episode.js";
import type { LoadedEpisode, LoadedShow } from "../../shows/load.js";
import { createCuesheetHandler, type CuesheetDeps } from "./cuesheet.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("createCuesheetHandler", () => {
  it("builds, writes, and prints a cuesheet summary", async () => {
    const io = captureIo();
    const deps = depsForEpisode(episode({ track: "music_library/demo.mp3" }));
    const handler = createCuesheetHandler(io, deps);

    await handler("show/episode", command());

    expect(deps.buildCuesheet).toHaveBeenCalledWith("/project/music_library/demo.mp3", expect.objectContaining({
      transcribe: true,
      detect_sections: true,
      detect_beats: true,
      detect_climax: true,
      registry: expect.any(Registry),
      projectRoot: "/project",
      recordDecision: expect.any(Function),
    }));
    expect(deps.writeCuesheet).toHaveBeenCalledWith("/project", "show", "episode", cuesheet());
    expect(io.stdoutText()).toContain("cuesheet written: /project/projects/show/episode/cuesheet.json");
    expect(io.stdoutText()).toContain("sections: 1");
    expect(io.stdoutText()).toContain("beats: 1");
  });

  it("prints NDJSON when --json is enabled", async () => {
    const io = captureIo();
    const handler = createCuesheetHandler(io, depsForEpisode(episode({ track: "/absolute/audio.wav" })));

    await handler("show/episode", command({ json: true }));

    const lines = io.stdoutText().trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(lines[0]).toMatchObject({
      event: "audio_preflight",
      tools: [
        { capability: "whisper", tool: "whisper-cpp" },
        { capability: "beats", tool: "aubio" },
      ],
    });
    expect(lines[1]).toMatchObject({
      event: "cuesheet",
      target: "show/episode",
      duration_s: 8,
      section_count: 1,
      beat_count: 1,
      climax_count: 1,
    });
  });

  it("throws cleanly when the episode has no audio track input", async () => {
    const io = captureIo();
    const handler = createCuesheetHandler(io, depsForEpisode(episode({})));

    await expect(handler("show/episode", command())).rejects.toThrow(
      "episode.inputs.track is missing and no completed voiceover artifacts were found to derive a cuesheet",
    );
  });

  it("records provider-selection decisions emitted while building the cuesheet", async () => {
    const io = captureIo();
    const deps = depsForEpisode(episode({ track: "music_library/demo.mp3" }));
    const decision = providerDecision();
    deps.buildCuesheet = vi.fn(async (_track, options) => {
      await options.recordDecision?.(decision);
      return cuesheet();
    });
    const handler = createCuesheetHandler(io, deps);

    await handler("show/episode", command());

    expect(deps.recordDecision).toHaveBeenCalledWith({ show: "show", episode: "episode" }, decision, { root: "/project" });
  });

  it("accepts the real Commander action signature", async () => {
    const io = captureIo();
    const deps = depsForEpisode(episode({ track: "music_library/demo.mp3" }));
    const handler = createCuesheetHandler(io, deps);

    await handler("show/episode", {}, command());

    expect(deps.writeCuesheet).toHaveBeenCalledWith("/project", "show", "episode", cuesheet());
  });

  it("derives a voiceover cuesheet from completed artifacts when there is no track input", async () => {
    const root = await scratchRoot();
    const deps = depsForEpisode(episode({}), root);
    const handler = createCuesheetHandler(captureIo(), deps);
    await writeCompletedVoiceoverArtifacts(root);

    await handler("show/episode", command());

    expect(deps.buildCuesheet).not.toHaveBeenCalled();
    expect(deps.writeCuesheet).toHaveBeenCalledWith(
      root,
      "show",
      "episode",
      expect.objectContaining({
        master_clock: "voiceover",
        audio: expect.objectContaining({
          path: "projects/show/episode/assets/narration.wav",
          duration_s: 30,
        }),
        segments: expect.arrayContaining([expect.objectContaining({ text: "Make the first video useful." })]),
      }),
    );
  });

  it("preserves URL track inputs instead of resolving them as local paths", async () => {
    const deps = depsForEpisode(episode({ track: "https://example.com/song.mp3" }));
    const handler = createCuesheetHandler(captureIo(), deps);

    await handler("show/episode", command());

    expect(deps.buildCuesheet).toHaveBeenCalledWith("https://example.com/song.mp3", expect.any(Object));
  });

  it("surfaces canonical episode input resolution errors before probing audio", async () => {
    const deps = depsForEpisode(episode({ track: "music_library/missing.mp3" }));
    deps.loadEpisode = vi.fn(async () => {
      throw new Error("inputs.track: file not found at /project/music_library/missing.mp3");
    });
    const handler = createCuesheetHandler(captureIo(), deps);

    await expect(handler("show/episode", command())).rejects.toThrow(
      "inputs.track: file not found at /project/music_library/missing.mp3",
    );
    expect(deps.buildCuesheet).not.toHaveBeenCalled();
  });
});

function depsForEpisode(episodeValue: Episode, root = "/project"): CuesheetDeps {
  const show = loadedShow();

  return {
    findProjectRoot: vi.fn(() => root),
    parseShowEpisode: vi.fn(() => ({
      show: "show",
      episode: "episode",
      showDir: path.join(root, "shows", "show"),
      episodeFile: path.join(root, "shows", "show", "episodes", "episode.yaml"),
    })),
    loadShow: vi.fn(async () => show),
    loadEpisode: vi.fn(async () => loadedEpisode(episodeValue)),
    createRegistry: vi.fn(async () => registry()),
    buildCuesheet: vi.fn(async () => cuesheet()),
    writeCuesheet: vi.fn(async () => "/project/projects/show/episode/cuesheet.json"),
    recordDecision: vi.fn(async () => []),
  };
}

function command(options: Record<string, unknown> = {}): Command {
  return {
    optsWithGlobals: () => options,
  } as unknown as Command;
}

function captureIo() {
  let stdout = "";
  let stderr = "";

  return {
    stdout: { write: (value: string) => { stdout += value; return true; } },
    stderr: { write: (value: string) => { stderr += value; return true; } },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  };
}

function episode(inputs: Record<string, unknown>): Episode {
  return {
    slug: "episode",
    title: "Episode",
    created: new Date("2026-05-12T00:00:00Z"),
    pipeline: "music-video",
    inputs,
    cast: [],
  };
}

function loadedShow(): LoadedShow {
  return {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-12T00:00:00Z"),
    pipelines: { "music-video": {} },
    defaults: { pipeline: "music-video" },
    projectRoot: "/project",
    rootDir: "/project/shows/show",
  };
}

function loadedEpisode(value: Episode): LoadedEpisode {
  return {
    ...value,
    filePath: "/project/shows/show/episodes/episode.yaml",
  };
}

async function scratchRoot(): Promise<string> {
  const root = path.join(tmpdir(), `predit-cuesheet-command-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeCompletedVoiceoverArtifacts(root: string): Promise<void> {
  const dir = path.join(root, "projects", "show", "episode");
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "script.json"),
    JSON.stringify({
      sections: [
        {
          slug: "hook",
          role: "hook",
          start_s: 0,
          end_s: 10,
          narration: "Make the first video useful.",
        },
        {
          slug: "next",
          role: "resolution",
          start_s: 10,
          end_s: 30,
          narration: "Review it, edit the script, and render again.",
        },
      ],
    }),
  );
  await writeFile(
    path.join(dir, "scene_plan.json"),
    JSON.stringify({
      scenes: [
        { slug: "hook", start_s: 0, end_s: 10 },
        { slug: "next", start_s: 10, end_s: 30 },
      ],
    }),
  );
  await writeFile(
    path.join(dir, "edit_decisions.json"),
    JSON.stringify({
      cuts: [],
      overlays: [],
      audio: { music: { track_path: "projects/show/episode/assets/narration.wav" } },
      render_runtime: "remotion",
      renderer_family: "animation-first",
    }),
  );
  await writeFile(
    path.join(dir, "render_report.json"),
    JSON.stringify({
      output_path: "projects/show/episode/renders/sample-preview.mp4",
      encoding_profile: "remotion/h264-aac",
      duration_s: 30,
      resolution: { width: 1080, height: 1920 },
      framerate: 30,
      runtime_used: "remotion",
      asset_count: 2,
      warnings: [],
      validation_steps: [],
    }),
  );
}

function registry(): Registry {
  return new Registry({
    tools: [
      fakeTool("whisper-cpp", "whisper"),
      fakeTool("aubio", "beats"),
    ],
  });
}

function fakeTool(name: string, capability: string) {
  return defineTool({
    name,
    capability,
    provider: name,
    status: "production",
    integration: { kind: "binary", binary: name, install: `install ${name}` },
    best_for: "test tool",
    input: z.object({}),
    output: z.object({}),
    async isAvailable() {
      return { available: true };
    },
    async execute() {
      return {};
    },
  });
}

function providerDecision(): DecisionEntry {
  return {
    id: "transcription_retry-2026-05-13T12-00-00-000Z",
    stage: "cuesheet",
    timestamp: "2026-05-13T12:00:00.000Z",
    category: "provider_selection",
    scope: { capability: "transcribe", provider: "whisper-cpp" },
    options_considered: [
      { label: "whisper-cpp:medium.en", rejected_because: "music_symbol_ratio>0.20" },
      { label: "whisper-cpp:large-v3", rejected_because: null },
    ],
    picked: "whisper-cpp:large-v3",
    reason: "retry required",
    confidence: 0.8,
    user_visible: true,
    supersedes: null,
  };
}

function cuesheet(): Cuesheet {
  return {
    audio: {
      path: "/project/music_library/demo.mp3",
      duration_s: 8,
      sample_rate: 44_100,
      channels: 2,
    },
    master_clock: "audio",
    bpm: 120,
    segments: [],
    sections: [{ label: "chorus", start_s: 0, end_s: 8, kind: "vocal", energy: 1 }],
    beats: [{ time_s: 0, strength: 1, is_downbeat: true }],
    climax: [{ time_s: 4, type: "peak", intensity: 1, source: "algorithm" }],
    scene_anchors: [],
  };
}
