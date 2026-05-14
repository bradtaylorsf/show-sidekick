import { describe, expect, it } from "vitest";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import { Registry } from "../registry/index.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { createStageContext } from "./context.js";
import { createExternalAgentDispatcher, createStubDispatcher } from "./dispatcher.js";
import { awaitStageEvent, type StageEvent } from "./events.js";
import type { StageResult } from "./result.js";

describe("stage dispatchers", () => {
  it("returns deterministic stage fixtures from the in-process stub dispatcher", async () => {
    const result = stageResult({ ok: true });
    const dispatcher = createStubDispatcher({ idea: result });

    await expect(dispatcher(contextForStage("idea"))).resolves.toEqual(result);
  });

  it("throws when the stub dispatcher has no fixture for the stage", async () => {
    const dispatcher = createStubDispatcher({});

    await expect(dispatcher(contextForStage("missing"))).rejects.toThrow(
      "no stub fixture registered for stage 'missing'",
    );
  });

  it("emits a start event and resolves an external-agent completion event", async () => {
    const emitted: StageEvent[] = [];
    let waitPredicate: ((event: StageEvent) => boolean) | undefined;
    const completion = deferred<StageEvent>();
    const result = stageResult({ script: "four beats" });
    const dispatcher = createExternalAgentDispatcher({
      now: () => new Date("2026-05-12T15:42:00Z"),
      emit(event) {
        emitted.push(event);
      },
      wait(predicate) {
        waitPredicate = predicate;
        return completion.promise;
      },
    });

    const dispatched = dispatcher(contextForStage("script"));
    await Promise.resolve();

    expect(emitted).toEqual([
      {
        event: "stage_started",
        stage: "script",
        timestamp: "2026-05-12T15:42:00.000Z",
        payload: {
          stage: stage("script"),
          sample: false,
        },
      },
    ]);
    expect(waitPredicate?.({ event: "stage_completed", stage: "idea", timestamp: "2026-05-12T15:43:00Z" })).toBe(
      false,
    );

    const completed: StageEvent = {
      event: "stage_completed",
      stage: "script",
      timestamp: "2026-05-12T15:43:00Z",
      payload: result,
    };
    expect(waitPredicate?.(completed)).toBe(true);
    completion.resolve(completed);

    await expect(dispatched).resolves.toEqual(result);
  });
});

describe("stage events", () => {
  it("waits for the first matching NDJSON stage event", async () => {
    const result = stageResult({ done: true });
    const event = await awaitStageEvent(
      chunks([
        `${JSON.stringify({ event: "stage_started", stage: "idea", timestamp: "2026-05-12T15:42:00Z" })}\n`,
        `${JSON.stringify({
          event: "stage_completed",
          stage: "script",
          timestamp: "2026-05-12T15:43:00Z",
          payload: result,
        })}\n`,
      ]),
      (candidate) => candidate.event === "stage_completed" && candidate.stage === "script",
    );

    expect(event.payload).toEqual(result);
  });
});

function contextForStage(stageSlug: string) {
  const show = loadedShow();

  return createStageContext({
    show,
    episode: loadedEpisode(show),
    pipeline: pipelineManifest(),
    stage: stage(stageSlug),
    playbook: {},
    registry: new Registry({ tools: [] }),
  });
}

function loadedShow(): LoadedShow {
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
    projectRoot: "/project",
    rootDir: "/project/shows/show",
  };
}

function loadedEpisode(show: LoadedShow): LoadedEpisode {
  return {
    slug: "episode",
    title: "Episode",
    created: new Date("2026-05-12T00:00:00Z"),
    inputs: {},
    cast: [],
    filePath: `${show.rootDir}/episodes/episode.yaml`,
  };
}

function pipelineManifest(): PipelineManifest {
  return {
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

function stageResult(artifact: unknown): StageResult {
  return {
    artifact,
    cost_used: {
      stage_cost_usd: 0.1,
      total_so_far_usd: 0.5,
      budget_remaining_usd: 2.5,
    },
    decisions: [],
    review_summary: {
      rounds: 1,
      critical: 0,
      suggestions: 0,
      nitpicks: 0,
      findings: [],
    },
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

async function* chunks(values: string[]): AsyncIterable<string> {
  for (const value of values) {
    yield value;
  }
}
