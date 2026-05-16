import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPublishLog } from "../artifacts/index.js";
import { PipelineManifestSchema, type Pipeline } from "../pipelines/index.js";
import type { LoadedShow } from "../shows/index.js";
import { createProgram } from "../cli/program.js";
import { exportCapcut } from "./capcut.js";
import { buildEdl, exportEdl } from "./edl.js";
import { buildFcp7Xml } from "./fcp7-xml.js";
import { linkAsset } from "./asset-linkage.js";
import { assembleExportPackage } from "./package.js";
import { MissingArtifactError, loadExportArtifacts } from "./load-artifacts.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("loadExportArtifacts", () => {
  it("loads and validates the four export source artifacts", async () => {
    const root = await scratchProject();
    await writeExportWorkspace(root);

    const artifacts = await loadExportArtifacts(root, "show", "episode");

    expect(artifacts.editDecisions.cuts).toHaveLength(2);
    expect(artifacts.cuesheet.audio.path).toBe("media/narration.wav");
    expect(artifacts.assetManifest.assets.map((asset) => asset.id)).toEqual(["hero", "chart"]);
    expect(artifacts.renderReport.framerate).toBe(30);
  });

  it("throws a typed missing artifact error naming the path", async () => {
    const root = await scratchProject();
    await writeExportWorkspace(root, { omit: "render_report" });

    await expect(loadExportArtifacts(root, "show", "episode")).rejects.toMatchObject({
      name: "MissingArtifactError",
      artifact: "render_report",
      filePath: path.join(root, "projects", "show", "episode", "render_report.json"),
    } satisfies Partial<MissingArtifactError>);
  });

  it("rejects edit decisions whose cuts run backward", async () => {
    const root = await scratchProject();
    await writeExportWorkspace(root, {
      editDecisions: {
        ...editDecisions(),
        cuts: [{ start_s: 3, end_s: 2, asset_id: "hero" }],
      },
    });

    await expect(loadExportArtifacts(root, "show", "episode")).rejects.toThrow(
      "cut end_s must be greater than start_s",
    );
  });
});

describe("linkAsset", () => {
  it("supports copy, symlink, and reference linkage modes", async () => {
    const root = await scratchProject();
    const source = path.join(root, "media", "source.txt");
    await mkdir(path.dirname(source), { recursive: true });
    await writeFile(source, "asset", "utf8");

    const copied = await linkAsset(source, path.join(root, "copy", "source.txt"), "copy");
    expect(await readFile(copied, "utf8")).toBe("asset");

    const symlinked = await linkAsset(source, path.join(root, "symlink", "source.txt"), "symlink");
    expect((await lstat(symlinked)).isSymbolicLink()).toBe(true);
    expect(await realpath(symlinked)).toBe(await realpath(source));

    const referenced = await linkAsset(source, path.join(root, "reference", "source.txt"), "reference");
    expect(referenced).toBe(source);
    expect(existsSync(path.join(root, "reference", "source.txt"))).toBe(false);
  });
});

describe("buildFcp7Xml", () => {
  it("builds deterministic FCP7 XML with cut and audio references", () => {
    const root = "/project";
    const xml = buildFcp7Xml({
      projectName: "show/episode",
      editDecisions: editDecisions(),
      cuesheet: cuesheet(),
      renderReport: renderReport(),
      assets: [
        { id: "hero", kind: "video", path: "media/hero clip.mov", linked_path: path.join(root, "assets", "01_hero clip.mov") },
        { id: "chart", kind: "image", path: "media/chart.png", linked_path: path.join(root, "assets", "02_chart.png") },
      ],
      audioTracks: [
        {
          id: "cuesheet-audio",
          name: "cuesheet-audio",
          linked_path: path.join(root, "assets", "audio_01_narration.wav"),
          duration_s: 4,
          sample_rate: 48000,
          channels: 2,
        },
      ],
    });

    expect(xml).toContain('<xmeml version="5">');
    expect(xml).toContain('<clipitem id="clipitem-1">');
    expect(xml).toContain("<start>60</start>");
    expect(xml).toContain("<end>120</end>");
    expect(xml).toContain("<comments>ANCHOR: lyric:line-2");
    expect(xml).toContain("file://localhost/project/assets/01_hero%20clip.mov");
    expect(xml).toContain('<clipitem id="audio-clipitem-1">');
  });
});

describe("exportCapcut", () => {
  it("writes a draft with materials, cut segments, audio, and captions", async () => {
    const root = await scratchProject();
    const packageDir = path.join(root, "capcut-package");

    const result = await exportCapcut({
      packageDir,
      projectName: "show/episode",
      editDecisions: {
        ...editDecisions(),
        cuts: [
          {
            start_s: 2,
            end_s: 4,
            timing_anchor: "line-2",
            timing_source: "lyric",
            timing_ref: { lyric_line_id: "line-2" },
            asset_id: "chart",
          },
          {
            start_s: 0,
            end_s: 2,
            timing_anchor: "line-1",
            timing_source: "lyric",
            timing_ref: { lyric_line_id: "line-1" },
            asset_id: "hero",
          },
        ],
      },
      cuesheet: cuesheet(),
      renderReport: renderReport(),
      assets: linkedTimelineAssets(root),
      audioTracks: linkedAudioTracks(root),
    });

    const draft = JSON.parse(await readFile(result.timelinePath, "utf8")) as {
      materials: {
        videos: Array<Record<string, unknown>>;
        images: Array<Record<string, unknown>>;
        audios: Array<Record<string, unknown>>;
        captions: Array<Record<string, unknown>>;
      };
      tracks: Array<{ type: string; segments: Array<Record<string, unknown>> }>;
    };
    const videoTrack = draft.tracks.find((track) => track.type === "video");
    const captionTrack = draft.tracks.find((track) => track.type === "text");

    expect(path.basename(result.timelinePath)).toBe("draft.json");
    expect(draft.materials.videos[0]).toMatchObject({
      id: "asset-hero",
      path: path.join(root, "assets", "01_hero_clip.mov"),
    });
    expect(draft.materials.images[0]).toMatchObject({
      id: "asset-chart",
      path: path.join(root, "assets", "02_chart.png"),
    });
    expect(draft.materials.audios.map((material) => material.name)).toEqual(["cuesheet-audio"]);
    expect(videoTrack?.segments.map((segment) => segment.material_id)).toEqual(["asset-hero", "asset-chart"]);
    expect(videoTrack?.segments[0]).toMatchObject({
      source_timerange_us: { start_us: 0, duration_us: 2_000_000 },
      target_timerange_us: { start_us: 0, duration_us: 2_000_000 },
      notes: expect.stringContaining("ANCHOR: lyric:line-1"),
    });
    expect(captionTrack?.segments.map((segment) => segment.text)).toEqual(["Hello", "world"]);
    expect(draft.materials.captions.map((material) => material.text)).toEqual(["Hello", "world"]);
    expect(await readFile(result.readmePath, "utf8")).toContain("CapCut Draft");
  });
});

describe("buildEdl", () => {
  it.each([
    {
      framerate: 24,
      fcm: "FCM: NON-DROP FRAME",
      expectedStart: "00:00:00:00",
      expectedOut: "00:00:01:12",
    },
    {
      framerate: 30,
      fcm: "FCM: NON-DROP FRAME",
      expectedStart: "00:00:00:00",
      expectedOut: "00:00:01:15",
    },
    {
      framerate: 23.976,
      fcm: "FCM: NON-DROP FRAME",
      expectedStart: "00:00:00:00",
      expectedOut: "00:00:01:12",
    },
    {
      framerate: 29.97,
      fcm: "FCM: DROP FRAME",
      expectedStart: "00:00:00;00",
      expectedOut: "00:00:01;15",
    },
  ])("builds CMX 3600 SMPTE timecode at $framerate fps", ({ framerate, fcm, expectedStart, expectedOut }) => {
    const root = "/project";
    const edl = buildEdl({
      packageDir: root,
      projectName: "show/episode",
      editDecisions: {
        ...editDecisions(),
        cuts: [
          {
            start_s: 0,
            end_s: 1.5,
            timing_anchor: "line-1",
            timing_source: "lyric",
            timing_ref: { lyric_line_id: "line-1" },
            asset_id: "hero",
          },
        ],
      },
      cuesheet: cuesheet(),
      renderReport: { ...renderReport(), duration_s: 1.5, framerate },
      assets: linkedTimelineAssets(root),
      audioTracks: linkedAudioTracks(root),
    });

    expect(edl).toContain("TITLE: show/episode");
    expect(edl).toContain(fcm);
    expect(edl).toMatch(
      new RegExp(`001\\s+AX001\\s+V\\s+C\\s+${expectedStart}\\s+${expectedOut}\\s+${expectedStart}\\s+${expectedOut}`),
    );
    expect(edl).toContain("* ANCHOR: lyric:line-1");
    expect(edl).toMatch(/002\s+AX002\s+A\s+C/);
  });
});

describe("exportEdl", () => {
  it("writes timeline.edl and a CMX 3600 README", async () => {
    const root = await scratchProject();
    const result = await exportEdl({
      packageDir: path.join(root, "edl-package"),
      projectName: "show/episode",
      editDecisions: editDecisions(),
      cuesheet: cuesheet(),
      renderReport: renderReport(),
      assets: linkedTimelineAssets(root),
      audioTracks: linkedAudioTracks(root),
    });

    expect(path.basename(result.timelinePath)).toBe("timeline.edl");
    expect(await readFile(result.timelinePath, "utf8")).toContain("FCM: NON-DROP FRAME");
    expect(await readFile(result.readmePath, "utf8")).toContain("CMX 3600");
  });
});

describe("assembleExportPackage", () => {
  it.each(["copy", "symlink", "reference"] as const)("assembles a %s Premiere export package", async (mode) => {
    const root = await scratchProject();
    await writeExportWorkspace(root);

    const result = await assembleExportPackage({
      projectRoot: root,
      show: loadedShow(root),
      showSlug: "show",
      episodeSlug: "episode",
      pipeline: pipeline(),
      target: "premiere",
      assetLinkMode: mode,
      now: new Date("2026-05-14T12:00:00.000Z"),
    });

    expect(await readFile(result.timelinePath, "utf8")).toContain('<xmeml version="5">');
    expect(await readFile(result.captionsPath, "utf8")).toContain('"text": "Hello"');
    expect(result.publishLog.metadata).toMatchObject({
      exported_at: "2026-05-14T12:00:00.000Z",
      target: "premiere",
      asset_link_mode: mode,
    });

    const assetEntries = await readdir(path.join(result.packageDir, "assets"));
    if (mode === "reference") {
      expect(assetEntries).toEqual([]);
    } else {
      expect(assetEntries).toEqual(expect.arrayContaining(["01_hero_clip.mov", "02_chart.png", "audio_01_narration.wav"]));
    }
  });

  it("uses DaVinci-specific package naming and README copy", async () => {
    const root = await scratchProject();
    await writeExportWorkspace(root);

    const result = await assembleExportPackage({
      projectRoot: root,
      show: loadedShow(root),
      showSlug: "show",
      episodeSlug: "episode",
      pipeline: pipeline(),
      target: "davinci",
      assetLinkMode: "copy",
    });

    expect(path.basename(result.packageDir)).toBe("show__episode.davinci");
    expect(await readFile(result.readmePath, "utf8")).toContain("DaVinci Resolve");
  });

  it.each([
    { target: "capcut", timelineName: "draft.json", outputKind: "capcut_draft" },
    { target: "edl", timelineName: "timeline.edl", outputKind: "edl" },
  ])("assembles a $target export package", async ({ target, timelineName, outputKind }) => {
    const root = await scratchProject();
    await writeExportWorkspace(root);

    const result = await assembleExportPackage({
      projectRoot: root,
      show: loadedShow(root),
      showSlug: "show",
      episodeSlug: "episode",
      pipeline: pipeline({ supportedTargets: ["premiere", "davinci", "capcut", "edl"] }),
      target,
      assetLinkMode: "copy",
      now: new Date("2026-05-14T12:00:00.000Z"),
    });

    expect(path.basename(result.packageDir)).toBe(`show__episode.${target}`);
    expect(path.basename(result.timelinePath)).toBe(timelineName);
    expect(result.publishLog.outputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: result.timelinePath,
          kind: outputKind,
          platform: target,
        }),
      ]),
    );
    expect(result.publishLog.metadata).toMatchObject({
      exported_at: "2026-05-14T12:00:00.000Z",
      target,
      asset_link_mode: "copy",
    });
    if (target === "edl") {
      const edl = await readFile(result.timelinePath, "utf8");
      expect(edl).toMatch(/003\s+AX003\s+A\s+C/);
      expect(edl).toMatch(/004\s+AX004\s+A\s+C/);
    }
  });

  it("rejects targets not declared by the selected pipeline", async () => {
    const root = await scratchProject();
    await writeExportWorkspace(root);

    await expect(
      assembleExportPackage({
        projectRoot: root,
        show: loadedShow(root),
        showSlug: "show",
        episodeSlug: "episode",
        pipeline: pipeline({ supportedTargets: ["premiere"] }),
        target: "davinci",
      }),
    ).rejects.toThrow("does not support export target 'davinci'");
  });

  it("refuses to overwrite an existing package unless overwrite is explicit", async () => {
    const root = await scratchProject();
    await writeExportWorkspace(root);
    const packageDir = path.join(root, "exports", "show__episode.premiere");
    await mkdir(packageDir, { recursive: true });
    await writeFile(path.join(packageDir, "editor-note.txt"), "keep\n", "utf8");

    await expect(
      assembleExportPackage({
        projectRoot: root,
        show: loadedShow(root),
        showSlug: "show",
        episodeSlug: "episode",
        pipeline: pipeline(),
        target: "premiere",
      }),
    ).rejects.toThrow("pass --overwrite to replace it");
    await expect(readFile(path.join(packageDir, "editor-note.txt"), "utf8")).resolves.toBe("keep\n");

    await expect(
      assembleExportPackage({
        projectRoot: root,
        show: loadedShow(root),
        showSlug: "show",
        episodeSlug: "episode",
        pipeline: pipeline(),
        target: "premiere",
        overwrite: true,
      }),
    ).resolves.toMatchObject({ target: "premiere" });
  });
});

describe("predit export", () => {
  it("writes an export package and publish_log.json through the CLI", async () => {
    const root = await scratchProject();
    await writeProjectFiles(root);
    await writeExportWorkspace(root);
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(
      [
        "node",
        "predit",
        "--json",
        "export",
        "show/episode",
        "--target",
        "premiere",
        "--asset-link-mode",
        "reference",
        "--out",
        "handoffs",
      ],
      { from: "node" },
    );

    const event = JSON.parse(output().stdout.trim()) as Record<string, unknown>;
    const publishLog = await readPublishLog(root, "show", "episode");
    const resolvedRoot = await realpath(root);
    const expectedPackagePath = path.join(resolvedRoot, "handoffs", "show__episode.premiere");

    expect(event).toMatchObject({
      event: "exported",
      show: "show",
      episode: "episode",
      target: "premiere",
      asset_link_mode: "reference",
    });
    expect(event.package_path).toBe(expectedPackagePath);
    expect(publishLog.metadata).toMatchObject({
      target: "premiere",
      asset_link_mode: "reference",
      package_path: expectedPackagePath,
    });
    expect(existsSync(path.join(expectedPackagePath, "timeline.xml"))).toBe(true);
  });

  it("accepts --target capcut through the CLI", async () => {
    const root = await scratchProject();
    await writeProjectFiles(root);
    await writeExportWorkspace(root);
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "export", "show/episode", "--target", "capcut", "--out", "handoffs"], {
      from: "node",
    });

    const event = JSON.parse(output().stdout.trim()) as Record<string, unknown>;
    const resolvedRoot = await realpath(root);
    const expectedPackagePath = path.join(resolvedRoot, "handoffs", "show__episode.capcut");

    expect(event).toMatchObject({
      event: "exported",
      target: "capcut",
    });
    expect(event.package_path).toBe(expectedPackagePath);
    expect(existsSync(path.join(expectedPackagePath, "draft.json"))).toBe(true);
  });

  it("accepts --format edl through the CLI", async () => {
    const root = await scratchProject();
    await writeProjectFiles(root);
    await writeExportWorkspace(root);
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "export", "show/episode", "--format", "edl", "--out", "handoffs"], {
      from: "node",
    });

    const event = JSON.parse(output().stdout.trim()) as Record<string, unknown>;
    const resolvedRoot = await realpath(root);
    const expectedPackagePath = path.join(resolvedRoot, "handoffs", "show__episode.edl");

    expect(event).toMatchObject({
      event: "exported",
      target: "edl",
    });
    expect(event.package_path).toBe(expectedPackagePath);
    expect(existsSync(path.join(expectedPackagePath, "timeline.edl"))).toBe(true);
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-export-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeProjectFiles(root: string): Promise<void> {
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await mkdir(path.join(root, "shows", "show", "episodes"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writeFile(
    path.join(root, ".predit", "pipelines", "xml-pipe.yaml"),
    [
      "slug: xml-pipe",
      "export:",
      "  supported_targets: [premiere, davinci, capcut, edl]",
      "  default_target: premiere",
      "stages:",
      "  - slug: edit",
      "    skill: pipelines/xml/edit-director.md",
      "    produces: edit_decisions",
      "    human_approval: never",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(root, "shows", "show", "show.yaml"),
    [
      "slug: show",
      'display_name: "Show"',
      "created: 2026-05-14",
      "pipelines:",
      "  xml-pipe: {}",
      "defaults:",
      "  pipeline: xml-pipe",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(root, "shows", "show", "episodes", "episode.yaml"),
    ["slug: episode", 'title: "Episode"', "created: 2026-05-14", "pipeline: xml-pipe", ""].join("\n"),
    "utf8",
  );
}

async function writeExportWorkspace(root: string, options: { omit?: string; editDecisions?: unknown } = {}): Promise<void> {
  const projectDir = path.join(root, "projects", "show", "episode");
  const mediaDir = path.join(root, "media");
  await mkdir(projectDir, { recursive: true });
  await mkdir(mediaDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(mediaDir, "hero clip.mov"), "hero", "utf8"),
    writeFile(path.join(mediaDir, "chart.png"), "chart", "utf8"),
    writeFile(path.join(mediaDir, "narration.wav"), "voice", "utf8"),
    writeFile(path.join(mediaDir, "music.mp3"), "music", "utf8"),
    writeFile(path.join(mediaDir, "render.mp4"), "render", "utf8"),
  ]);

  const files: Record<string, unknown> = {
    edit_decisions: options.editDecisions ?? editDecisions(),
    cuesheet: cuesheet(),
    asset_manifest: assetManifest(),
    render_report: renderReport(),
  };

  for (const [name, value] of Object.entries(files)) {
    if (options.omit === name) {
      continue;
    }

    await writeFile(path.join(projectDir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

function assetManifest() {
  return {
    assets: [
      { id: "hero", kind: "video", path: "media/hero clip.mov" },
      { id: "chart", kind: "image", path: "media/chart.png" },
    ],
  };
}

function linkedTimelineAssets(root: string) {
  return [
    { id: "hero", kind: "video", path: "media/hero clip.mov", linked_path: path.join(root, "assets", "01_hero_clip.mov") },
    { id: "chart", kind: "image", path: "media/chart.png", linked_path: path.join(root, "assets", "02_chart.png") },
  ];
}

function linkedAudioTracks(root: string) {
  return [
    {
      id: "cuesheet-audio",
      name: "cuesheet-audio",
      linked_path: path.join(root, "assets", "audio_01_narration.wav"),
      duration_s: 4,
      sample_rate: 48000,
      channels: 2,
    },
  ];
}

function editDecisions() {
  return {
    cuts: [
      {
        start_s: 0,
        end_s: 2,
        start_ms: 0,
        end_ms: 2000,
        timing_anchor: "line-1",
        timing_source: "lyric",
        timing_ref: { lyric_line_id: "line-1", word_id: "w-1", beat_index: 0 },
        asset_id: "hero",
      },
      {
        start_s: 2,
        end_s: 4,
        start_ms: 2000,
        end_ms: 4000,
        timing_anchor: "line-2",
        timing_source: "lyric",
        timing_ref: { lyric_line_id: "line-2", beat_index: 1 },
        asset_id: "chart",
      },
    ],
    overlays: [],
    audio: {
      music: {
        track_path: "media/music.mp3",
      },
    },
    render_runtime: "remotion",
    renderer_family: "explainer-data",
  };
}

function cuesheet() {
  return {
    audio: {
      path: "media/narration.wav",
      duration_s: 4,
      sample_rate: 48000,
      channels: 2,
    },
    master_clock: "voiceover",
    words: [
      { text: "Hello", start_s: 0, end_s: 0.5, confidence: 0.99 },
      { text: "world", start_s: 0.5, end_s: 1, confidence: 0.98 },
    ],
    segments: [
      {
        start_s: 0,
        end_s: 1,
        text: "Hello world",
        words: [
          { text: "Hello", start_s: 0, end_s: 0.5, confidence: 0.99 },
          { text: "world", start_s: 0.5, end_s: 1, confidence: 0.98 },
        ],
      },
    ],
    sections: [{ label: "intro", start_s: 0, end_s: 4, kind: "vocal", energy: 0.7 }],
    beats: [{ time_s: 0, strength: 1, is_downbeat: true }],
    climax: [],
    scene_anchors: [],
  };
}

function renderReport() {
  return {
    output_path: "media/render.mp4",
    encoding_profile: "h264-aac",
    duration_s: 4,
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    runtime_used: "remotion",
    asset_count: 2,
    warnings: [],
    validation_steps: [],
  };
}

function pipeline(options: { supportedTargets?: string[] } = {}): Pipeline {
  return PipelineManifestSchema.parse({
    slug: "xml-pipe",
    export: {
      supported_targets: options.supportedTargets ?? ["premiere", "davinci"],
      default_target: "premiere",
    },
    stages: [
      {
        slug: "edit",
        skill: "pipelines/xml/edit-director.md",
        produces: "edit_decisions",
      },
    ],
  });
}

function loadedShow(root: string): LoadedShow {
  return {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-14T00:00:00.000Z"),
    pipelines: { "xml-pipe": {} },
    defaults: { pipeline: "xml-pipe" },
    projectRoot: root,
    rootDir: path.join(root, "shows", "show"),
  };
}

function captureProgram() {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
    stdout: {
      write: (value: string) => {
        stdout += value;
        return true;
      },
    },
    stderr: {
      write: (value: string) => {
        stderr += value;
        return true;
      },
    },
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}
