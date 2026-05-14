import { z } from "zod";
import { describe, expect, it } from "vitest";
import { defineTool, Registry, type Availability, type Tool } from "../registry/index.js";
import { transcribe } from "./transcribe.js";
import type { AudioTrack, Segment } from "./types.js";

type ToolCall = {
  audio_path: string;
  language?: string;
  model?: string;
};

const toolInput = z.object({
  audio_path: z.string(),
  language: z.string().optional(),
  model: z.string().optional(),
});

const toolOutput = z.object({
  segments: z.array(
    z.object({
      start_s: z.number(),
      end_s: z.number(),
      text: z.string(),
      words: z.array(
        z.object({
          text: z.string(),
          start_s: z.number(),
          end_s: z.number(),
          confidence: z.number(),
        }),
      ),
    }),
  ),
});

describe("transcribe", () => {
  it("uses medium.en by default for English audio", async () => {
    const calls: ToolCall[] = [];
    const registry = new Registry({
      tools: [transcriptionTool("whisper-cpp", "whisper", calls, [segment("hello", 0.96)])],
    });

    const result = await transcribe(track(), { registry });

    expect(calls).toEqual([{ audio_path: "/tmp/audio.wav", model: "medium.en" }]);
    expect(result.segments[0]?.words[0]).toMatchObject({ text: "hello", confidence: 0.96 });
    expect(result.low_confidence).toBe(false);
  });

  it("uses medium and forwards --language for non-English audio", async () => {
    const calls: ToolCall[] = [];
    const registry = new Registry({
      tools: [transcriptionTool("whisper-cpp", "whisper", calls, [segment("bonjour", 0.95)])],
    });

    await transcribe(track(), { language: "fr", registry });

    expect(calls).toEqual([{ audio_path: "/tmp/audio.wav", language: "fr", model: "medium" }]);
  });

  it("retries with large-v3 when music symbols exceed 20 percent of tokens", async () => {
    const calls: ToolCall[] = [];
    const events: Array<{ name: string; payload?: unknown }> = [];
    const decisions: unknown[] = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("whisper-cpp", "whisper", calls, [
          segment("♪ la la clean", 0.91),
          segment("clean final words", 0.93),
        ]),
      ],
    });

    const result = await transcribe(track(), {
      registry,
      logger: captureLogger(events),
      recordDecision: async (entry) => {
        decisions.push(entry);
      },
      decisionTimestamp: "2026-05-13T12:00:00.000Z",
    });

    expect(calls.map((call) => call.model)).toEqual(["medium.en", "large-v3"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "provider_selection",
      payload: { picked: "large-v3", reason: "music_symbol_ratio>0.20", initial: "medium.en" },
    });
    expect(decisions).toContainEqual(
      expect.objectContaining({
        id: "transcription_retry-2026-05-13T12-00-00-000Z",
        stage: "cuesheet",
        category: "provider_selection",
        scope: { capability: "transcribe", provider: "whisper-cpp" },
        picked: "whisper-cpp:large-v3",
        options_considered: expect.arrayContaining([
          expect.objectContaining({ label: "whisper-cpp:medium.en", rejected_because: expect.stringContaining("retry required") }),
          expect.objectContaining({ label: "whisper-cpp:large-v3", rejected_because: null }),
        ]),
        user_visible: true,
      }),
    );
    expect(result.segments[0]?.text).toBe("clean final words");
  });

  it("marks low-confidence transcripts for script-stage review", async () => {
    const calls: ToolCall[] = [];
    const registry = new Registry({
      tools: [transcriptionTool("whisper-cpp", "whisper", calls, [segment("unclear line", 0.7)])],
    });

    const result = await transcribe(track(), { registry });

    expect(result.average_confidence).toBeCloseTo(0.7);
    expect(result.low_confidence).toBe(true);
  });

  it("uses a preferred alternative transcriber when registered and available", async () => {
    const whisperCalls: ToolCall[] = [];
    const scribeCalls: ToolCall[] = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local", 0.9)]),
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("scribe", 0.99)]),
      ],
    });

    const result = await transcribe(track(), { registry, prefer: ["elevenlabs-scribe"] });

    expect(scribeCalls).toHaveLength(1);
    expect(whisperCalls).toHaveLength(0);
    expect(result.segments[0]?.text).toBe("scribe");
  });

  it("skips provider-selection markers when selecting a concrete transcriber", async () => {
    const whisperCalls: ToolCall[] = [];
    const registry = new Registry({
      tools: [transcriberMarker(), transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local", 0.9)])],
    });

    await transcribe(track(), { registry, prefer: ["transcriber"] });

    expect(whisperCalls).toEqual([{ audio_path: "/tmp/audio.wav", model: "medium.en" }]);
  });
});

function track(): AudioTrack {
  return {
    path: "/tmp/audio.wav",
    duration_s: 3,
    sample_rate: 44_100,
    channels: 1,
  };
}

function segment(text: string, confidence: number): Segment {
  const tokens = text.split(/\s+/u);
  return {
    start_s: 0,
    end_s: tokens.length,
    text,
    words: tokens.map((token, index) => ({
      text: token,
      start_s: index,
      end_s: index + 0.8,
      confidence,
    })),
  };
}

function transcriptionTool(
  name: string,
  capability: string,
  calls: ToolCall[],
  responses: Segment[],
  availability: Availability = { available: true },
): Tool<ToolCall, { segments: Segment[] }> {
  let callIndex = 0;

  return defineTool({
    name,
    capability,
    provider: name,
    status: "production",
    integration: { kind: "binary", binary: name, install: `install ${name}` },
    best_for: "test transcription",
    input: toolInput,
    output: toolOutput,
    async isAvailable() {
      return availability;
    },
    async execute(params) {
      calls.push(params);
      const response = responses[Math.min(callIndex, responses.length - 1)];
      callIndex += 1;

      return { segments: response === undefined ? [] : [response] };
    },
  });
}

function transcriberMarker(): Tool<ToolCall, { segments: Segment[] }> {
  return defineTool({
    name: "transcriber",
    capability: "transcriber",
    provider: "predit",
    status: "beta",
    integration: { kind: "library", package: "predit", install: "pnpm add predit" },
    best_for: "marker",
    supports: ["provider-selection"],
    input: toolInput,
    output: toolOutput,
    isAvailable: async () => ({ available: true }),
    async execute() {
      throw new Error("marker should not execute");
    },
  });
}

function captureLogger(events: Array<{ name: string; payload?: unknown }>) {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    event(name: string, payload?: unknown) {
      events.push({ name, payload });
    },
  };
}
