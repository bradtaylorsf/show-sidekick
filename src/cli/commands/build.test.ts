import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Registry } from "../../registry/index.js";
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

async function writeEpisode(root: string, show: string, slug: string, pipeline: string): Promise<void> {
  await writeFile(
    path.join(root, "shows", show, "episodes", `${slug}.yaml`),
    [`slug: ${slug}`, 'title: "Episode"', "created: 2026-05-12", `pipeline: ${pipeline}`, ""].join("\n"),
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
