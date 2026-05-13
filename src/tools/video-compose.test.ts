import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AssetManifest,
  type DecisionLog,
  type EditDecisions,
  RenderReportSchema,
  type RenderRuntime,
} from "../artifacts/index.js";
import { ComposeBlockerError } from "../compose/blocker.js";
import { defineTool, Registry, type Availability, type ToolContext } from "../registry/index.js";
import videoCompose, { type VideoComposeInput } from "./video-compose.js";

let tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("video_compose tool", () => {
  it("routes to the selected runtime and records passed pre-compose validation", async () => {
    const fixture = await fixtureInput();
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({ tools: [runtimeTool("ffmpeg", { execute })] });

    const result = await videoCompose.execute(fixture.input, testContext(fixture.projectRoot, registry));

    expect(execute).toHaveBeenCalledOnce();
    expect(result.runtime_used).toBe("ffmpeg");
    expect(result.warnings).toContain("pre_compose_validation: passed");
  });

  it("blocks unlogged proposal-to-edit runtime changes before invoking the runtime", async () => {
    const fixture = await fixtureInput({ proposalRuntime: "remotion" });
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({ tools: [runtimeTool("ffmpeg", { execute })] });

    await expect(videoCompose.execute(fixture.input, testContext(fixture.projectRoot, registry))).rejects.toMatchObject({
      blocker: expect.objectContaining({ type: "pre_compose_failed" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks runtime overrides that are not logged as supersessions", async () => {
    const fixture = await fixtureInput();
    const execute = vi.fn(async () => renderReport("remotion"));
    const registry = new Registry({ tools: [runtimeTool("remotion", { execute })] });

    await expect(
      videoCompose.execute(
        {
          ...fixture.input,
          runtime_override: "remotion",
        },
        testContext(fixture.projectRoot, registry),
      ),
    ).rejects.toMatchObject({
      blocker: expect.objectContaining({ type: "runtime_swap_unlogged" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks missing assets before invoking the runtime", async () => {
    const fixture = await fixtureInput({ missingAsset: true });
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({ tools: [runtimeTool("ffmpeg", { execute })] });

    await expect(videoCompose.execute(fixture.input, testContext(fixture.projectRoot, registry))).rejects.toBeInstanceOf(
      ComposeBlockerError,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks cut gaps before invoking the runtime", async () => {
    const fixture = await fixtureInput({
      cuts: [
        { start_s: 0, end_s: 1, asset_id: "hero" },
        { start_s: 2, end_s: 3, asset_id: "hero" },
      ],
    });
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({ tools: [runtimeTool("ffmpeg", { execute })] });

    await expect(videoCompose.execute(fixture.input, testContext(fixture.projectRoot, registry))).rejects.toMatchObject({
      blocker: expect.objectContaining({
        type: "pre_compose_failed",
        findings: expect.arrayContaining([expect.objectContaining({ check: "cut_coverage" })]),
      }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks motion-led promises below the motion ratio floor before invoking the runtime", async () => {
    const fixture = await fixtureInput({ motionLed: true, assetKind: "image" });
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({ tools: [runtimeTool("ffmpeg", { execute })] });

    await expect(videoCompose.execute(fixture.input, testContext(fixture.projectRoot, registry))).rejects.toMatchObject({
      blocker: expect.objectContaining({
        type: "pre_compose_failed",
        findings: expect.arrayContaining([expect.objectContaining({ check: "delivery_promise" })]),
      }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("blocks unavailable runtimes before invoking the runtime", async () => {
    const fixture = await fixtureInput();
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({
      tools: [
        runtimeTool("ffmpeg", {
          availability: { available: false, reason: "binary not on PATH: ffmpeg", fix: "install" },
          execute,
        }),
      ],
    });

    await expect(videoCompose.execute(fixture.input, testContext(fixture.projectRoot, registry))).rejects.toMatchObject({
      blocker: expect.objectContaining({ type: "runtime_unavailable" }),
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("records bypassed validation when the context explicitly bypasses failures", async () => {
    const fixture = await fixtureInput({ missingAsset: true });
    const execute = vi.fn(async () => renderReport("ffmpeg"));
    const registry = new Registry({ tools: [runtimeTool("ffmpeg", { execute })] });

    const result = await videoCompose.execute(
      fixture.input,
      testContext(fixture.projectRoot, registry, { bypassPreComposeValidation: true }),
    );

    expect(execute).toHaveBeenCalledOnce();
    expect(result.warnings).toContain("pre_compose_validation: bypassed");
  });
});

async function fixtureInput(
  options: {
    runtime?: RenderRuntime;
    proposalRuntime?: RenderRuntime;
    motionLed?: boolean;
    assetKind?: string;
    missingAsset?: boolean;
    cuts?: EditDecisions["cuts"];
    decisionLog?: DecisionLog;
  } = {},
): Promise<{ projectRoot: string; input: VideoComposeInput }> {
  const projectRoot = await tempDir();
  const assetPath = join(projectRoot, "hero.mp4");
  if (options.missingAsset !== true) {
    await writeFile(assetPath, "fixture");
  }

  const runtime = options.runtime ?? "ffmpeg";
  const input = {
    edit_decisions: editDecisions({ runtime, cuts: options.cuts }),
    proposal_packet: proposalPacket({
      runtime: options.proposalRuntime ?? runtime,
      motionLed: options.motionLed ?? false,
    }),
    asset_manifest: {
      assets: [{ id: "hero", kind: options.assetKind ?? "video", path: assetPath }],
    } satisfies AssetManifest,
    decision_log: options.decisionLog,
  } satisfies VideoComposeInput;

  return { projectRoot, input };
}

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "predit-video-compose-test-"));
  tempDirs.push(dir);
  return dir;
}

function editDecisions(
  options: { runtime?: RenderRuntime; cuts?: EditDecisions["cuts"] } = {},
): EditDecisions {
  return {
    cuts: options.cuts ?? [{ start_s: 0, end_s: 4, asset_id: "hero" }],
    overlays: [],
    render_runtime: options.runtime ?? "ffmpeg",
    renderer_family: "screen-demo",
  };
}

function proposalPacket(options: { runtime: RenderRuntime; motionLed: boolean }): VideoComposeInput["proposal_packet"] {
  return {
    concept_options: [
      { slug: "a", hook: "A", treatment: "First treatment." },
      { slug: "b", hook: "B", treatment: "Second treatment." },
      { slug: "c", hook: "C", treatment: "Third treatment." },
    ],
    production_plan: {
      render_runtime: options.runtime,
      renderer_family: "screen-demo",
      audio_architecture: "no_narration",
    },
    delivery_promise: {
      motion_led: options.motionLed,
      narration_present: false,
      music_present: false,
    },
    decision_log_ref: "decision-log.json",
  };
}

function runtimeTool(
  name: RenderRuntime,
  options: {
    availability?: Availability;
    execute?: (params: unknown, ctx: ToolContext) => Promise<unknown>;
  } = {},
) {
  return defineTool({
    name,
    capability: "video_compose",
    provider: name,
    status: "production",
    integration: { kind: "library", package: `fixture-${name}`, install: "n/a" },
    best_for: "video compose test runtime",
    input: z.unknown(),
    output: RenderReportSchema,
    isAvailable: async () => options.availability ?? { available: true },
    execute: options.execute ?? (async () => renderReport(name)),
  });
}

function renderReport(runtime: RenderRuntime) {
  return {
    output_path: `renders/${runtime}.mp4`,
    encoding_profile: "h264/aac",
    duration_s: 4,
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    runtime_used: runtime,
    asset_count: 1,
    warnings: [],
    validation_steps: [],
  };
}

function testContext(
  projectRoot: string,
  registry: Registry,
  options: { bypassPreComposeValidation?: boolean } = {},
): ToolContext & { registry: Registry; bypassPreComposeValidation?: boolean } {
  return {
    projectRoot,
    registry,
    bypassPreComposeValidation: options.bypassPreComposeValidation,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
