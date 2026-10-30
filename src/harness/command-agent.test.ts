import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import { Registry } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { createCommandAgentDispatcher, findStageEvent } from "./command-agent.js";
import { createStageContext } from "./context.js";
import type { StageEvent } from "./events.js";
import type { StageResult } from "./result.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("command agent dispatcher", () => {
  it("spawns the agent with the stage brief on stdin and parses stage_completed from noisy stdout", async () => {
    const root = await scratchDir();
    const agent = await agentScript(
      root,
      `
      let input = "";
      process.stdin.on("data", (chunk) => (input += chunk));
      process.stdin.on("end", () => {
        console.log("Reading the idea director skill...");
        console.log(JSON.stringify({
          event: "stage_completed",
          stage: process.env.SHOWKICK_STAGE,
          timestamp: "2026-10-30T00:00:00Z",
          payload: { ...${JSON.stringify(stageResult({ concept: "x" }))}, artifact: { brief_mentions_skill: input.includes("idea-director.md"), target: process.env.SHOWKICK_TARGET } },
        }));
        console.log("Done.");
      });
      `,
    );
    const emitted: StageEvent[] = [];
    const dispatcher = createCommandAgentDispatcher({
      command: `node ${agent}`,
      projectRoot: root,
      target: "show/episode",
      timeoutMs: 10_000,
      emit: (event) => {
        emitted.push(event);
      },
      now: () => new Date("2026-10-30T00:00:00Z"),
    });

    const result = await dispatcher(contextForStage("idea"));

    expect(result.artifact).toEqual({ brief_mentions_skill: true, target: "show/episode" });
    expect(emitted).toMatchObject([{ event: "stage_started", stage: "idea", payload: { agent_command: `node ${agent}` } }]);
  });

  it("accepts the result written to SHOWKICK_STAGE_RESULT_FILE", async () => {
    const root = await scratchDir();
    const agent = await agentScript(
      root,
      `
      require("node:fs").writeFileSync(process.env.SHOWKICK_STAGE_RESULT_FILE, JSON.stringify({
        event: "stage_completed",
        stage: "script",
        timestamp: "2026-10-30T00:00:00Z",
        payload: ${JSON.stringify(stageResult({ lines: 4 }))},
      }));
      `,
    );
    const dispatcher = createCommandAgentDispatcher({ command: `node ${agent}`, projectRoot: root, target: "show/episode", timeoutMs: 10_000 });

    await expect(dispatcher(contextForStage("script"))).resolves.toMatchObject({ artifact: { lines: 4 } });
  });

  it("surfaces stage_failed messages from the agent", async () => {
    const root = await scratchDir();
    const agent = await agentScript(
      root,
      `console.log(JSON.stringify({ event: "stage_failed", stage: "idea", timestamp: "2026-10-30T00:00:00Z", payload: { message: "track is missing" } }));`,
    );
    const dispatcher = createCommandAgentDispatcher({ command: `node ${agent}`, projectRoot: root, target: "show/episode", timeoutMs: 10_000 });

    await expect(dispatcher(contextForStage("idea"))).rejects.toThrow("stage 'idea' agent failed: track is missing");
  });

  it("fails with the exit code and output tail when the agent never reports", async () => {
    const root = await scratchDir();
    const agent = await agentScript(root, `console.error("auth expired"); process.exit(3);`);
    const dispatcher = createCommandAgentDispatcher({ command: `node ${agent}`, projectRoot: root, target: "show/episode", timeoutMs: 10_000 });

    await expect(dispatcher(contextForStage("idea"))).rejects.toThrow(
      /exited with code 3 without reporting a stage_completed event[\s\S]*auth expired/u,
    );
  });

  it("kills the agent when the stage times out", async () => {
    const root = await scratchDir();
    const agent = await agentScript(root, `setTimeout(() => undefined, 60_000);`);
    const dispatcher = createCommandAgentDispatcher({ command: `node ${agent}`, projectRoot: root, target: "show/episode", timeoutMs: 300 });

    await expect(dispatcher(contextForStage("idea"))).rejects.toThrow("stage 'idea' agent failed: timed out");
  });

  it("ignores events for other stages and non-JSON lines", () => {
    const output = [
      "{not json",
      JSON.stringify({ event: "stage_completed", stage: "script", timestamp: "t", payload: {} }),
      "plain text",
    ].join("\n");

    expect(findStageEvent(output, "idea")).toBeUndefined();
    expect(findStageEvent(output, "script")).toMatchObject({ event: "stage_completed", stage: "script" });
  });
});

async function scratchDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "command-agent-test-"));
  scratchDirs.push(dir);
  return dir;
}

async function agentScript(dir: string, source: string): Promise<string> {
  const file = path.join(dir, "agent.cjs");
  await writeFile(file, source);
  return file;
}

function contextForStage(stageSlug: string) {
  const show: LoadedShow = {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-12T00:00:00Z"),
    pipelines: { default: {} },
    defaults: { pipeline: "default" },
    projectRoot: "/project",
    rootDir: "/project/shows/show",
  };
  const episode: LoadedEpisode = {
    slug: "episode",
    title: "Episode",
    created: new Date("2026-05-12T00:00:00Z"),
    inputs: {},
    cast: [],
    filePath: `${show.rootDir}/episodes/episode.yaml`,
  };
  const pipeline: PipelineManifest = {
    slug: "music-video",
    stages: [stage("idea"), stage("script")],
    orchestration: {
      budget_default_usd: 3,
      cost_drift_threshold: 1.3,
      max_revisions_per_stage: 2,
      max_send_backs: 3,
      max_wall_time_minutes: 30,
    },
  };

  return createStageContext({
    show,
    episode,
    pipeline,
    stage: stage(stageSlug),
    playbook: {},
    registry: new Registry({ tools: [] }),
  });
}

function stage(slug: string): Stage {
  return {
    slug,
    skill: `pipelines/music-video/${slug}-director.md`,
    produces: `${slug}_artifact`,
    produces_artifacts: [],
    required_artifacts_in: [],
    optional_artifacts_in: [],
    required_tools: [],
    optional_tools: [],
    tools_available: [],
    review_focus: [],
    success_criteria: [],
    human_approval: "required",
  };
}

function stageResult(artifact: unknown): StageResult {
  return {
    artifact,
    cost_used: { stage_cost_usd: 0, total_so_far_usd: 0, budget_remaining_usd: 3 },
    decisions: [],
  };
}
