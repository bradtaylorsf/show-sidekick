import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import type { Cuesheet } from "../../artifacts/cuesheet.js";
import type { Episode } from "../../shows/episode.js";
import { createCuesheetHandler, type CuesheetDeps } from "./cuesheet.js";

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
      projectRoot: "/project",
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

    expect(JSON.parse(io.stdoutText()) as unknown).toMatchObject({
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

    await expect(handler("show/episode", command())).rejects.toThrow("episode.inputs.track must be a non-empty audio path");
  });
});

function depsForEpisode(episodeValue: Episode): CuesheetDeps {
  return {
    findProjectRoot: vi.fn(() => "/project"),
    parseShowEpisode: vi.fn(() => ({
      show: "show",
      episode: "episode",
      showDir: "/project/shows/show",
      episodeFile: "/project/shows/show/episodes/episode.yaml",
    })),
    loadEpisode: vi.fn(async () => episodeValue),
    buildCuesheet: vi.fn(async () => cuesheet()),
    writeCuesheet: vi.fn(async () => "/project/projects/show/episode/cuesheet.json"),
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
