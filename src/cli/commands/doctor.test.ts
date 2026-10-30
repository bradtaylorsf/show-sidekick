import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { Registry, defineTool, type Availability, type Integration } from "../../registry/index.js";
import { fakeComfy, installedModels } from "../../comfy/__fixtures__/fake-comfy.js";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLocalAudio, checkLocalComfy, createDoctorHandler, type DoctorRow } from "./doctor.js";
import { z } from "zod";

function captureIo() {
  let stdout = "";
  return {
    io: {
      stdout: {
        write(value: string) {
          stdout += value;
          return true;
        },
      },
      stderr: { write: () => true },
    },
    stdout: () => stdout,
  };
}

function command(options: Record<string, unknown> = {}): Command {
  return { optsWithGlobals: () => options } as unknown as Command;
}

describe("doctor command", () => {
  it("prints setup instructions for missing paid-demo credentials without throwing", async () => {
    const capture = captureIo();
    const registry = paidDemoRegistry();

    await createDoctorHandler(capture.io, {
      createRegistry: async () => registry,
      probeIntegration: async (integration) => {
        if (integration.kind === "api") {
          return { available: false, reason: `missing env: ${integration.env.join(", ")}`, fix: "env" };
        }
        return { available: true };
      },
    })(command());

    expect(capture.stdout()).toContain("doctor: paid-demo provider profile");
    expect(capture.stdout()).toContain("missing OPENAI_API_KEY");
    expect(capture.stdout()).toContain("setup: Set OPENAI_API_KEY to an OpenAI API key.");
    expect(capture.stdout()).toContain("missing ELEVENLABS_API_KEY");
    expect(capture.stdout()).toContain("setup: Set ELEVENLABS_API_KEY to an ElevenLabs API key.");
  });

  it("emits one NDJSON doctor event per paid-demo preflight check", async () => {
    const capture = captureIo();
    const registry = paidDemoRegistry();
    const probe = vi.fn(async (integration: Integration): Promise<Availability> => {
      if (integration.kind === "cli") {
        return { available: false, reason: "not-authenticated", fix: "cli-login" };
      }
      return { available: true };
    });

    await createDoctorHandler(capture.io, {
      createRegistry: async () => registry,
      probeIntegration: probe,
    })(command({ json: true, profile: "paid-demo" }));

    const events = capture.stdout().trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(6);
    expect(events.map((event) => event.check)).toEqual([
      "OPENAI_API_KEY",
      "ELEVENLABS_API_KEY",
      "higgsfield binary",
      "higgsfield account status",
      "ffmpeg",
      "ffprobe",
    ]);
    expect(events.find((event) => event.check === "higgsfield account status")).toMatchObject({
      event: "doctor",
      profile: "paid-demo",
      status: "missing",
      reason: "not-authenticated",
      setup: "Run `higgsfield auth login`, then verify with `higgsfield account status --json`.",
    });
  });

  it("accepts Commander's no-argument action shape without losing global options", async () => {
    const capture = captureIo();
    const registry = paidDemoRegistry();

    await createDoctorHandler(capture.io, {
      createRegistry: async () => registry,
      probeIntegration: async () => ({ available: true }),
    })({ profile: "paid-demo" }, command({ json: true, profile: "paid-demo" }));

    const events = capture.stdout().trim().split(/\r?\n/u).map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(events).toHaveLength(6);
    expect(events[0]).toMatchObject({ event: "doctor", profile: "paid-demo", status: "ok" });
  });
});

describe("doctor local-comfy route", () => {
  const localRow: DoctorRow = { event: "doctor", profile: "local-comfy", check: "ComfyUI server", description: "x", status: "ok", tools: ["comfy_image"] };

  it("reports the local ComfyUI route first, then the paid profile, by default", async () => {
    const capture = captureIo();

    await createDoctorHandler(capture.io, {
      createRegistry: async () => paidDemoRegistry(),
      probeIntegration: async () => ({ available: true }),
      localComfy: async () => [localRow],
    })(command());

    const output = capture.stdout();
    expect(output.indexOf("doctor: local-comfy (default local route)")).toBe(0);
    expect(output).toContain("ok ComfyUI server - x");
    expect(output.indexOf("doctor: paid-demo provider profile")).toBeGreaterThan(0);
  });

  it("limits --profile local-comfy to the local rows", async () => {
    const capture = captureIo();
    const createRegistry = vi.fn(async () => paidDemoRegistry());

    await createDoctorHandler(capture.io, {
      createRegistry,
      probeIntegration: async () => ({ available: true }),
      localComfy: async () => [localRow],
    })(command({ json: true, profile: "local-comfy" }));

    expect(capture.stdout().trim().split("\n").map((line) => JSON.parse(line) as DoctorRow)).toEqual([localRow]);
    expect(createRegistry).not.toHaveBeenCalled();
  });

  it("checks server, node packs, and each engine against a live-shaped ComfyUI", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    delete comfy.state.objectInfo.TextEncodeQwenImage21;

    const rows = await checkLocalComfy(comfy.client, async () => ({ available: true }));
    const byCheck = Object.fromEntries(rows.map((row) => [row.check, row]));

    expect(byCheck["ComfyUI server"]).toMatchObject({ status: "ok", description: "ComfyUI 0.33.0 answering at http://comfy.test:8188" });
    expect(byCheck["node pack comfyui-gguf"]).toMatchObject({ status: "ok" });
    expect(byCheck["ComfyUI version"]).toMatchObject({ status: "missing", reason: "missing core node class TextEncodeQwenImage21" });
    expect(byCheck["engine z-image-turbo"]).toMatchObject({ status: "ok", tools: ["comfy_image"] });
    expect(byCheck["engine ltx-2.5"]).toMatchObject({
      status: "missing",
      setup: "`showkick setup comfy --engines ltx-2.5`",
      tools: ["comfy_video", "comfy_text_to_video"],
    });
    expect(byCheck["engine ltx-2.5"]?.reason).toMatch(/^missing model diffusion_models\/ltx-2\.5-22b-distilled-transformer-bf16\.safetensors/u);
  });

  it("tells the user how to start ComfyUI when it is not running", async () => {
    const rows = await checkLocalComfy(fakeComfy({ reachable: false }).client, async () => ({ available: false, reason: "binary not on PATH: comfy" }));

    expect(rows.map((row) => [row.check, row.status])).toEqual([
      ["comfy-cli", "missing"],
      ["ComfyUI server", "missing"],
    ]);
    expect(rows[1]?.setup).toContain("comfy launch --background");
  });
});

function paidDemoRegistry(): Registry {
  return new Registry({
    tools: ["higgsfield_image", "openai_image", "openai_tts", "elevenlabs_tts", "higgsfield", "ffmpeg", "source_media_review"].map(
      (name) =>
        defineTool({
          name,
          capability: "research",
          provider: "test",
          status: "beta",
          integration: { kind: "library", package: "test", install: "none" },
          best_for: "doctor tests",
          input: z.object({}),
          output: z.object({}),
          async execute() {
            return {};
          },
        }),
    ),
  });
}

describe("checkLocalAudio", () => {
  it("flags a WHISPER_MODEL path that does not exist", async () => {
    const dir = binDir();
    const rows = await checkLocalAudio({ PATH: `${dir}:/usr/bin:/bin`, HOME: dir, WHISPER_MODEL: "$HOME/.cache/whisper/ggml-base.en.bin" }, dir);

    expect(rows.map((row) => [row.check, row.status])).toEqual([
      ["transcription provider", "ok"],
      ["whisper-cli", "ok"],
      ["whisper model", "missing"],
    ]);
    expect(rows[2]?.reason).toContain(join(dir, ".cache", "whisper", "ggml-base.en.bin"));
    expect(rows[2]?.setup).toContain("WHISPER_MODEL");
  });

  it("passes when whisper-cli and the configured model file are present", async () => {
    const dir = binDir();
    mkdirSync(join(dir, ".cache", "whisper"), { recursive: true });
    writeFileSync(join(dir, ".cache", "whisper", "ggml-base.en.bin"), "ggml");

    const rows = await checkLocalAudio({ PATH: `${dir}:/usr/bin:/bin`, HOME: dir, WHISPER_MODEL: "~/.cache/whisper/ggml-base.en.bin" }, dir);

    expect(rows.every((row) => row.status === "ok")).toBe(true);
    expect(rows[2]?.description).toBe(`whisper model: ${join(dir, ".cache", "whisper", "ggml-base.en.bin")}`);
  });

  it("checks the ElevenLabs key instead of whisper when Scribe is pinned, and rejects unknown pins", async () => {
    const scribe = await checkLocalAudio({ TRANSCRIPTION_PROVIDER: "elevenlabs-scribe", ELEVENLABS_API_KEY: "" }, "/tmp");
    expect(scribe.map((row) => [row.check, row.status])).toEqual([
      ["transcription provider", "ok"],
      ["ELEVENLABS_API_KEY", "missing"],
    ]);

    const unknown = await checkLocalAudio({ TRANSCRIPTION_PROVIDER: "deepgram", PATH: "/nonexistent" }, "/tmp");
    expect(unknown[0]).toMatchObject({ check: "transcription provider", status: "missing" });
    expect(unknown[0]?.reason).toContain("TRANSCRIPTION_PROVIDER=deepgram");
  });

  it("prints a local audio section in the default doctor run", async () => {
    const capture = captureIo();
    const registry = paidDemoRegistry();

    await createDoctorHandler(capture.io, {
      createRegistry: async () => registry,
      probeIntegration: async () => ({ available: true }),
      localAudio: async () => [
        { event: "doctor", profile: "local-audio", check: "whisper model", description: "ggml model", status: "missing", reason: "whisper model file not found", setup: "set WHISPER_MODEL", tools: ["whisper-cpp"] },
      ],
    })(command());

    expect(capture.stdout()).toContain("doctor: local audio (cuesheet transcription)");
    expect(capture.stdout()).toContain("missing whisper model - ggml model");
  });
});

function binDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "predit-doctor-audio-"));
  const binary = join(dir, "whisper-cli");
  writeFileSync(binary, "#!/bin/sh\nexit 0\n");
  chmodSync(binary, 0o755);
  return dir;
}
