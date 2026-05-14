import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VideoAnalysisBrief } from "../../artifacts/video-analysis-brief.js";
import { Registry } from "../../registry/index.js";
import type { ReviewContext } from "../../review/runner.js";
import type { StageContext, StageResult } from "../../harness/index.js";
import { createProgram } from "../program.js";
import type { BuildHandlerOptions } from "./build.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-build-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writePipeline(root, "framework-smoke");
  await writeShow(root, "show", "framework-smoke");
  await writeEpisode(root, "show", "episode", "framework-smoke");
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("build command", () => {
  it("runs the framework-smoke pipeline through the Runner with an in-process dispatcher", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const contexts: StageContext[] = [];
    const { program, output } = captureProgram({
      registryFactory: () => new Registry({ tools: [] }),
      dispatcherFactory: () => async (ctx) => {
        contexts.push(ctx);
        return fixtures[ctx.stage.slug] ?? stageResult({ unexpected: ctx.stage.slug }, 0);
      },
      now: () => new Date("2026-05-12T15:42:00.000Z"),
    });
    await program.parseAsync(
      [
        "node",
        "predit",
        "--json",
        "build",
        "show/episode",
        "--sample",
        "--budget",
        "2.5",
      ],
      { from: "node" },
    );

    const event = JSON.parse(output().stdout.trim()) as {
      event: string;
      command: string;
      show: string;
      episode: string;
      pipeline: string;
      status: string;
      total_cost_usd: number;
    };

    expect(event).toEqual(
      expect.objectContaining({
        event: "build_finished",
        command: "build",
        show: "show",
        episode: "episode",
        pipeline: "framework-smoke",
        status: "completed",
        total_cost_usd: 0.3,
      }),
    );
    expect(contexts.map((ctx) => ctx.stage.slug)).toEqual(["research", "script"]);
    expect(contexts[0]?.runOptions).toMatchObject({ sample: true, budget_usd: 2.5 });
  });

  it("rejects stage flags that are not declared by the pipeline", async () => {
    const root = await scratchProject();
    process.chdir(root);

    const { program } = captureProgram();

    await expect(
      program.parseAsync(["node", "predit", "build", "show/episode", "--from", "missing"], { from: "node" }),
    ).rejects.toThrow("unknown stage 'missing' for --from");
  });

  it("analyzes an episode reference input before Runner and threads the brief into stages and review", async () => {
    const root = await scratchProject();
    const referencePath = path.join(root, "music_library", "reference.mp4");
    await mkdir(path.dirname(referencePath), { recursive: true });
    await writeFile(referencePath, "video", "utf8");
    await writeEpisode(root, "show", "episode", "framework-smoke", "reference.mp4");
    process.chdir(root);

    const contexts: StageContext[] = [];
    const reviewContexts: ReviewContext[] = [];
    const referenceSources: string[] = [];
    const { program } = captureProgram({
      registryFactory: () => new Registry({ tools: [] }),
      referenceResolver: ({ source }) => {
        referenceSources.push(source.kind === "file" ? source.absolutePath : source.url);
        return referenceBrief;
      },
      dispatcherFactory: () => async (ctx) => {
        contexts.push(ctx);
        return fixtures[ctx.stage.slug] ?? stageResult({ unexpected: ctx.stage.slug }, 0);
      },
      reviewer: (stageSlug, _artifact, ctx) => {
        reviewContexts.push(ctx);
        return passReview(stageSlug, ctx.round ?? 0);
      },
      now: () => new Date("2026-05-12T15:42:00.000Z"),
    });

    await program.parseAsync(["node", "predit", "--json", "build", "show/episode"], { from: "node" });

    expect(referenceSources).toEqual([expect.stringContaining(path.join("music_library", "reference.mp4"))]);
    expect(contexts[0]?.priorArtifacts.video_analysis_brief).toEqual(referenceBrief);
    expect(contexts[1]?.priorArtifacts.video_analysis_brief).toEqual(referenceBrief);
    expect(reviewContexts[0]).toMatchObject({
      referenceBrief,
      videoAnalysisBrief: referenceBrief,
      referenceDriven: true,
    });
  });

  it("prefers --reference over episode inputs.reference", async () => {
    const root = await scratchProject();
    const referencePath = path.join(root, "flag-reference.mp4");
    await writeFile(referencePath, "video", "utf8");
    await writeEpisode(root, "show", "episode", "framework-smoke", "missing-input-reference.mp4");
    process.chdir(root);

    const referenceSources: string[] = [];
    const { program } = captureProgram({
      registryFactory: () => new Registry({ tools: [] }),
      referenceResolver: ({ source }) => {
        referenceSources.push(source.kind === "file" ? source.absolutePath : source.url);
        return referenceBrief;
      },
      dispatcherFactory: () => async (ctx) => fixtures[ctx.stage.slug] ?? stageResult({ unexpected: ctx.stage.slug }, 0),
      reviewer: (stageSlug, _artifact, ctx) => passReview(stageSlug, ctx.round ?? 0),
      now: () => new Date("2026-05-12T15:42:00.000Z"),
    });

    await program.parseAsync(["node", "predit", "--json", "build", "show/episode", "--reference", referencePath], {
      from: "node",
    });

    expect(referenceSources).toEqual([referencePath]);
  });
});

async function writeShow(root: string, slug: string, pipeline: string): Promise<void> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "Test Show"',
      "created: 2026-05-12",
      "pipelines:",
      `  ${pipeline}: {}`,
      "defaults:",
      `  pipeline: ${pipeline}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeEpisode(
  root: string,
  show: string,
  slug: string,
  pipeline: string,
  reference?: string,
): Promise<void> {
  await writeFile(
    path.join(root, "shows", show, "episodes", `${slug}.yaml`),
    [
      `slug: ${slug}`,
      'title: "Episode"',
      "created: 2026-05-12",
      `pipeline: ${pipeline}`,
      ...(reference === undefined ? [] : ["inputs:", `  reference: ${reference}`]),
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writePipeline(root: string, slug: string): Promise<void> {
  await writeFile(
    path.join(root, ".predit", "pipelines", `${slug}.yaml`),
    [
      `slug: ${slug}`,
      "stages:",
      "  - slug: research",
      "    skill: pipelines/framework-smoke/research-director.md",
      "    produces: research_brief",
      "    human_approval: never",
      "  - slug: script",
      "    skill: pipelines/framework-smoke/script-director.md",
      "    produces: script",
      "    human_approval: never",
      "",
    ].join("\n"),
    "utf8",
  );
}

const fixtures: Record<string, StageResult> = {
  research: stageResult(
    {
      topic_exploration: "Build command smoke coverage.",
      sources: [],
      findings: [{ claim: "The build command invokes Runner.", evidence: "In-process dispatcher fixture." }],
    },
    0.1,
  ),
  script: stageResult(
    {
      sections: [
        {
          slug: "intro",
          start_s: 0,
          end_s: 5,
          narration: "A short build smoke script.",
          dialogue: [],
          enhancement_cues: [],
        },
      ],
    },
    0.2,
  ),
};

function stageResult(artifact: unknown, stageCostUsd: number): StageResult {
  return {
    artifact,
    cost_used: {
      stage_cost_usd: stageCostUsd,
      total_so_far_usd: stageCostUsd,
      budget_remaining_usd: 3 - stageCostUsd,
    },
    decisions: [],
  };
}

function passReview(stageSlug: string, round: number) {
  return {
    stage: stageSlug,
    round,
    decision: "pass" as const,
    findings: [],
    summary: {
      critical: 0,
      suggestions: 0,
      nitpicks: 0,
      investigations: 0,
      success_criteria_met: 0,
      success_criteria_total: 0,
    },
  };
}

const referenceBrief: VideoAnalysisBrief = {
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

function captureProgram(build?: BuildHandlerOptions) {
  let stdout = "";
  let stderr = "";
  const io = {
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
  };
  const program = createProgram({
    io,
    build,
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}
