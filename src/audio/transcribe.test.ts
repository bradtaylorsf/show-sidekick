import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.unstubAllEnvs();
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
    const decisions: unknown[] = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local", 0.9)]),
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("scribe", 0.99)]),
      ],
    });

    const result = await transcribe(track(), {
      registry,
      prefer: ["elevenlabs-scribe"],
      logger: captureLogger([]),
      decisionTimestamp: "2026-05-13T12:00:00.000Z",
      recordDecision: async (entry) => {
        decisions.push(entry);
      },
    });

    expect(scribeCalls).toHaveLength(1);
    expect(whisperCalls).toHaveLength(0);
    expect(result.segments[0]?.text).toBe("scribe");
    expect(decisions).toContainEqual(
      expect.objectContaining({
        id: "transcription_provider-2026-05-13T12-00-00-000Z",
        category: "provider_selection",
        scope: { capability: "transcribe", provider: "elevenlabs-scribe" },
        picked: "elevenlabs-scribe",
      }),
    );
  });

  it("falls back to whisper-cpp when preferred Scribe is unavailable and records the selection", async () => {
    const whisperCalls: ToolCall[] = [];
    const scribeCalls: ToolCall[] = [];
    const decisions: unknown[] = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("scribe", 0.99)], {
          available: false,
          reason: "missing env: ELEVENLABS_API_KEY",
          fix: "env",
        }),
        transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local", 0.9)]),
      ],
    });

    const result = await transcribe(track(), {
      registry,
      prefer: ["elevenlabs-scribe"],
      logger: captureLogger([]),
      decisionTimestamp: "2026-05-13T12:30:00.000Z",
      recordDecision: async (entry) => {
        decisions.push(entry);
      },
    });

    expect(scribeCalls).toHaveLength(0);
    expect(whisperCalls).toEqual([{ audio_path: "/tmp/audio.wav", model: "medium.en" }]);
    expect(result.segments[0]?.text).toBe("local");
    expect(decisions).toContainEqual(
      expect.objectContaining({
        id: "transcription_provider-2026-05-13T12-30-00-000Z",
        category: "provider_selection",
        scope: { capability: "transcribe", provider: "whisper-cpp" },
        picked: "whisper-cpp",
        options_considered: expect.arrayContaining([
          expect.objectContaining({
            label: "elevenlabs-scribe",
            rejected_because: expect.stringContaining("unavailable"),
          }),
        ]),
      }),
    );
  });

  it("keeps local whisper-cpp when an ElevenLabs key makes Scribe available but nothing prefers it", async () => {
    const whisperCalls: ToolCall[] = [];
    const scribeCalls: ToolCall[] = [];
    const events: Array<{ name: string; payload?: unknown }> = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("scribe", 0.99)]),
        transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local narration", 0.9)]),
      ],
    });

    const result = await transcribe(track(), { registry, logger: captureLogger(events) });

    expect(scribeCalls).toHaveLength(0);
    expect(whisperCalls).toEqual([{ audio_path: "/tmp/audio.wav", model: "medium.en" }]);
    expect(result.segments[0]?.text).toBe("local narration");
    expect(events).toEqual([]);
  });

  it("honors TRANSCRIPTION_PROVIDER=elevenlabs-scribe and never forwards a whisper model name", async () => {
    vi.stubEnv("TRANSCRIPTION_PROVIDER", "elevenlabs-scribe");
    vi.stubEnv("WHISPER_MODEL", "/models/ggml-medium.en.bin");
    const whisperCalls: ToolCall[] = [];
    const scribeCalls: ToolCall[] = [];
    const events: Array<{ name: string; payload?: unknown }> = [];
    const decisions: Array<{ reason?: string }> = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local", 0.9)]),
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("♪ la la la", 0.99)]),
      ],
    });

    await transcribe(track(), {
      registry,
      model: "medium.en",
      logger: captureLogger(events),
      recordDecision: async (entry) => {
        decisions.push(entry);
      },
    });

    expect(whisperCalls).toHaveLength(0);
    expect(scribeCalls).toEqual([{ audio_path: "/tmp/audio.wav" }]);
    expect(events[0]).toMatchObject({
      name: "provider_selection",
      payload: { picked: "elevenlabs-scribe", pinned: "elevenlabs-scribe" },
    });
    expect(decisions[0]?.reason).toBe("elevenlabs-scribe selected because TRANSCRIPTION_PROVIDER=elevenlabs-scribe.");
    expect(JSON.stringify(events)).not.toContain("sung-vocal");
  });

  it("honors TRANSCRIPTION_PROVIDER=whisper-cpp over a caller preference for Scribe", async () => {
    vi.stubEnv("TRANSCRIPTION_PROVIDER", "whisper-cpp");
    const whisperCalls: ToolCall[] = [];
    const scribeCalls: ToolCall[] = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("scribe", 0.99)]),
        transcriptionTool("whisper-cpp", "whisper", whisperCalls, [segment("local", 0.9)]),
      ],
    });

    await transcribe(track(), { registry, prefer: ["elevenlabs-scribe"], logger: captureLogger([]) });

    expect(scribeCalls).toHaveLength(0);
    expect(whisperCalls).toHaveLength(1);
  });

  it("fails clearly when the pinned provider is unavailable", async () => {
    vi.stubEnv("TRANSCRIPTION_PROVIDER", "scribe");
    const registry = new Registry({
      tools: [
        transcriptionTool("elevenlabs-scribe", "transcribe", [], [segment("scribe", 0.99)], {
          available: false,
          reason: "missing env: ELEVENLABS_API_KEY",
          fix: "env",
        }),
        transcriptionTool("whisper-cpp", "whisper", [], [segment("local", 0.9)]),
      ],
    });

    await expect(transcribe(track(), { registry, logger: captureLogger([]) })).rejects.toThrow(
      "TRANSCRIPTION_PROVIDER=elevenlabs-scribe but elevenlabs-scribe is not available",
    );
  });

  it("falls back to Scribe only when local whisper-cpp is unavailable, with a matching reason", async () => {
    const scribeCalls: ToolCall[] = [];
    const decisions: Array<{ reason?: string }> = [];
    const registry = new Registry({
      tools: [
        transcriptionTool("whisper-cpp", "whisper", [], [segment("local", 0.9)], {
          available: false,
          reason: "binary not on PATH: whisper-cli or whisper-cpp",
          fix: "install",
        }),
        transcriptionTool("elevenlabs-scribe", "transcribe", scribeCalls, [segment("scribe", 0.99)]),
      ],
    });

    await transcribe(track(), {
      registry,
      logger: captureLogger([]),
      recordDecision: async (entry) => {
        decisions.push(entry);
      },
    });

    expect(scribeCalls).toEqual([{ audio_path: "/tmp/audio.wav" }]);
    expect(decisions[0]?.reason).toBe("elevenlabs-scribe selected because local whisper-cpp is unavailable.");
  });

  it("lets the whisper tool resolve WHISPER_MODEL instead of forcing medium.en", async () => {
    vi.stubEnv("WHISPER_MODEL", "/models/ggml-base.en.bin");
    const calls: ToolCall[] = [];
    const registry = new Registry({
      tools: [transcriptionTool("whisper-cpp", "whisper", calls, [segment("hello", 0.96)])],
    });

    await transcribe(track(), { registry });

    expect(calls).toEqual([{ audio_path: "/tmp/audio.wav" }]);
  });

  it("keeps the first transcript when the large-v3 retry cannot run", async () => {
    const calls: ToolCall[] = [];
    const warnings: string[] = [];
    let attempt = 0;
    const flaky = transcriptionTool("whisper-cpp", "whisper", calls, [segment("♪ la la clean", 0.91)]);
    const execute = flaky.execute.bind(flaky);
    flaky.execute = async (params, ctx) => {
      attempt += 1;
      if (attempt === 2) {
        throw new Error("whisper model 'large-v3' not found");
      }
      return execute(params, ctx);
    };

    const result = await transcribe(track(), {
      registry: new Registry({ tools: [flaky] }),
      logger: { ...captureLogger([]), warn: (message: string) => warnings.push(message) },
    });

    expect(result.segments[0]?.text).toBe("♪ la la clean");
    expect(warnings[0]).toContain("large-v3");
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
    provider: "show-sidekick",
    status: "beta",
    integration: { kind: "library", package: "show-sidekick", install: "npm install show-sidekick" },
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
