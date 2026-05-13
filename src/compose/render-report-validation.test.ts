import { describe, expect, it } from "vitest";
import { type RenderReport } from "../artifacts/index.js";
import { reviewHyperframesValidationSteps } from "./render-report-validation.js";

describe("render report validation", () => {
  it("flags HyperFrames reports missing lint and validate pass steps as critical", () => {
    expect(
      reviewHyperframesValidationSteps({
        ...report(),
        validation_steps: [{ name: "lint", status: "pass" }],
      }),
    ).toEqual([
      {
        check: "hyperframes_validation_gate",
        message: "HyperFrames render_report.validation_steps[] is missing required pass step(s): validate.",
        severity: "critical",
      },
    ]);
  });

  it("accepts HyperFrames reports with lint and validate pass steps", () => {
    expect(
      reviewHyperframesValidationSteps({
        ...report(),
        validation_steps: [
          { name: "lint", status: "pass" },
          { name: "validate", status: "pass" },
          { name: "render", status: "pass" },
        ],
      }),
    ).toEqual([]);
  });
});

function report(): RenderReport {
  return {
    output_path: "renders/hyperframes.mp4",
    encoding_profile: "hyperframes/default",
    duration_s: 2,
    resolution: { width: 1920, height: 1080 },
    framerate: 30,
    runtime_used: "hyperframes",
    asset_count: 1,
    warnings: [],
    validation_steps: [],
  };
}
