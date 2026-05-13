import { describe, expect, it } from "vitest";
import playwrightRecording, { buildPlaywrightContextOptions, normalizeRecordingStep } from "./playwright-recording.js";

describe("playwright_recording", () => {
  it("registers the Playwright screen capture provider", () => {
    expect(playwrightRecording.name).toBe("playwright_recording");
    expect(playwrightRecording.capability).toBe("screen_capture");
    expect(playwrightRecording.provider).toBe("playwright");
    expect(playwrightRecording.integration).toMatchObject({ kind: "library", package: "playwright" });
  });

  it("parses input defaults and output schema", () => {
    expect(
      playwrightRecording.input.parse({
        url: "https://example.com",
        output_path: "/tmp/browser.webm",
      }).steps,
    ).toEqual([]);

    expect(
      playwrightRecording.output.parse({
        video_path: "/tmp/browser.webm",
        duration_s: 2.5,
        source_url: "https://example.com",
      }).source_url,
    ).toBe("https://example.com");
  });

  it("builds recordVideo context options with matching viewport size", () => {
    expect(buildPlaywrightContextOptions("/tmp/videos", { width: 1280, height: 720 })).toEqual({
      viewport: { width: 1280, height: 720 },
      recordVideo: {
        dir: "/tmp/videos",
        size: { width: 1280, height: 720 },
      },
    });
  });

  it("normalizes deterministic browser flow steps", () => {
    expect(normalizeRecordingStep({ action: "click", selector: "button" })).toEqual({
      action: "click",
      selector: "button",
    });
    expect(normalizeRecordingStep({ action: "type", selector: "input", value: "hello" })).toEqual({
      action: "type",
      selector: "input",
      value: "hello",
    });
    expect(normalizeRecordingStep({ action: "wait", ms: 250 })).toEqual({ action: "wait", ms: 250 });
  });

  it("rejects incomplete browser flow steps", () => {
    expect(() => normalizeRecordingStep({ action: "click" })).toThrow(/requires selector/);
    expect(() => normalizeRecordingStep({ action: "type", selector: "input" })).toThrow(/requires value/);
    expect(() => normalizeRecordingStep({ action: "wait" })).toThrow(/requires ms or selector/);
  });
});
