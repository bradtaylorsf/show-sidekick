import type { Finding } from "../artifacts/review.js";
import type { RenderReport } from "../artifacts/render-report.js";

export function checkRenderDrift(
  stageSlug: string,
  renderReport: RenderReport | undefined,
  options: { toleranceFrames?: number } = {},
): Finding[] {
  if (stageSlug !== "compose" || renderReport === undefined) {
    return [];
  }

  const toleranceFrames = options.toleranceFrames ?? 1;
  const hasLooserOverride = toleranceFrames > 1;
  const findings: Finding[] = [];

  if (renderReport.drift_frames !== undefined) {
    const driftFrames = renderReport.drift_frames;
    if (driftFrames > toleranceFrames + 1e-6) {
      findings.push({
        severity: "critical",
        title: "Render drift exceeds tolerance",
        location: "render_report.drift_frames",
        description: `Final render drift is ${driftFrames.toFixed(2)} frames; tolerance is ${toleranceFrames.toFixed(2)} frames.`,
        proposed_fix: "Trim generated clips to exact cut durations, rerender, and verify expected-vs-actual duration before export.",
        status: "pending",
      });
    } else if (hasLooserOverride && driftFrames > 1) {
      findings.push({
        severity: "suggestion",
        title: "Render drift uses pipeline override",
        location: "render_report.drift_frames",
        description: `Final render drift is ${driftFrames.toFixed(2)} frames: above the default one-frame gate but within the pipeline override of ${toleranceFrames.toFixed(2)} frames.`,
        proposed_change: "Keep the override documented in the pipeline defaults, or tighten trims until drift is within one frame.",
        status: "pending",
      });
    }

  }

  findings.push(...checkClipTrimDrift(renderReport, toleranceFrames, hasLooserOverride));

  return findings;
}

function checkClipTrimDrift(
  renderReport: RenderReport,
  toleranceFrames: number,
  hasLooserOverride: boolean,
): Finding[] {
  return (renderReport.clip_trims ?? []).flatMap((clip, index): Finding[] => {
    const driftFrames = clip.drift_frames;
    if (driftFrames > toleranceFrames + 1e-6) {
      return [
        {
          severity: "critical",
          title: "Clip trim drift exceeds tolerance",
          location: `render_report.clip_trims[${index}].drift_frames`,
          description: `Clip '${clip.asset_id}' trim drift is ${driftFrames.toFixed(2)} frames; tolerance is ${toleranceFrames.toFixed(2)} frames.`,
          proposed_fix: `Trim asset '${clip.asset_id}' to ${clip.requested_duration_s.toFixed(3)}s, rerender, and verify the clip's actual duration before concat or mux.`,
          status: "pending",
        } satisfies Finding,
      ];
    }

    if (hasLooserOverride && driftFrames > 1) {
      return [
        {
          severity: "suggestion",
          title: "Clip trim drift uses pipeline override",
          location: `render_report.clip_trims[${index}].drift_frames`,
          description: `Clip '${clip.asset_id}' trim drift is ${driftFrames.toFixed(2)} frames: above the default one-frame gate but within the pipeline override of ${toleranceFrames.toFixed(2)} frames.`,
          proposed_change: "Keep the override documented in the pipeline defaults, or tighten this generated clip trim until drift is within one frame.",
          status: "pending",
        } satisfies Finding,
      ];
    }

    return [];
  });
}
