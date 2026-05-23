import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Checkpoint, CheckpointStatus } from "../checkpoints/index.js";
import { writeCheckpoint } from "../checkpoints/index.js";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import { Registry } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { createStageContext, loadPriorArtifacts } from "./context.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-stage-context-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("stage context", () => {
  it("constructs a fixture context with every stage execution field", () => {
    const registry = new Registry({ tools: [] });
    const show = loadedShow("/project");
    const episode = loadedEpisode(show);
    const pipeline = pipelineManifest();
    const currentStage = stage("script");
    const playbook = { palette: "high-contrast" };
    const priorArtifacts = { idea: { concept: "sharp opening" } };
    const cuesheet = { duration_s: 12 };

    const ctx = createStageContext({
      show,
      episode,
      pipeline,
      stage: currentStage,
      playbook,
      priorArtifacts,
      registry,
      cuesheet,
      runOptions: {
        sample: true,
        budget_usd: 7,
        dryRun: true,
        from: "idea",
        to: "assets",
        only: "script",
        nonInteractive: true,
      },
      revisionNotes: ["tighten the hook"],
      skillsRead: ["pipelines/music-video/idea-director.md"],
    });

    expect(ctx.show).toBe(show);
    expect(ctx.episode).toBe(episode);
    expect(ctx.pipeline).toBe(pipeline);
    expect(ctx.stage).toBe(currentStage);
    expect(ctx.playbook).toBe(playbook);
    expect(ctx.priorArtifacts).toBe(priorArtifacts);
    expect(ctx.registry).toBe(registry);
    expect(ctx.cuesheet).toBe(cuesheet);
    expect(ctx.runOptions).toEqual({
      sample: true,
      budget_usd: 7,
      dryRun: true,
      from: "idea",
      to: "assets",
      only: "script",
      nonInteractive: true,
    });

    ctx.markSkillRead("pipelines/music-video/script-director.md");
    ctx.markSkillRead("pipelines/music-video/script-director.md");
    expect(ctx.skills_read).toEqual([
      "pipelines/music-video/idea-director.md",
      "pipelines/music-video/script-director.md",
    ]);

    ctx.revision_notes.push("make the ending less abrupt");
    expect(ctx.revision_notes).toEqual(["tighten the hook", "make the ending less abrupt"]);
  });

  it("defaults run options, prior artifacts, skills, and revision notes", () => {
    const ctx = createStageContext({
      show: loadedShow("/project"),
      episode: loadedEpisode(loadedShow("/project")),
      pipeline: pipelineManifest(),
      stage: stage("idea"),
      playbook: {},
      registry: new Registry({ tools: [] }),
    });

    expect(ctx.priorArtifacts).toEqual({});
    expect(ctx.runOptions).toEqual({ sample: false });
    expect(ctx.revision_notes).toEqual([]);
    expect(ctx.skills_read).toEqual([]);
  });

  it("loads prior artifacts from completed and awaiting-human checkpoints", async () => {
    const root = await scratchProject();
    const show = loadedShow(root);
    const episode = loadedEpisode(show);
    const pipeline = pipelineManifest();

    await writeCheckpoint(root, show.slug, episode.slug, "idea", checkpoint("idea", "completed", { concept: "one" }));
    await writeCheckpoint(root, show.slug, episode.slug, "script", checkpoint("script", "awaiting_human", { beats: 4 }));
    await writeCheckpoint(root, show.slug, episode.slug, "assets", checkpoint("assets", "failed", { ignored: true }));
    await writeCheckpoint(root, show.slug, episode.slug, "orphan", checkpoint("orphan", "completed", { ignored: true }));

    await expect(loadPriorArtifacts(root, show, episode, pipeline)).resolves.toEqual({
      idea: { concept: "one" },
      idea_artifact: { concept: "one" },
      script: { beats: 4 },
      script_artifact: { beats: 4 },
    });
  });

  it("loads canonical artifact names and nested produced artifacts from checkpoints", async () => {
    const root = await scratchProject();
    const show = loadedShow(root);
    const episode = loadedEpisode(show);
    const pipeline: PipelineManifest = {
      ...pipelineManifest(),
      stages: [
        {
          ...stage("capture"),
          produces: "deck_manifest",
          produces_artifacts: ["deck_manifest", "capture_manifest"],
        },
      ],
    };
    const deckManifest = { slides: [{ id: "slide_0001" }] };
    const captureManifest = { screenshots: [{ story_id: "slide_0001" }] };

    await writeCheckpoint(
      root,
      show.slug,
      episode.slug,
      "capture",
      checkpoint("capture", "completed", { deck_manifest: deckManifest, capture_manifest: captureManifest }),
    );

    await expect(loadPriorArtifacts(root, show, episode, pipeline)).resolves.toEqual({
      capture: { deck_manifest: deckManifest, capture_manifest: captureManifest },
      deck_manifest: deckManifest,
      capture_manifest: captureManifest,
    });
  });
});

function loadedShow(projectRoot: string): LoadedShow {
  return {
    slug: "show",
    display_name: "Show",
    created: new Date("2026-05-12T00:00:00Z"),
    pipelines: {
      default: {},
    },
    defaults: {
      pipeline: "default",
    },
    projectRoot,
    rootDir: path.join(projectRoot, "shows", "show"),
  };
}

function loadedEpisode(show: LoadedShow): LoadedEpisode {
  return {
    slug: "episode",
    title: "Episode",
    created: new Date("2026-05-12T00:00:00Z"),
    inputs: {},
    cast: [],
    filePath: path.join(show.rootDir, "episodes", "episode.yaml"),
  };
}

function pipelineManifest(): PipelineManifest {
  return {
    slug: "music-video",
    stages: [stage("idea"), stage("script"), stage("assets")],
    orchestration: {
      budget_default_usd: 3,
      cost_drift_threshold: 1.3,
      max_revisions_per_stage: 2,
      max_send_backs: 3,
      max_wall_time_minutes: 30,
    },
  };
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
    human_approval: "optional",
  };
}

function checkpoint(stageSlug: string, status: CheckpointStatus, artifact: unknown): Checkpoint {
  return {
    stage: stageSlug,
    status,
    timestamp: "2026-05-12T15:42:00Z",
    artifact,
    tool_invocations: [],
  };
}
