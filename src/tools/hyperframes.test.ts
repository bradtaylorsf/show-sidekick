import { describe, expect, it, vi } from "vitest";
import { ComposeBlockerError } from "../compose/blocker.js";
import hyperframes, { buildHyperframesCompositionSpec, type CommandResult } from "./hyperframes.js";

describe("hyperframes tool", () => {
  it("runs lint, validate, then render with npx hyperframes", async () => {
    const calls: string[][] = [];
    const runCommand = vi.fn(async (_binary: string, args: string[]): Promise<CommandResult> => {
      calls.push(args);
      return { stdout: "ok", stderr: "", exit_code: 0 };
    });

    const result = await hyperframes.execute(input(), testContext(runCommand));

    expect(calls).toEqual([
      ["hyperframes", "lint", "spec.json"],
      ["hyperframes", "validate", "spec.json"],
      ["hyperframes", "render", "spec.json"],
    ]);
    expect(result.validation_steps).toEqual([
      { name: "lint", status: "pass" },
      { name: "validate", status: "pass" },
      { name: "render", status: "pass" },
    ]);
  });

  it("short-circuits validate and render when lint fails", async () => {
    const runCommand = vi.fn(async (_binary: string, args: string[]): Promise<CommandResult> => {
      return args[1] === "lint"
        ? { stdout: "", stderr: "unknown token at line 4", exit_code: 1 }
        : { stdout: "should not run", stderr: "", exit_code: 0 };
    });

    await expect(hyperframes.execute(input(), testContext(runCommand))).rejects.toMatchObject({
      blocker: {
        type: "hyperframes_validation_failed",
        attempted: "hyperframes",
      },
      render_report: {
        validation_steps: [{ name: "lint", notes: "unknown token at line 4", status: "fail" }],
      },
    });

    expect(runCommand).toHaveBeenCalledOnce();
  });

  it("short-circuits render when validate fails after lint passes", async () => {
    const runCommand = vi.fn(async (_binary: string, args: string[]): Promise<CommandResult> => {
      return args[1] === "validate"
        ? { stdout: "", stderr: "missing timeline", exit_code: 1 }
        : { stdout: "ok", stderr: "", exit_code: 0 };
    });

    await expect(hyperframes.execute(input(), testContext(runCommand))).rejects.toBeInstanceOf(ComposeBlockerError);

    expect(runCommand.mock.calls.map((call) => call[1][1])).toEqual(["lint", "validate"]);
  });

  it("builds a deck-aware HyperFrames composition spec", () => {
    const spec = buildHyperframesCompositionSpec({
      output_path: "renders/deck.mp4",
      deck_manifest: {
        source: { kind: "pdf", path: "inputs/deck.pdf" },
        slide_count: 1,
        slides: [{ id: "slide-1", index: 0, screenshot_path: "slides/slide-1.png" }],
      },
      cuesheet: {
        audio: { path: "audio/narration.wav", duration_s: 4, sample_rate: 48_000, channels: 1 },
        master_clock: "voiceover",
        words: [{ text: "Hello", start_s: 0, end_s: 0.3, confidence: 1 }],
        segments: [{ start_s: 0, end_s: 4, text: "Hello", words: [{ text: "Hello", start_s: 0, end_s: 0.3, confidence: 1 }] }],
        sections: [{ label: "voiceover", start_s: 0, end_s: 4, kind: "vocal", energy: 0.8 }],
        beats: [],
        climax: [],
        scene_anchors: [],
      },
      edit_decisions: {
        cuts: [
          {
            start_s: 0,
            end_s: 4,
            asset_id: "slide-1",
            slide_id: "slide-1",
            treatment: {
              motion: { kind: "zoom_pan", start_zoom: 1, end_zoom: 1.06 },
              callouts: [{ text: "Narrated slide callout." }],
            },
          },
        ],
        overlays: [],
        render_runtime: "hyperframes",
        renderer_family: "presentation-demo",
      },
    });

    expect(spec).toMatchObject({
      runtime: "hyperframes",
      output_path: "renders/deck.mp4",
      presentation: {
        runtime: "hyperframes",
        scenes: [
          expect.objectContaining({
            slide_id: "slide-1",
            image_path: "slides/slide-1.png",
            callouts: [expect.objectContaining({ text: "Narrated slide callout." })],
          }),
        ],
      },
      audio: { path: "audio/narration.wav", duration_s: 4 },
    });
  });
});

function input() {
  return {
    composition_spec_path: "spec.json",
    output_path: "renders/hyperframes.mp4",
    edit_decisions: {
      cuts: [{ start_s: 0, end_s: 4, asset_id: "hero" }],
      overlays: [],
      render_runtime: "hyperframes" as const,
      renderer_family: "animation-first" as const,
    },
  };
}

function testContext(runCommand: (binary: string, args: string[], options: { cwd: string }) => Promise<CommandResult>) {
  return {
    projectRoot: "/tmp/predit-hyperframes-test",
    runCommand,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
