import type { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { Registry, defineTool, type Availability, type Integration } from "../../registry/index.js";
import { createDoctorHandler } from "./doctor.js";
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

function paidDemoRegistry(): Registry {
  return new Registry({
    tools: ["openai_image", "openai_tts", "elevenlabs_tts", "higgsfield", "ffmpeg", "source_media_review"].map((name) =>
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
