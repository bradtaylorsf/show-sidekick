import type { StageContext } from "./context.js";
import type { StageEvent } from "./events.js";
import { StageResultSchema, type StageResult } from "./result.js";

export type Dispatcher = (ctx: StageContext) => Promise<StageResult>;

export type ExternalAgentDispatcherOptions = {
  emit(event: StageEvent): void | Promise<void>;
  wait(predicate: (event: StageEvent) => boolean): Promise<StageEvent>;
  now?: () => Date;
};

export function createStubDispatcher(fixtures: Record<string, StageResult>): Dispatcher {
  return async (ctx) => {
    const fixture = fixtures[ctx.stage.slug];

    if (!fixture) {
      throw new Error(`no stub fixture registered for stage '${ctx.stage.slug}'`);
    }

    return StageResultSchema.parse(fixture);
  };
}

export function createExternalAgentDispatcher(options: ExternalAgentDispatcherOptions): Dispatcher {
  return async (ctx) => {
    await options.emit({
      event: "stage_started",
      stage: ctx.stage.slug,
      timestamp: (options.now?.() ?? new Date()).toISOString(),
      payload: {
        stage: ctx.stage,
        sample: ctx.runOptions.sample,
      },
    });

    const completed = await options.wait((event) => {
      return event.event === "stage_completed" && event.stage === ctx.stage.slug;
    });

    return StageResultSchema.parse(completed.payload);
  };
}
