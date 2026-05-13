import type { RenderReport } from "../artifacts/render-report.js";

export type RenderReportValidationFinding = {
  check: "hyperframes_validation_gate";
  severity: "critical";
  message: string;
};

export function reviewHyperframesValidationSteps(report: RenderReport): RenderReportValidationFinding[] {
  if (report.runtime_used !== "hyperframes") {
    return [];
  }

  const missing = ["lint", "validate"].filter((name) => {
    return !report.validation_steps.some((step) => step.name === name && step.status === "pass");
  });

  if (missing.length === 0) {
    return [];
  }

  return [
    {
      check: "hyperframes_validation_gate",
      severity: "critical",
      message: `HyperFrames render_report.validation_steps[] is missing required pass step(s): ${missing.join(", ")}.`,
    },
  ];
}
