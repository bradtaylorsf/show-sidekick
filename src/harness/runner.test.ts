import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCheckpoint, readState } from "../checkpoints/index.js";
import { readCostLog } from "../cost/tracker.js";
import { readDecisionLog, type DecisionEntry } from "../decisions/index.js";
import { loadPipeline } from "../pipelines/load.js";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import { defineTool, Registry, type Tool } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { createProgram } from "../cli/program.js";
import { loadRunTarget } from "../cli/commands/run-target.js";
import type { Review } from "../artifacts/review.js";
import type { Dispatcher, StageContext, StageResult } from "./index.js";
import { Runner, type StageReviewer } from "./runner.js";
import { planStages } from "./plan.js";
import { z } from "zod";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("planStages", () => {
  it("honors from, to, and only stage filters", () => {
    const pipeline = pipelineManifest([
      stage("research"),
      stage("script"),
      stage("assets"),
      stage("compose"),
    ]);

    expect(planStages(pipeline, { from: "script", to: "assets" }).map((item) => item.slug)).toEqual([
      "script",
      "assets",
    ]);
    expect(planStages(pipeline, { only: "assets", from: "research", to: "compose" }).map((item) => item.slug)).toEqual([
      "assets",
    ]);
  });

  it("requires an audio_sync build stage in the plan or completed before required audio stages", () => {
    const pipeline = pipelineManifest([
      stage("cuesheet", { audio_sync: "build" }),
      stage("scene_plan", { audio_sync: "required" }),
    ]);

    expect(() => planStages(pipeline, { from: "scene_plan" })).toThrow(
      "audio_sync: required stage 'scene_plan' cannot run before audio_sync: build stage 'cuesheet' has completed",
    );
    expect(planStages(pipeline, { from: "scene_plan" }, { completedStages: ["cuesheet"] }).map((item) => item.slug)).toEqual([
      "scene_plan",
    ]);
    expect(planStages(pipeline, { from: "cuesheet", to: "scene_plan" }).map((item) => item.slug)).toEqual([
      "cuesheet",
      "scene_plan",
    ]);
  });
});

describe("Runner", () => {
  it("runs the framework-smoke fixture to completion and persists checkpoints, state, and decisions", async () => {
    const root = await scratchProject();
    await installBundledPipeline(root, "framework-smoke");
    const pipeline = await loadPipeline(root, "framework-smoke");
    const show = loadedShow(root, "framework-smoke");
    const episode = loadedEpisode(show, "framework-smoke");
    const dispatched: string[] = [];
    const decision = decisionEntry("research-decision", "research");
    const dispatcher = scriptedDispatcher(dispatched, {
      research: stageResult(researchBrief(), 0.1, [decision]),
      script: stageResult(scriptArtifact(), 0.2),
    });

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "framework-smoke",
      registry: new Registry({ tools: [] }),
      dispatcher,
      runOptions: { sample: false },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(result.totalCostUsd).toBeCloseTo(0.3);
    expect(dispatched).toEqual(["research", "script"]);
    await expect(readCheckpoint(root, "show", "episode", "research")).resolves.toMatchObject({
      status: "completed",
      artifact: researchBrief(),
    });
    await expect(readCheckpoint(root, "show", "episode", "script")).resolves.toMatchObject({
      status: "completed",
      artifact: scriptArtifact(),
    });
    await expect(readState(root, "show", "episode")).resolves.toMatchObject({
      current_stage: "script",
      last_status: "completed",
      cost_total_usd: 0.3,
    });
    await expect(readDecisionLog({ show: "show", episode: "episode" }, { root })).resolves.toEqual([decision]);
  });

  it("records stage cost entries to the episode cost log", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("assets")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher([], {
        assets: {
          ...stageResult({ ok: true }, 0.44),
          cost_entries: [
            {
              tool: "image_generation",
              provider: "openai",
              model: "gpt-image-1",
              units: 2,
              usd: 0.08,
              mode: "full",
            },
            {
              tool: "image_to_video",
              provider: "kling",
              model: "kling-v2.1-pro",
              units: 1,
              usd: 0.36,
              mode: "full",
            },
          ],
        },
      }),
      reviewer: passReviewer,
      runOptions: { sample: false },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    await expect(readCostLog(root, "show", "episode")).resolves.toEqual([
      {
        tool: "image_generation",
        provider: "openai",
        model: "gpt-image-1",
        units: 2,
        usd: 0.08,
        mode: "full",
      },
      {
        tool: "image_to_video",
        provider: "kling",
        model: "kling-v2.1-pro",
        units: 1,
        usd: 0.36,
        mode: "full",
      },
    ]);
    await expect(readCheckpoint(root, "show", "episode", "assets")).resolves.toMatchObject({
      tool_invocations: [
        {
          tool: "image_generation",
          provider: "openai",
          model: "gpt-image-1",
          units: 2,
          usd: 0.08,
        },
        {
          tool: "image_to_video",
          provider: "kling",
          model: "kling-v2.1-pro",
          units: 1,
          usd: 0.36,
        },
      ],
    });
  });

  it("threads the runner tool policy into paid tool announce execution", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("assets")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const output = captureIo();
    const calls: string[] = [];
    const paidTool = defineTool({
      name: "paid_image",
      capability: "image_generation",
      provider: "openai",
      status: "beta",
      integration: { kind: "library", package: "test", install: "none" },
      best_for: "test image generation",
      cost: { unit: "image", usd: 0.04 },
      input: z.object({ prompt: z.string(), count: z.number() }),
      output: z.object({ image_path: z.string(), cost_usd: z.number() }),
      execute: async () => {
        calls.push("execute");
        return { image_path: "assets/hero.png", cost_usd: 0.08 };
      },
    });

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [paidTool] }),
      dispatcher: async (ctx) => {
        await paidTool.execute(
          { prompt: "hero", count: 2 },
          {
            projectRoot: root,
            logger: logger(),
            registry: ctx.registry,
            execution: ctx.toolPolicy,
          },
        );
        return {
          ...stageResult({ ok: true }, 0.08),
          cost_entries: [
            {
              tool: "paid_image",
              provider: "openai",
              model: "gpt-image-1",
              units: 2,
              usd: 0.08,
              mode: "full",
            },
          ],
        };
      },
      reviewer: passReviewer,
      runOptions: { sample: false, nonInteractive: true },
      io: output.io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(calls).toEqual(["execute"]);
    expect(output.stdout()).toContain('"event":"announce"');
    expect(output.stdout()).toContain('"tool":"paid_image"');
    expect(output.stdout()).toContain('"estimate_usd":0.08');
  });

  it("dispatches only the planned stages for --only", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("research"), stage("script"), stage("assets")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher(dispatched, {
        script: stageResult({ ok: true }, 0.1),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false, only: "script" },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(dispatched).toEqual(["script"]);
  });

  it("halts after writing the over-budget stage checkpoint", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("research"), stage("script")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];
    const output = captureIo();

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher(dispatched, {
        research: stageResult({ ok: true }, 0.75),
        script: stageResult({ skipped: true }, 0.1),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false, budget_usd: 0.5 },
      io: output.io,
      now: fixedNow,
    });

    expect(result.status).toBe("budget_exceeded");
    expect(dispatched).toEqual(["research"]);
    expect(output.stdout()).toContain("budget exceeded");
    await expect(readCheckpoint(root, "show", "episode", "research")).resolves.toMatchObject({
      status: "completed",
      cost_snapshot: {
        stage_cost_usd: 0.75,
        total_so_far_usd: 0.75,
        budget_remaining_usd: -0.25,
      },
    });
  });

  it("revises up to the per-stage limit and checkpoints the passing round", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("research")], { max_revisions_per_stage: 2 });
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];
    let reviewCount = 0;

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher(dispatched, {
        research: stageResult({ ok: true }, 0.1),
      }),
      reviewer: (_stageSlug, _artifact, ctx) => {
        const decision = reviewCount < 2 ? "revise" : "pass";
        reviewCount += 1;
        return review(decision, ctx.round ?? 0);
      },
      runOptions: { sample: false },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(dispatched).toEqual(["research", "research", "research"]);
    await expect(readCheckpoint(root, "show", "episode", "research")).resolves.toMatchObject({
      status: "completed",
      review_summary: {
        decision: "pass",
        rounds: 3,
      },
    });
  });

  it("fails the checkpoint when the reviewer still requests revision at the per-stage limit", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("research")], { max_revisions_per_stage: 1 });
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher(dispatched, {
        research: stageResult({ ok: true }, 0.1),
      }),
      reviewer: (_stageSlug, _artifact, ctx) => review("revise", ctx.round ?? 0),
      runOptions: { sample: false },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    expect(dispatched).toEqual(["research", "research"]);
    await expect(readCheckpoint(root, "show", "episode", "research")).resolves.toMatchObject({
      status: "failed",
      review_summary: {
        decision: "revise",
      },
    });
  });

  it("rejects an audio-required stage when the build checkpoint is absent and not planned", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([
      stage("cuesheet", { audio_sync: "build" }),
      stage("scene_plan", { audio_sync: "required" }),
    ]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];

    await expect(
      Runner.run({
        projectRoot: root,
        show,
        episode,
        pipeline,
        pipelineName: "demo",
        registry: new Registry({ tools: [] }),
        dispatcher: scriptedDispatcher(dispatched, {
          scene_plan: stageResult({ ok: true }, 0.1),
        }),
        reviewer: passReviewer,
        runOptions: { sample: false, from: "scene_plan" },
        io: captureIo().io,
        now: fixedNow,
      }),
    ).rejects.toThrow("audio_sync: required stage 'scene_plan' cannot run");
    expect(dispatched).toEqual([]);
  });

  it("prompts for required approval in interactive mode and continues after approve", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("idea", { human_approval: "required" }), stage("script")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher(dispatched, {
        idea: stageResult({ idea: true }, 0.1),
        script: stageResult({ script: true }, 0.1),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false },
      io: captureIo().io,
      prompt: async () => "approve",
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(dispatched).toEqual(["idea", "script"]);
    await expect(readCheckpoint(root, "show", "episode", "idea")).resolves.toMatchObject({ status: "completed" });
  });

  it("reruns the stage with human revision notes before approval", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("idea", { human_approval: "required" })]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatchedNotes: string[][] = [];
    const actions = [{ action: "revise" as const, note: "tighten the hook" }, "approve" as const];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: async (ctx) => {
        dispatchedNotes.push([...ctx.revision_notes]);
        return stageResult({ idea: true }, 0.1);
      },
      reviewer: passReviewer,
      runOptions: { sample: false },
      io: captureIo().io,
      prompt: async () => actions.shift() ?? "approve",
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(dispatchedNotes).toEqual([[], ["tighten the hook"]]);
    await expect(readState(root, "show", "episode")).resolves.toMatchObject({
      revision_notes: {
        idea: ["tighten the hook"],
      },
    });
  });

  it("returns aborted when the interactive approval prompt aborts", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("idea", { human_approval: "required" }), stage("script")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const dispatched: string[] = [];

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher(dispatched, {
        idea: stageResult({ idea: true }, 0.1),
        script: stageResult({ script: true }, 0.1),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false },
      io: captureIo().io,
      prompt: async () => "abort",
      now: fixedNow,
    });

    expect(result.status).toBe("aborted");
    expect(dispatched).toEqual(["idea"]);
    await expect(readCheckpoint(root, "show", "episode", "idea")).resolves.toMatchObject({
      status: "awaiting_human",
    });
  });

  it("pauses at required approvals in non-interactive mode and resumes after predit approve", async () => {
    const root = await scratchUserProject();
    process.chdir(root);
    const loaded = await loadRunTarget("show/episode");
    const dispatched: string[] = [];
    const dispatcher = scriptedDispatcher(dispatched, {
      idea: stageResult({ idea: true }, 0.1),
      script: stageResult({ script: true }, 0.1),
    });

    const first = await Runner.run({
      projectRoot: loaded.projectRoot,
      show: loaded.show,
      episode: loaded.episode,
      pipeline: loaded.pipeline,
      pipelineName: loaded.pipelineName,
      registry: new Registry({ tools: [] }),
      dispatcher,
      reviewer: passReviewer,
      runOptions: { sample: false, nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(first.status).toBe("awaiting_human");
    expect(dispatched).toEqual(["idea"]);
    await expect(readCheckpoint(root, "show", "episode", "idea")).resolves.toMatchObject({
      status: "awaiting_human",
    });

    const approvalProgram = captureProgram();
    await approvalProgram.program.parseAsync(["node", "predit", "--json", "approve", "show/episode"], { from: "node" });
    await expect(readState(root, "show", "episode")).resolves.toMatchObject({
      current_stage: "idea",
      last_status: "completed",
    });

    const second = await Runner.run({
      projectRoot: loaded.projectRoot,
      show: loaded.show,
      episode: loaded.episode,
      pipeline: loaded.pipeline,
      pipelineName: loaded.pipelineName,
      registry: new Registry({ tools: [] }),
      dispatcher,
      reviewer: passReviewer,
      runOptions: { sample: false, nonInteractive: true },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(second.status).toBe("completed");
    expect(dispatched).toEqual(["idea", "script"]);
  });

  it("shows projected remaining sample and full estimated costs in approval blocks", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([
      stage("proposal", { human_approval: "required" }),
      stage("assets", {
        estimated_cost: {
          sample: { usd: 0.4 },
          full: { usd: 2.4 },
        },
      }),
      stage("compose", {
        estimated_cost: {
          sample: { usd: 0.1 },
          full: { usd: 0.6 },
        },
      }),
    ]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const output = captureIo();

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher([], {
        proposal: stageResult({ ok: true }, 0.1),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false, nonInteractive: true },
      io: output.io,
      now: fixedNow,
    });

    expect(result.status).toBe("awaiting_human");
    expect(output.stdout()).toContain("Next stage (assets) estimates $2.40 full / $0.40 sample.");
    expect(output.stdout()).toContain("Projected remaining: $3.00 full / $0.50 sample.");
  });

  it("adds a cost-drift finding when cumulative actual cost exceeds estimated cost by 30 percent", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest(
      [
        stage("assets", {
          produces: "unknown_artifact",
          estimated_cost: {
            sample: { usd: 0.5 },
            full: { usd: 1 },
          },
        }),
      ],
      { max_revisions_per_stage: 0 },
    );
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher([], {
        assets: stageResult({ ok: true }, 1.31),
      }),
      runOptions: { sample: false },
      io: captureIo().io,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    const checkpoint = await readCheckpoint(root, "show", "episode", "assets");
    expect(checkpoint).toMatchObject({
      status: "failed",
      review_summary: {
        critical: 1,
      },
    });
    expect(checkpoint.review_summary?.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Cumulative cost drift exceeded estimate",
      }),
    );
  });

  it("halts compose when final_review fails, preserves the render, and allows force approval", async () => {
    const root = await scratchProject();
    await writePipeline(root, "demo", ["compose"]);
    await writeShowAndEpisode(root, "demo");
    const pipeline = pipelineManifest([stage("compose", { produces: "unknown_artifact" })]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const output = captureIo();
    const sourceRenderPath = path.join(root, "projects", "show", "episode", "renders", "final.mp4");
    await mkdir(path.dirname(sourceRenderPath), { recursive: true });
    await writeFile(sourceRenderPath, "failed render", "utf8");

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [] }),
      dispatcher: scriptedDispatcher([], {
        compose: stageResult(
          {
            output_path: "renders/final.mp4",
            final_review: failedFinalReview(),
          },
          0,
        ),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false },
      io: output.io,
      now: fixedNow,
    });

    expect(result.status).toBe("failed");
    expect(output.stdout()).toContain('"event":"final_review_failed"');
    expect(output.stdout()).toContain('"cta":"predit approve --force <reason>"');
    await expect(readFile(path.join(root, "projects", "show", "episode", "renders", "final-failed.mp4"), "utf8")).resolves.toBe(
      "failed render",
    );
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({
      status: "failed",
      artifact: {
        final_review: {
          status: "fail",
        },
      },
    });

    process.chdir(root);
    const approvalProgram = captureProgram();
    await approvalProgram.program.parseAsync(
      ["node", "predit", "--json", "approve", "show/episode", "--force", "User inspected final-failed.mp4."],
      { from: "node" },
    );

    expect(JSON.parse(approvalProgram.output.stdout().trim())).toMatchObject({ event: "stage_force_approved", stage: "compose" });
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({ status: "completed" });
    await expect(readDecisionLog("show/episode", { root })).resolves.toEqual([
      expect.objectContaining({
        category: "downgrade_approval",
        picked: "force_approval",
      }),
    ]);
  });

  it("surfaces registry availability warnings without halting the run", async () => {
    const root = await scratchProject();
    const pipeline = pipelineManifest([stage("research")]);
    const show = loadedShow(root, "demo");
    const episode = loadedEpisode(show, "demo");
    const output = captureIo();
    const unavailableTool = tool({
      name: "offline_research",
      available: false,
      reason: "missing TEST_API_KEY",
      fix: "env",
    });

    const result = await Runner.run({
      projectRoot: root,
      show,
      episode,
      pipeline,
      pipelineName: "demo",
      registry: new Registry({ tools: [unavailableTool] }),
      dispatcher: scriptedDispatcher([], {
        research: stageResult({ ok: true }, 0.1),
      }),
      reviewer: passReviewer,
      runOptions: { sample: false },
      io: output.io,
      now: fixedNow,
    });

    expect(result.status).toBe("completed");
    expect(result.warnings).toEqual([
      {
        tool: "offline_research",
        reason: "missing TEST_API_KEY",
        fix: "env",
      },
    ]);
    expect(output.stdout()).toContain("Registry warnings:");
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-runner-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  return root;
}

async function scratchUserProject(): Promise<string> {
  const root = await scratchProject();
  await writeFile(
    path.join(root, ".predit", "pipelines", "demo.yaml"),
    [
      "slug: demo",
      "orchestration:",
      "  max_revisions_per_stage: 1",
      "  max_send_backs: 3",
      "  max_wall_time_minutes: 30",
      "  budget_default_usd: 3",
      "stages:",
      "  - slug: idea",
      "    skill: pipelines/demo/idea.md",
      "    produces: brief",
      "    human_approval: required",
      "  - slug: script",
      "    skill: pipelines/demo/script.md",
      "    produces: script",
      "    human_approval: never",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeShowAndEpisode(root, "demo");
  return root;
}

async function installBundledPipeline(root: string, slug: string): Promise<void> {
  const source = new URL(`../../bundled/pipelines/${slug}.yaml`, import.meta.url);
  const contents = await readFile(source, "utf8");
  await writeFile(path.join(root, ".predit", "pipelines", `${slug}.yaml`), contents, "utf8");
}

async function writeShowAndEpisode(root: string, pipeline: string): Promise<void> {
  const showDir = path.join(root, "shows", "show");
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      "slug: show",
      'display_name: "Show"',
      "created: 2026-05-12",
      "pipelines:",
      `  ${pipeline}: {}`,
      "defaults:",
      `  pipeline: ${pipeline}`,
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(showDir, "episodes", "episode.yaml"),
    ["slug: episode", 'title: "Episode"', "created: 2026-05-12", `pipeline: ${pipeline}`, ""].join("\n"),
    "utf8",
  );
}

async function writePipeline(root: string, slug: string, stages: string[]): Promise<void> {
  await writeFile(
    path.join(root, ".predit", "pipelines", `${slug}.yaml`),
    [
      `slug: ${slug}`,
      "stage_order: manifest",
      "orchestration:",
      "  max_revisions_per_stage: 1",
      "  max_send_backs: 3",
      "  max_wall_time_minutes: 30",
      "  budget_default_usd: 3",
      "stages:",
      ...stages.flatMap((stageSlug) => [
        `  - slug: ${stageSlug}`,
        `    skill: pipelines/${slug}/${stageSlug}.md`,
        "    produces: unknown_artifact",
        "    human_approval: never",
      ]),
      "",
    ].join("\n"),
    "utf8",
  );
}

function loadedShow(projectRoot: string, pipelineName: string): LoadedShow {
  return {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-12T00:00:00Z"),
    pipelines: {
      [pipelineName]: {},
    },
    defaults: {
      pipeline: pipelineName,
    },
    projectRoot,
    rootDir: path.join(projectRoot, "shows", "show"),
  };
}

function loadedEpisode(show: LoadedShow, pipelineName: string): LoadedEpisode {
  return {
    slug: "episode",
    title: "Episode",
    created: new Date("2026-05-12T00:00:00Z"),
    pipeline: pipelineName,
    inputs: {},
    cast: [],
    filePath: path.join(show.rootDir, "episodes", "episode.yaml"),
  };
}

function pipelineManifest(
  stages: Stage[],
  orchestration: Partial<PipelineManifest["orchestration"]> = {},
): PipelineManifest {
  return {
    slug: "demo",
    master_clock: "none",
    stages,
    orchestration: {
      budget_default_usd: 3,
      max_revisions_per_stage: 2,
      max_send_backs: 3,
      max_wall_time_minutes: 30,
      ...orchestration,
    },
  };
}

function stage(slug: string, overrides: Partial<Stage> = {}): Stage {
  return {
    slug,
    skill: `pipelines/demo/${slug}.md`,
    produces: `${slug}_artifact`,
    produces_artifacts: [],
    required_artifacts_in: [],
    optional_artifacts_in: [],
    required_tools: [],
    optional_tools: [],
    tools_available: [],
    review_focus: [],
    success_criteria: [],
    human_approval: "never",
    ...overrides,
  };
}

function scriptedDispatcher(dispatched: string[], fixtures: Record<string, StageResult>): Dispatcher {
  return async (ctx: StageContext) => {
    dispatched.push(ctx.stage.slug);
    const result = fixtures[ctx.stage.slug];
    if (result === undefined) {
      throw new Error(`missing fixture for ${ctx.stage.slug}`);
    }
    return result;
  };
}

function stageResult(artifact: unknown, stageCostUsd: number, decisions: DecisionEntry[] = []): StageResult {
  return {
    artifact,
    cost_used: {
      stage_cost_usd: stageCostUsd,
      total_so_far_usd: stageCostUsd,
      budget_remaining_usd: 3 - stageCostUsd,
    },
    decisions,
  };
}

const passReviewer: StageReviewer = (_stageSlug, _artifact, ctx) => review("pass", ctx.round ?? 0);

function review(decision: Review["decision"], round: number): Review {
  const critical = decision === "revise" ? 1 : 0;
  return {
    stage: "stage",
    round,
    decision,
    findings:
      critical === 0
        ? []
        : [
            {
              severity: "critical",
              title: "Needs revision",
              location: "stage.field",
              description: "The stage needs a concrete revision before it can continue.",
              proposed_fix: 'Set "stage.field" to "fixed" before review round 1.',
              status: "pending",
            },
          ],
    summary: {
      critical,
      suggestions: 0,
      nitpicks: 0,
      investigations: 0,
      success_criteria_met: 0,
      success_criteria_total: 0,
    },
  };
}

function researchBrief() {
  return {
    topic_exploration: "A concise framework smoke research pass.",
    sources: [],
    findings: [
      {
        claim: "The smoke pipeline can produce a research brief.",
        evidence: "Fixture-backed test artifact.",
      },
    ],
  };
}

function scriptArtifact() {
  return {
    sections: [
      {
        slug: "intro",
        start_s: 0,
        end_s: 5,
        narration: "A short test script.",
        dialogue: [],
        enhancement_cues: [],
      },
    ],
  };
}

function decisionEntry(id: string, stageSlug: string): DecisionEntry {
  return {
    id,
    stage: stageSlug,
    timestamp: "2026-05-12T15:42:00.000Z",
    category: "pipeline_selection",
    options_considered: [
      { label: "framework-smoke", rejected_because: null, notes: "Smallest integration pipeline." },
      { label: "demo", rejected_because: "Not the requested fixture.", notes: null },
    ],
    picked: "framework-smoke",
    reason: "Use the minimal fixture pipeline for runner smoke coverage.",
    confidence: 0.8,
    user_visible: false,
    supersedes: null,
  };
}

function failedFinalReview() {
  return {
    status: "fail",
    recommended_action: "block",
    checks: {
      technical_probe: {
        container: "mp4",
        duration_s: 12,
        duration_promised_s: 12,
        width: 1920,
        height: 1080,
        framerate: 30,
        video_codec: "h264",
        audio_codec: "aac",
        audio_channels: 2,
        bitrate_kbps: 6200,
        verdict: "pass",
      },
      visual_spotcheck: {
        frames_sampled: 4,
        sample_points_pct: [10, 35, 65, 90],
        findings: [],
      },
      audio_spotcheck: {
        narration_present: false,
        music_present: true,
        caption_sync_accuracy: 0.98,
        findings: [],
      },
      promise_preservation: {
        delivery_promise_honored: false,
        silent_downgrade_detected: true,
        runtime_swap_detected: false,
        runtime_swap_check: "ok",
        motion_ratio_actual: 0.2,
        render_runtime_used: "remotion",
        findings: [],
      },
      subtitle_check: {
        present: true,
        accuracy_within_150ms: 0.98,
      },
    },
    issues_found: [],
  };
}

function fixedNow(): Date {
  return new Date("2026-05-12T15:42:00.000Z");
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

function captureProgram() {
  const output = captureIo();
  return {
    program: createProgram(output.io),
    output,
  };
}

function logger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function tool(input: { name: string; available: boolean; reason?: string; fix?: "env" | "install" | "cli-login" | "manual" }): Tool {
  return {
    name: input.name,
    capability: "research",
    provider: "test",
    status: "beta",
    integration: { kind: "library", package: "test", install: "none" },
    best_for: "tests",
    input: z.unknown(),
    output: z.unknown(),
    async isAvailable() {
      return input.available ? { available: true } : { available: false, reason: input.reason ?? "unavailable", fix: input.fix };
    },
    async execute(params: unknown) {
      return params;
    },
  };
}
