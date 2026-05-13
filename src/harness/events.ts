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
