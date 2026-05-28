import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { VideoAnalysisBriefSchema, type VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { defineTool, Registry } from "../registry/index.js";
import { analyzeReference, ReferenceSourceNotFoundError, resolveReferenceSource } from "./reference-workflow.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("resolveReferenceSource", () => {
  it("detects http, https, and file URLs with new URL parsing", async () => {
    const root = await scratchProject();
    const source = resolveReferenceSource("https://example.com/reference.mp4", { projectRoot: root });
    const fileUrl = resolveReferenceSource(pathToFileURL(path.join(root, "reference.mp4")).href, { projectRoot: root });

    expect(source).toEqual({
      kind: "url",
      original: "https://example.com/reference.mp4",
      url: "https://example.com/reference.mp4",
    });
    expect(fileUrl).toMatchObject({ kind: "url", url: expect.stringMatching(/^file:/u) });
  });

  it("honors existing absolute file paths", async () => {
    const root = await scratchProject();
    const referencePath = path.join(root, "absolute-reference.mp4");
    await writeFile(referencePath, "video", "utf8");

    expect(resolveReferenceSource(referencePath, { projectRoot: root })).toEqual({
      kind: "file",
      original: referencePath,
      absolutePath: referencePath,
    });
  });

  it("resolves relative paths against cwd before project input fallbacks", async () => {
    const root = await scratchProject();
    const cwd = path.join(root, "nested");
    const referencePath = path.join(cwd, "relative-reference.mp4");
    await mkdir(cwd, { recursive: true });
    await writeFile(referencePath, "video", "utf8");
    await mkdir(path.join(root, "inputs"), { recursive: true });
    await writeFile(path.join(root, "inputs", "relative-reference.mp4"), "input video", "utf8");
    await mkdir(path.join(root, "music_library"), { recursive: true });
    await writeFile(path.join(root, "music_library", "relative-reference.mp4"), "music video", "utf8");

    expect(resolveReferenceSource("relative-reference.mp4", { projectRoot: root, cwd })).toEqual({
      kind: "file",
      original: "relative-reference.mp4",
      absolutePath: referencePath,
    });
  });

  it("falls back to project inputs for relative paths", async () => {
    const root = await scratchProject();
    const cwd = path.join(root, "shows", "demo");
    const referencePath = path.join(root, "inputs", "song", "reference.mp4");
    await mkdir(cwd, { recursive: true });
    await mkdir(path.dirname(referencePath), { recursive: true });
    await writeFile(referencePath, "video", "utf8");

    expect(resolveReferenceSource("song/reference.mp4", { projectRoot: root, cwd })).toEqual({
      kind: "file",
      original: "song/reference.mp4",
      absolutePath: referencePath,
    });
  });

  it("keeps music_library as a legacy relative-path fallback", async () => {
    const root = await scratchProject();
    const cwd = path.join(root, "shows", "demo");
    const referencePath = path.join(root, "music_library", "song", "reference.mp4");
    await mkdir(cwd, { recursive: true });
    await mkdir(path.dirname(referencePath), { recursive: true });
    await writeFile(referencePath, "video", "utf8");

    expect(resolveReferenceSource("song/reference.mp4", { projectRoot: root, cwd })).toEqual({
      kind: "file",
      original: "song/reference.mp4",
      absolutePath: referencePath,
    });
  });

  it("throws a structured error when a non-empty local reference is missing", async () => {
    const root = await scratchProject();
    const cwd = path.join(root, "shows", "demo");
    await mkdir(cwd, { recursive: true });

    expect(() => resolveReferenceSource("missing.mp4", { projectRoot: root, cwd })).toThrow(ReferenceSourceNotFoundError);
    try {
      resolveReferenceSource("missing.mp4", { projectRoot: root, cwd });
    } catch (error) {
      expect(error).toMatchObject({
        code: "reference_source_not_found",
        reference: "missing.mp4",
        candidates: [
          path.join(cwd, "missing.mp4"),
          path.join(root, "inputs", "missing.mp4"),
          path.join(root, "music_library", "missing.mp4"),
        ],
      });
    }
  });

  it("ignores empty reference values", async () => {
    const root = await scratchProject();

    expect(resolveReferenceSource(undefined, { projectRoot: root })).toBeUndefined();
    expect(resolveReferenceSource("  ", { projectRoot: root })).toBeUndefined();
  });
});

describe("analyzeReference", () => {
  it("runs the video_analyzer tool, persists the brief artifact, and emits a summary event", async () => {
    const root = await scratchProject();
    const show = "show";
    const episode = "episode";
    const sourcePath = path.join(root, "reference.mp4");
    const calls: string[] = [];
    await writeFile(sourcePath, "video", "utf8");

    const registry = new Registry({
      tools: [
        defineTool({
          name: "video_analyzer",
          capability: "video_analysis",
          provider: "predit",
          status: "beta",
          integration: { kind: "library", package: "predit", install: "pnpm add predit" },
          best_for: "test reference analysis",
          input: z.object({ path: z.string() }),
          output: VideoAnalysisBriefSchema,
          async execute(params) {
            calls.push(params.path);
            return brief;
          },
        }),
      ],
    });
    const output = captureIo();

    await expect(
      analyzeReference({
        source: { kind: "file", original: sourcePath, absolutePath: sourcePath },
        registry,
        projectRoot: root,
        show,
        episode,
        io: output.io,
        json: true,
        now: () => new Date("2026-05-12T15:42:00.000Z"),
      }),
    ).resolves.toEqual(brief);

    expect(calls).toEqual([sourcePath]);
    await expect(
      readFile(path.join(root, "projects", show, episode, "artifacts", "video_analysis_brief.json"), "utf8"),
    ).resolves.toBe(`${JSON.stringify(brief, null, 2)}\n`);
    expect(JSON.parse(output.stdout().trim())).toMatchObject({
      event: "reference_analysis",
      artifact: "video_analysis_brief",
      scene_count: 1,
      pacing_style: "fast_paced",
      promise_elements: ["match cut"],
      human_summary: {
        critical_questions: expect.arrayContaining([expect.stringContaining("narration")]),
        concept_directions: expect.arrayContaining([expect.stringContaining("Close-match")]),
      },
    });
  });

  it("prints a labeled conversational 5-aspect report for human runs", async () => {
    const root = await scratchProject();
    const show = "show";
    const episode = "episode";
    const sourcePath = path.join(root, "reference.mp4");
    await writeFile(sourcePath, "video", "utf8");

    const registry = registryWithBrief(brief);
    const output = captureIo();

    await analyzeReference({
      source: { kind: "file", original: sourcePath, absolutePath: sourcePath },
      registry,
      projectRoot: root,
      show,
      episode,
      io: output.io,
      json: false,
      now: () => new Date("2026-05-12T15:42:00.000Z"),
    });

    expect(output.stdout()).toContain("I've watched the reference. Here's what I see:");
    expect(output.stdout()).toContain("Content:");
    expect(output.stdout()).toContain("Style:");
    expect(output.stdout()).toContain("Structure:");
    expect(output.stdout()).toContain("Motion:");
    expect(output.stdout()).toContain("5-aspect breakdown (per shot or shot-group):");
    expect(output.stdout()).toContain("Critical questions before proposing:");
    expect(output.stdout()).toContain("Differentiated concept directions:");
  });
});

const brief: VideoAnalysisBrief = {
  pacing_style: "fast_paced",
  promise_elements: ["match cut"],
  scenes: [
    {
      scene_ref: "opening",
      subject: ["host"],
      subject_motion: ["walks toward camera"],
      scene: ["warehouse with titles"],
      spatial_framing: ["centered medium shot"],
      camera: ["handheld push"],
      motion_type: "motion_clip",
      flow_variance: 0.2,
    },
  ],
};

function registryWithBrief(result: VideoAnalysisBrief): Registry {
  return new Registry({
    tools: [
      defineTool({
        name: "video_analyzer",
        capability: "video_analysis",
        provider: "predit",
        status: "beta",
        integration: { kind: "library", package: "predit", install: "pnpm add predit" },
        best_for: "test reference analysis",
        input: z.object({ path: z.string() }),
        output: VideoAnalysisBriefSchema,
        async execute() {
          return result;
        },
      }),
    ],
  });
}

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-reference-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");
  return root;
}

function captureIo() {
  let stdout = "";
  let stderr = "";
  return {
    io: {
      stdout: {
        write(value: string) {
          stdout += value;
          return true;
        },
      },
      stderr: {
        write(value: string) {
          stderr += value;
          return true;
        },
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}
