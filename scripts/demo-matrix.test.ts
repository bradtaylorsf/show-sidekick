import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyShowTypeLaneStatus,
  discoverDemoMatrixLanes,
  discoverShowTypeMatrixLanes,
  parseDemoMatrixArgs,
  runDemoMatrix,
  type DemoMatrixLaneResult,
} from "./demo-matrix.ts";
import { parseLastEvent, type SpawnCommand, type SpawnResult } from "./lib/spawn-cli.ts";
import { verifyLane, type LaneVerification, type VerifyLaneInput } from "./lib/verify-render.ts";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describe("demo matrix runner", () => {
  it("parses mode and lane flags", () => {
    expect(parseDemoMatrixArgs(["--paid-demo", "--only", "news-song", "--only=music-video", "--keep-workdir", "--json"])).toEqual({
      mode: "paid-demo",
      only: ["news-song", "music-video"],
      keepWorkdir: true,
      json: true,
      cliPath: undefined,
      laneSource: "starters",
    });

    expect(parseDemoMatrixArgs(["--zero-key"]).mode).toBe("zero-key");
    expect(parseDemoMatrixArgs(["--from-show-types"]).laneSource).toBe("show-types");
    expect(() => parseDemoMatrixArgs(["--zero-key", "--paid-demo"])).toThrow("--zero-key and --paid-demo");
  });

  it("discovers only starters compatible with the selected sample mode", async () => {
    const paid = await discoverDemoMatrixLanes({
      repoRoot: process.cwd(),
      mode: "paid-demo",
      only: ["music-video", "news-song", "documentary"],
    });
    expect(paid.map((lane) => lane.slug)).toEqual(["music-video", "news-song"]);

    const zeroKey = await discoverDemoMatrixLanes({
      repoRoot: process.cwd(),
      mode: "zero-key",
    });
    expect(zeroKey.map((lane) => lane.slug)).toEqual(["animated-explainer", "music-video"]);
  });

  it("discovers runnable show-type catalog lanes by stable lane ID", async () => {
    const lanes = await discoverShowTypeMatrixLanes({
      repoRoot: process.cwd(),
      mode: "zero-key",
      only: ["pipeline:animated-explainer", "pipeline:animation"],
    });

    expect(lanes).toEqual([
      expect.objectContaining({
        slug: "pipeline:animated-explainer",
        laneId: "pipeline:animated-explainer",
        starterSlug: "animated-explainer",
        pipeline: "animated-explainer",
        target: "animated-explainer/sample-episode",
      }),
    ]);
  });

  it("classifies show-type matrix statuses for operator reports", () => {
    expect(classifyShowTypeLaneStatus({ selected: false, runnable: false })).toBe("not-run");
    expect(classifyShowTypeLaneStatus({ selected: true, runnable: false })).toBe("unsupported");
    expect(
      classifyShowTypeLaneStatus({
        selected: true,
        runnable: true,
        result: laneResult({
          status: "completed",
          verification: {
            export_results: [
              { target: "edl", status: "completed" },
              { target: "premiere", status: "completed" },
            ],
          },
        }),
      }),
    ).toBe("verified");
    expect(
      classifyShowTypeLaneStatus({
        selected: true,
        runnable: true,
        result: laneResult({
          status: "verification_failed",
          verification: {
            export_results: [{ target: "edl", status: "failed", error: "no timeline" }],
          },
        }),
      }),
    ).toBe("export-failed");
    expect(
      classifyShowTypeLaneStatus({
        selected: true,
        runnable: true,
        result: laneResult({ status: "failed", command: "node cli init --starter news-song", error: "OPENAI_API_KEY missing" }),
      }),
    ).toBe("setup-missing");
  });

  it("runs selected paid-demo lanes through init and build commands", async () => {
    const tempRoot = await testTempRoot();
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    const runCommand: SpawnCommand = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return successfulCommand(command, args, options.cwd);
    };
    const lines: string[] = [];

    const result = await runDemoMatrix({
      argv: ["--paid-demo", "--only", "news-song", "--keep-workdir", "--json"],
      tempRoot,
      runCommand,
      verifyLane: async (input) => passedVerification(input),
      env: { ...process.env, OPENAI_API_KEY: "set", ELEVENLABS_API_KEY: "set" },
      write: (line) => lines.push(line),
      now: () => new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("completed");
    expect(result.working_dir.startsWith(tempRoot)).toBe(true);
    expect(path.relative(process.cwd(), result.working_dir).startsWith("..")).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.command).toContain("--provider-profile paid-demo");
    expect(calls.some((call) => call.args.includes("init") && call.args.includes("--starter") && call.args.includes("news-song"))).toBe(true);
    expect(calls.some((call) => call.args.includes("build") && call.args.includes("news-song/sample-episode"))).toBe(true);

    const events = lines.flatMap((line) => line.trim().split("\n").filter(Boolean).map((entry) => JSON.parse(entry) as { event: string }));
    expect(events.map((event) => event.event)).toEqual(["matrix_started", "lane_completed", "matrix_finished"]);
  });

  it("summarizes failed lanes with command, exit code, last event, and artifacts", async () => {
    const tempRoot = await testTempRoot();
    const runCommand: SpawnCommand = async (command, args, options) => {
      if (args.includes("build")) {
        await writeArtifact(options.cwd, "music-video");
        return commandResult({
          command,
          args,
          cwd: options.cwd,
          exitCode: 1,
          stdout: `${JSON.stringify({ event: "build_finished", status: "failed", last_stage: "assets" })}\n`,
          stderr: "provider failed",
        });
      }
      return successfulCommand(command, args, options.cwd);
    };

    const result = await runDemoMatrix({
      argv: ["--zero-key", "--only", "music-video", "--keep-workdir"],
      tempRoot,
      runCommand,
      write: () => undefined,
    });

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("failed");
    expect(result.failure_count).toBe(1);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        slug: "music-video",
        exit_code: 1,
        status: "failed",
        error: "provider failed",
        last_event: expect.objectContaining({ event: "build_finished", status: "failed", last_stage: "assets" }),
      }),
    );
    expect(result.results[0]?.artifact_paths).toContain("projects/music-video/sample-episode/checkpoints/assets.failed.json");
  });

  it("fails verification when an expected artifact is missing", async () => {
    const root = await testTempRoot();
    await writeVerificationWorkspace(root, { omit: "render_report" });

    const verification = await verifyLane(verifyInput(root));

    expect(verification.status).toBe("failed");
    expect(verification.artifact_presence).toContainEqual(
      expect.objectContaining({
        artifact: "render_report",
        status: "missing",
      }),
    );
  });

  it("fails verification when ffprobe duration is outside the demo brief tolerance", async () => {
    const root = await testTempRoot();
    await writeVerificationWorkspace(root);

    const verification = await verifyLane(
      verifyInput(root, {
        probeDurationS: 13.9,
      }),
    );

    expect(verification.status).toBe("failed");
    expect(verification.ffprobe_probe).toMatchObject({
      status: "failed",
      actual_duration_s: 13.9,
    });
    expect(verification.errors.join("\n")).toContain("duration 13.900s is outside");
  });

  it("skips unsupported export targets while still running supported EDL export", async () => {
    const root = await testTempRoot();
    const exportCalls: string[] = [];
    await writeVerificationWorkspace(root, { supportedTargets: ["edl"] });

    const verification = await verifyLane(
      verifyInput(root, {
        runCommand: async (command, args, options) => {
          if (args.includes("export")) {
            exportCalls.push(args.join(" "));
          }
          return successfulCommand(command, args, options.cwd);
        },
      }),
    );

    expect(verification.status).toBe("passed");
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0]).toContain("--format edl");
    expect(verification.export_results).toContainEqual(
      expect.objectContaining({
        target: "premiere",
        status: "skipped_unsupported",
      }),
    );
    expect(verification.export_results).toContainEqual(
      expect.objectContaining({
        target: "edl",
        status: "completed",
      }),
    );
  });

  it("writes a combined verification report for completed matrix lanes", async () => {
    const tempRoot = await testTempRoot();
    const runCommand: SpawnCommand = async (command, args, options) => {
      if (args.includes("build")) {
        await writeVerificationWorkspace(options.cwd);
        return successfulCommand(command, args, options.cwd);
      }

      return successfulCommand(command, args, options.cwd);
    };

    const result = await runDemoMatrix({
      argv: ["--zero-key", "--only", "music-video", "--keep-workdir"],
      tempRoot,
      runCommand,
      verifyLane: async (input) =>
        verifyLane({
          ...input,
          probeMedia: async () => probeResult(),
          runFfmpeg: fakeFfmpeg,
        }),
      write: () => undefined,
      now: () => new Date("2026-05-15T12:00:00.000Z"),
    });

    const report = JSON.parse(await readFile(result.verification_report_path, "utf8")) as {
      event: string;
      status: string;
      summary: { total_lanes: number; passed: number; failed: number };
      lanes: Array<{ slug: string; status: string; frame_summary?: { contact_sheet_path?: string } }>;
    };

    expect(result.status).toBe("completed");
    expect(result.results[0]?.verification?.status).toBe("passed");
    expect(report).toMatchObject({
      event: "demo_matrix_verification",
      status: "passed",
      summary: {
        total_lanes: 1,
        passed: 1,
        failed: 0,
      },
      lanes: [
        {
          slug: "music-video",
          status: "passed",
        },
      ],
    });
    expect(report.lanes[0]?.frame_summary?.contact_sheet_path).toBe("projects/music-video/sample-episode/verification/contact-sheet.png");
  });
});

async function testTempRoot(): Promise<string> {
  const dir = path.join(tmpdir(), `predit-demo-matrix-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  scratchDirs.push(dir);
  return dir;
}

function successfulCommand(command: string, args: readonly string[], cwd: string): SpawnResult {
  if (args.includes("--version")) {
    return commandResult({ command, args, cwd, stdout: "0.0.0\n" });
  }
  if (command === "which") {
    const binary = args[0] ?? "binary";
    return commandResult({ command, args, cwd, stdout: `/usr/local/bin/${binary}\n` });
  }
  if (args.includes("init")) {
    return commandResult({ command, args, cwd, stdout: `${JSON.stringify({ event: "project_initialized" })}\n` });
  }
  if (args.includes("build")) {
    return commandResult({
      command,
      args,
      cwd,
      stdout: `${JSON.stringify({ event: "build_started" })}\n${JSON.stringify({ event: "build_finished", status: "completed", total_cost_usd: 0.12 })}\n`,
    });
  }
  if (args.includes("export")) {
    const target = args.includes("--format") ? "edl" : args[args.indexOf("--target") + 1] ?? "premiere";
    return commandResult({
      command,
      args,
      cwd,
      stdout: `${JSON.stringify({
        event: "exported",
        target,
        package_path: path.join(cwd, "exports", `music-video__sample-episode.${target}`),
        timeline_path: path.join(cwd, "exports", `music-video__sample-episode.${target}`, target === "edl" ? "timeline.edl" : "timeline.xml"),
      })}\n`,
    });
  }

  return commandResult({ command, args, cwd });
}

function commandResult(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}): SpawnResult {
  const stdout = input.stdout ?? "";
  return {
    command: input.command,
    args: [...input.args],
    cwd: input.cwd,
    exitCode: input.exitCode ?? 0,
    signal: null,
    stdout,
    stderr: input.stderr ?? "",
    timedOut: false,
    lastEvent: parseLastEvent(stdout),
  };
}

async function writeArtifact(cwd: string, showSlug: string): Promise<void> {
  const checkpointDir = path.join(cwd, "projects", showSlug, "sample-episode", "checkpoints");
  await mkdir(checkpointDir, { recursive: true });
  await writeFile(path.join(checkpointDir, "assets.failed.json"), "{}\n");
}

function passedVerification(input: VerifyLaneInput): LaneVerification {
  return {
    status: "passed",
    slug: input.slug,
    pipeline: input.pipeline,
    target: input.target,
    project_dir: input.projectDir,
    generated_at: "2026-05-15T12:00:00.000Z",
    artifact_presence: [],
    export_results: [],
    errors: [],
  };
}

function laneResult(input: {
  readonly status: string;
  readonly command?: string;
  readonly error?: string;
  readonly verification?: Partial<LaneVerification>;
}): DemoMatrixLaneResult {
  return {
    slug: "pipeline:animated-explainer",
    pipeline: "animated-explainer",
    target: "animated-explainer/sample-episode",
    project_dir: "/tmp/show-types",
    command: input.command ?? "node cli build animated-explainer/sample-episode",
    exit_code: input.status === "completed" ? 0 : 1,
    status: input.status,
    artifact_paths: [],
    duration_ms: 1,
    error: input.error,
    verification:
      input.verification === undefined
        ? undefined
        : ({
            status: "failed",
            slug: "pipeline:animated-explainer",
            pipeline: "animated-explainer",
            target: "animated-explainer/sample-episode",
            project_dir: "/tmp/show-types",
            generated_at: "2026-05-15T12:00:00.000Z",
            artifact_presence: [],
            export_results: [],
            errors: [],
            ...input.verification,
          } satisfies LaneVerification),
  };
}

function verifyInput(
  root: string,
  options: {
    readonly probeDurationS?: number;
    readonly runCommand?: SpawnCommand;
  } = {},
): VerifyLaneInput {
  return {
    slug: "music-video",
    showSlug: "music-video",
    pipeline: "music-video",
    target: "music-video/sample-episode",
    projectDir: root,
    cli: { command: "predit", baseArgs: [] },
    runCommand: options.runCommand ?? (async (command, args, callOptions) => successfulCommand(command, args, callOptions.cwd)),
    now: () => new Date("2026-05-15T12:00:00.000Z"),
    probeMedia: async () => probeResult(options.probeDurationS),
    runFfmpeg: fakeFfmpeg,
  };
}

async function fakeFfmpeg(args: readonly string[]): Promise<void> {
  const outputPath = args.at(-1);
  if (outputPath === undefined) {
    throw new Error("missing ffmpeg output path");
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, "png", "utf8");
}

function probeResult(durationS = 15) {
  return {
    format: {
      duration_s: durationS,
      bit_rate: 2_500_000,
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
    },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 1920,
        height: 1080,
        frame_rate: 30,
      },
      {
        codec_type: "audio",
        codec_name: "aac",
        sample_rate: 48_000,
        channels: 2,
      },
    ],
  };
}

async function writeVerificationWorkspace(
  root: string,
  options: {
    readonly omit?: string;
    readonly supportedTargets?: readonly string[];
  } = {},
): Promise<void> {
  const showDir = path.join(root, "shows", "music-video");
  const episodeDir = path.join(showDir, "episodes");
  const pipelineDir = path.join(root, ".predit", "pipelines");
  const projectDir = path.join(root, "projects", "music-video", "sample-episode");
  await mkdir(episodeDir, { recursive: true });
  await mkdir(pipelineDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      "slug: music-video",
      "display_name: Music Video",
      "pipelines:",
      "  music-video:",
      "    aspect: 16:9",
      "defaults:",
      "  pipeline: music-video",
      "starter:",
      "  expected_sample_duration_s: 15",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(episodeDir, "sample-episode.yaml"),
    ["slug: sample-episode", "pipeline: music-video", "aspect: 16:9", ""].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(pipelineDir, "music-video.yaml"),
    [
      "slug: music-video",
      "sample_support: both",
      "master_clock: audio",
      "sample:",
      "  duration_s_min: 15",
      "  duration_s_max: 20",
      "export:",
      `  supported_targets: [${(options.supportedTargets ?? ["premiere", "edl"]).join(", ")}]`,
      "  default_target: premiere",
      "stages:",
      "  - slug: cuesheet",
      "    skill: pipelines/music-video/cuesheet.md",
      "    produces: cuesheet",
      "  - slug: assets",
      "    skill: pipelines/music-video/assets.md",
      "    produces: asset_manifest",
      "  - slug: edit",
      "    skill: pipelines/music-video/edit.md",
      "    produces: edit_decisions",
      "  - slug: compose",
      "    skill: pipelines/music-video/compose.md",
      "    produces: render_report",
      "",
    ].join("\n"),
    "utf8",
  );

  const writes: Record<string, unknown> = {
    cuesheet: {
      audio: { path: "media/track.wav", duration_s: 15, sample_rate: 48000, channels: 2 },
      master_clock: "audio",
      segments: [{ start_s: 0, end_s: 15, text: "sample", words: [] }],
      sections: [{ label: "sample", start_s: 0, end_s: 15, kind: "vocal", energy: 0.8 }],
      beats: [],
      climax: [],
      scene_anchors: [],
    },
    asset_manifest: {
      assets: [{ id: "hero", kind: "video", path: "media/hero.mp4" }],
    },
    edit_decisions: {
      cuts: [{ start_s: 0, end_s: 15, asset_id: "hero" }],
      overlays: [],
      audio: { music: { track_path: "media/track.wav" } },
      render_runtime: "ffmpeg",
      renderer_family: "animation-first",
    },
    render_report: {
      output_path: "projects/music-video/sample-episode/renders/render.mp4",
      encoding_profile: "h264-aac",
      duration_s: 15,
      resolution: { width: 1920, height: 1080 },
      framerate: 30,
      runtime_used: "ffmpeg",
      asset_count: 1,
      warnings: [],
      validation_steps: [],
    },
    cost_log: [{ tool: "ffmpeg", provider: "ffmpeg", model: "ffmpeg", units: 1, usd: 0, mode: "sample" }],
    decisions: [
      {
        id: "decision-1",
        stage: "compose",
        timestamp: "2026-05-15T12:00:00.000Z",
        category: "render_runtime_selection",
        options_considered: [
          { label: "ffmpeg", rejected_because: null },
          { label: "remotion", rejected_because: "Not needed for this fixture." },
        ],
        picked: "ffmpeg",
        reason: "Use ffmpeg for the verification fixture.",
        confidence: 0.9,
        user_visible: true,
        supersedes: null,
      },
    ],
  };

  for (const [name, value] of Object.entries(writes)) {
    if (options.omit === name) {
      continue;
    }
    const fileName = name === "decisions" ? "decisions.json" : `${name}.json`;
    await writeFile(path.join(projectDir, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}
