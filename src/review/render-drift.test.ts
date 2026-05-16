import { describe, expect, it } from "vitest";
import type { RenderReport } from "../artifacts/render-report.js";
import { checkRenderDrift } from "./render-drift.js";

describe("checkRenderDrift", () => {
  it("passes within the default one-frame tolerance", () => {
    expect(checkRenderDrift("compose", renderReport({ driftFrames: 0.8 }))).toEqual([]);
  });

  it("flags over-tolerance drift as critical", () => {
    const findings = checkRenderDrift("compose", renderReport({ driftFrames: 1.2 }));

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Render drift exceeds tolerance",
      }),
    );
  });

  it("reports a looser pipeline override as a suggestion", () => {
    const findings = checkRenderDrift("compose", renderReport({ driftFrames: 1.8 }), { toleranceFrames: 2 });

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "suggestion",
        title: "Render drift uses pipeline override",
      }),
    );
  });

  it("flags over-tolerance generated clip trims", () => {
    const findings = checkRenderDrift(
      "compose",
      renderReport({
        driftFrames: 0,
        clipTrims: [
          {
            asset_id: "scene-1",
            requested_duration_s: 5,
            actual_duration_s: 5.08,
            drift_s: 0.08,
            drift_frames: 2.4,
            within_tolerance: false,
          },
        ],
      }),
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Clip trim drift exceeds tolerance",
        location: "render_report.clip_trims[0].drift_frames",
      }),
    );
  });

  it("checks clip trims even when the runtime omitted final drift fields", () => {
    const findings = checkRenderDrift(
      "compose",
      renderReport({
        driftFrames: undefined,
        clipTrims: [
          {
            asset_id: "scene-1",
            requested_duration_s: 5,
            actual_duration_s: 5.06,
            drift_s: 0.06,
            drift_frames: 1.8,
            within_tolerance: false,
          },
        ],
      }),
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Clip trim drift exceeds tolerance",
      }),
    );
  });
});

function renderReport(options: { driftFrames: number | undefined; clipTrims?: RenderReport["clip_trims"] }): RenderReport {
  return {
    output_path: "renders/final.mp4",
    encoding_profile: "h264/aac",
    duration_s: 4,
    expected_duration_s: 4,
    ...(options.driftFrames === undefined
      ? {}
      : {
          drift_s: options.driftFrames / 30,
          drift_frames: options.driftFrames,
        }),
    drift_tolerance_s: 1 / 30,
    within_tolerance: options.driftFrames === undefined ? undefined : options.driftFrames <= 1,
    ...(options.clipTrims === undefined ? {} : { clip_trims: options.clipTrims }),
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    runtime_used: "ffmpeg",
    asset_count: 1,
    warnings: [],
    validation_steps: [],
  };
}
