import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Registry } from "../registry/registry.js";
import type { ToolContext } from "../registry/tool.js";
import doubaoTts from "./doubao_tts.js";
import elevenlabsTts from "./elevenlabs_tts.js";
import googleTts from "./google_tts.js";
import openaiTts from "./openai_tts.js";
import piperTts from "./piper_tts.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(projectRoot = "/project", overrides: Partial<ToolContext> = {}): ToolContext {
  return { projectRoot, logger: noopLogger(), ...overrides };
}

type FetchCall = [string, { method?: string; headers?: Record<string, string>; body?: string }];

const providers = [
  {
    tool: elevenlabsTts,
    name: "elevenlabs_tts",
    provider: "elevenlabs",
    status: "production",
    integration: { kind: "api", env: ["ELEVENLABS_API_KEY"] },
    cost: { unit: "token", usd: 0.0003 },
    skills: ["elevenlabs"],
  },
  {
    tool: openaiTts,
    name: "openai_tts",
    provider: "openai",
    status: "production",
    integration: { kind: "api", env: ["OPENAI_API_KEY"] },
    cost: { unit: "token", usd: 0.000015 },
    skills: ["openai-tts"],
  },
  {
    tool: googleTts,
    name: "google_tts",
    provider: "google",
    status: "production",
    integration: { kind: "api", env: ["GOOGLE_API_KEY"] },
    cost: { unit: "token", usd: 0.000016 },
    skills: ["google-tts"],
  },
  {
    tool: piperTts,
    name: "piper_tts",
    provider: "piper",
    status: "production",
    integration: { kind: "binary", binary: "piper" },
    cost: { unit: "call", usd: 0 },
    skills: ["piper"],
  },
  {
    tool: doubaoTts,
    name: "doubao_tts",
    provider: "doubao",
    status: "beta",
    integration: { kind: "api", env: ["DOUBAO_API_KEY", "DOUBAO_APP_ID"] },
    cost: { unit: "token", usd: 0.00002 },
    skills: ["doubao-tts"],
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TTS provider tools", () => {
  it("declares TTS metadata, integration, costs, and Layer 3 skills", () => {
    for (const spec of providers) {
      expect(spec.tool).toMatchObject({
        name: spec.name,
        capability: "tts",
        provider: spec.provider,
        status: spec.status,
        integration: spec.integration,
        cost: spec.cost,
        agent_skills: spec.skills,
      });
    }
  });

  it("validates the shared narration fixture input shape", () => {
    for (const spec of providers) {
      expect(spec.tool.input.parse({ text: "hi", voice_id: "fixture-voice", language: "en-US" })).toMatchObject({
        text: "hi",
        voice_id: "fixture-voice",
        language: "en-US",
      });
      expect(() => spec.tool.input.parse({ text: "" })).toThrow();
    }
  });

  it("posts ElevenLabs, OpenAI, and Doubao documented request shapes", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "audio-request-1", audio_path: "projects/show/episode/audio/out.mp3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await elevenlabsTts.execute(
      elevenlabsTts.input.parse({ text: "fixture narration", voice_id: "voice-123", format: "mp3_44100_128" }),
      context(),
    );
    let [url, options] = fetchMock.mock.calls[0] as FetchCall;
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voice-123");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(expect.objectContaining({ "xi-api-key": "<ELEVENLABS_API_KEY>" }));
    expect(JSON.parse(options.body ?? "{}")).toMatchObject({
      text: "fixture narration",
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
    });

    fetchMock.mockClear();
    await openaiTts.execute(openaiTts.input.parse({ text: "fixture narration", voice_id: "alloy" }), context());
    [url, options] = fetchMock.mock.calls[0] as FetchCall;
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: "Bearer <OPENAI_API_KEY>" }));
    expect(JSON.parse(options.body ?? "{}")).toMatchObject({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: "fixture narration",
      format: "mp3",
    });

    fetchMock.mockClear();
    await doubaoTts.execute(doubaoTts.input.parse({ text: "fixture narration", voice_id: "doubao-voice" }), context());
    [url, options] = fetchMock.mock.calls[0] as FetchCall;
    expect(url).toBe("https://openspeech.bytedance.com/api/v1/tts");
    expect(options.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer <DOUBAO_API_KEY>",
        "X-Api-App-Id": "<DOUBAO_APP_ID>",
      }),
    );
    expect(JSON.parse(options.body ?? "{}")).toMatchObject({
      audio: { voice_type: "doubao-voice", encoding: "mp3" },
      request: { text: "fixture narration", operation: "query" },
    });
  });

  it("resolves ElevenLabs voice IDs from character voice_id.txt files", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-elevenlabs-"));
    await mkdir(join(projectRoot, "characters", "narrator"), { recursive: true });
    await writeFile(join(projectRoot, "characters", "narrator", "voice_id.txt"), "character-voice\n");
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ audio_path: "projects/show/episode/audio/out.mp3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await elevenlabsTts.execute(elevenlabsTts.input.parse({ text: "fixture", voice_name: "narrator" }), context(projectRoot));

    expect((fetchMock.mock.calls[0] as FetchCall)[0]).toBe("https://api.elevenlabs.io/v1/text-to-speech/character-voice");
  });

  it("decodes Google TTS audioContent into narration audio", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-google-tts-"));
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ name: "google-request-1", audioContent: Buffer.from("audio bytes").toString("base64") }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleTts.execute(googleTts.input.parse({ text: "fixture narration" }), context(projectRoot));
    const [url, options] = fetchMock.mock.calls[0] as FetchCall;

    expect(url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual(expect.objectContaining({ "x-goog-api-key": "<GOOGLE_API_KEY>" }));
    expect(JSON.parse(options.body ?? "{}")).toMatchObject({
      input: { text: "fixture narration" },
      voice: { name: "en-US-Chirp3-HD-Charon", languageCode: "en-US" },
      audioConfig: { audioEncoding: "MP3" },
    });
    await expect(readFile(result.audio_path, "utf8")).resolves.toBe("audio bytes");
  });

  it("runs Piper through the binary integration with stdin narration text", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-piper-"));
    const runCli = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const result = await piperTts.execute(
      piperTts.input.parse({ text: "local narration", voice_id: "voices/en_US-lessac-medium.onnx" }),
      context(projectRoot, { runCli }),
    );

    expect(runCli).toHaveBeenCalledWith(
      "piper",
      [
        "--model",
        "voices/en_US-lessac-medium.onnx",
        "--output_file",
        expect.stringContaining(`${projectRoot}/projects/_tool_runs/audio/piper-`),
      ],
      { cwd: projectRoot, input: "local narration" },
    );
    expect(result).toMatchObject({
      audio_path: expect.stringContaining(`${projectRoot}/projects/_tool_runs/audio/piper-`),
      cost_usd: 0,
    });
  });

  it("lets registry.select route TTS providers by preference and availability", async () => {
    const registry = new Registry({ tools: [elevenlabsTts, openaiTts, googleTts, piperTts, doubaoTts] });
    const originalIsAvailable = new Map(providers.map((spec) => [spec.tool.name, spec.tool.isAvailable]));

    try {
      for (const spec of providers) {
        spec.tool.isAvailable = async () =>
          spec.tool.name === "piper_tts" ? { available: true } : { available: false, reason: "missing env", fix: "env" };
      }

      expect(registry.byCapability("tts").map((tool) => tool.name)).toEqual([
        "elevenlabs_tts",
        "openai_tts",
        "google_tts",
        "piper_tts",
        "doubao_tts",
      ]);
      await expect(registry.select("tts", { prefer: ["piper_tts"] })).resolves.toMatchObject({ name: "piper_tts" });
    } finally {
      for (const spec of providers) {
        const original = originalIsAvailable.get(spec.tool.name);
        if (original) {
          spec.tool.isAvailable = original;
        }
      }
    }
  });

  it("surfaces non-2xx provider responses with the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 })),
    );

    await expect(openaiTts.execute(openaiTts.input.parse({ text: "fixture" }), context())).rejects.toThrow(
      "openai TTS request failed (400): bad request",
    );
  });
});
