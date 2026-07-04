import { z } from "zod";

export const StageEventSchema = z.object({
  event: z.enum(["stage_started", "stage_completed", "stage_failed"]),
  stage: z.string(),
  timestamp: z.string(),
  payload: z.unknown().optional(),
});

export type StageEvent = z.infer<typeof StageEventSchema>;

export async function awaitStageEvent(
  stream: AsyncIterable<string | Uint8Array>,
  predicate: (event: StageEvent) => boolean,
): Promise<StageEvent> {
  let buffer = "";

  for await (const chunk of stream) {
    buffer += typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseEventLine(line);
      if (event && predicate(event)) {
        return event;
      }
    }
  }

  const trailingEvent = parseEventLine(buffer);
  if (trailingEvent && predicate(trailingEvent)) {
    return trailingEvent;
  }

  throw new Error("stream ended before a matching stage event was emitted");
}

export type StageEventWaiter = (predicate: (event: StageEvent) => boolean) => Promise<StageEvent>;

/**
 * Persistent multi-wait reader over one NDJSON stream. Unlike awaitStageEvent,
 * which closes the stream's iterator when its `for await` returns, this keeps a
 * single iterator alive across calls so revision rounds and later stages can
 * keep reading the same stdin. Non-matching events are buffered for future waits.
 */
export function createStageEventWaiter(stream: AsyncIterable<string | Uint8Array>): StageEventWaiter {
  const iterator = stream[Symbol.asyncIterator]();
  const pending: StageEvent[] = [];
  let buffer = "";
  let ended = false;

  return async function waitForStageEvent(predicate) {
    const buffered = takeMatching(pending, predicate);
    if (buffered !== undefined) {
      return buffered;
    }

    while (!ended) {
      const { value, done } = await iterator.next();
      if (done) {
        ended = true;
        break;
      }

      buffer += typeof value === "string" ? value : new TextDecoder().decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseEventLine(line);
        if (event) {
          pending.push(event);
        }
      }

      const match = takeMatching(pending, predicate);
      if (match !== undefined) {
        return match;
      }
    }

    const trailingEvent = parseEventLine(buffer);
    buffer = "";
    if (trailingEvent) {
      pending.push(trailingEvent);
    }

    const match = takeMatching(pending, predicate);
    if (match !== undefined) {
      return match;
    }

    throw new Error("stream ended before a matching stage event was emitted");
  };
}

function takeMatching(pending: StageEvent[], predicate: (event: StageEvent) => boolean): StageEvent | undefined {
  const index = pending.findIndex(predicate);
  if (index === -1) {
    return undefined;
  }

  return pending.splice(index, 1)[0];
}

function parseEventLine(line: string): StageEvent | undefined {
  const trimmed = line.trim();

  if (trimmed === "") {
    return undefined;
  }

  const parsed = StageEventSchema.safeParse(JSON.parse(trimmed) as unknown);
  if (!parsed.success) {
    throw new Error(`invalid stage event: ${parsed.error.message}`);
  }

  return parsed.data;
}
