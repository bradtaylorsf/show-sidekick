import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RenderReportSchema } from "../../src/artifacts/index.js";
import { readCheckpoint } from "../../src/checkpoints/index.js";
import { Registry } from "../../src/registry/index.js";
import type { StageContext, StageResult } from "../../src/harness/index.js";
import { createProgram } from "../../src/cli/program.js";
import type { BuildHandlerOptions } from "../../src/cli/commands/build.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("framework smoke", () => {
  it("runs predit build to completion on fixtures in under 30 seconds", async () => {
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

    const startedAt = Date.now();
    await program.parseAsync(["node", "predit", "--json", "build", "show/episode", "--sample", "--budget", "2.5"], {
      from: "node",
    });
    const durationMs = Date.now() - startedAt;

    const event = JSON.parse(output().stdout.trim().split("\n").at(-1) ?? "{}") as {
      event: string;
      status: string;
      last_stage?: string;
      total_cost_usd: number;
    };
    expect(event).toEqual(
      expect.objectContaining({
        event: "build_finished",
        status: "completed",
        last_stage: "compose",
      }),
    );
    expect(event.total_cost_usd).toBeGreaterThan(0);
    expect(contexts.map((ctx) => ctx.stage.slug)).toEqual(["research", "script", "compose"]);
    expect(durationMs).toBeLessThan(30_000);

    const composeCheckpoint = await readCheckpoint(root, "show", "episode", "compose");
    expect(RenderReportSchema.parse(composeCheckpoint.artifact)).toMatchObject({
      output_path: "renders/framework-smoke.mp4",
      runtime_used: "ffmpeg",
    });
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-framework-smoke-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writePipeline(root, "framework-smoke");
  await writeShow(root, "show", "framework-smoke");
  await writeEpisode(root, "show", "episode", "framework-smoke");
  return root;
}

async function writePipeline(root: string, slug: string): Promise<void> {
  await writeFile(
    path.join(root, ".predit", "pipelines", `${slug}.yaml`),
    [
      `slug: ${slug}`,
      "sample_support: both",
      "stages:",
      "  - slug: research",
      "    skill: pipelines/framework-smoke/research-director.md",
      "    produces: research_brief",
      "    human_approval: never",
      "  - slug: script",
      "    skill: pipelines/framework-smoke/script-director.md",
      "    produces: script",
      "    human_approval: never",
      "  - slug: compose",
      "    skill: pipelines/framework-smoke/compose-director.md",
      "    produces: render_report",
      "    human_approval: never",
      "",
    ].join("\n"),
    "utf8",
  );
}

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

async function writeEpisode(root: string, show: string, slug: string, pipeline: string): Promise<void> {
  await writeFile(
    path.join(root, "shows", show, "episodes", `${slug}.yaml`),
    [`slug: ${slug}`, 'title: "Episode"', "created: 2026-05-12", `pipeline: ${pipeline}`, ""].join("\n"),
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
  compose: stageResult(
    {
      output_path: "renders/framework-smoke.mp4",
      encoding_profile: "h264-main",
      duration_s: 5,
      resolution: {
        width: 1920,
        height: 1080,
      },
      framerate: 30,
      runtime_used: "ffmpeg",
      asset_count: 0,
      warnings: [],
      validation_steps: [
        {
          name: "fixture-compose",
          status: "pass",
          notes: "No external API keys used.",
        },
      ],
    },
    0,
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

function captureProgram(build?: BuildHandlerOptions) {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
    io: {
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
    },
    build,
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}
