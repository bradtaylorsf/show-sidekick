import type { Finding } from "../artifacts/review.js";

type UnknownRecord = Record<string, unknown>;

export type ScenePacingPipeline = UnknownRecord & {
  defaults?: UnknownRecord;
  master_clock?: unknown;
};

type SectionBoundary = {
  time_s: number;
  label: string;
};

export function verifyScenePacing(scenes: UnknownRecord[], pipeline: ScenePacingPipeline): Finding[] {
  return [
    ...checkDurationBounds(scenes, pipeline),
    ...checkMusicSectionBoundaries(scenes, pipeline),
  ];
}

function checkDurationBounds(scenes: UnknownRecord[], pipeline: ScenePacingPipeline): Finding[] {
  const maxSceneDurationS = numberValue(pipeline.defaults?.max_scene_duration_s);
  const minSceneDurationS = numberValue(pipeline.defaults?.min_scene_duration_s);
  const findings: Finding[] = [];

  scenes.forEach((scene, index) => {
    const duration = sceneDuration(scene);
    if (duration === undefined) {
      return;
    }

    if (maxSceneDurationS !== undefined && duration > maxSceneDurationS) {
      findings.push({
        severity: "critical",
        title: "Scene exceeds maximum duration",
        location: `scenes[${index}]`,
        description: `Scene ${index} duration is ${duration.toFixed(2)}s; max_scene_duration_s is ${maxSceneDurationS}s.`,
        proposed_fix: `Split or trim scene ${index} so its duration is no more than ${maxSceneDurationS}s; current duration is ${duration.toFixed(2)}s.`,
        patch: {
          artifact_path: `scenes[${index}].end_s`,
          new_value: numberValue(scene.start_s) === undefined ? maxSceneDurationS : numberValue(scene.start_s)! + maxSceneDurationS,
        },
        status: "pending",
      });
    }

    if (minSceneDurationS !== undefined && duration < minSceneDurationS) {
      findings.push({
        severity: "critical",
        title: "Scene is below minimum duration",
        location: `scenes[${index}]`,
        description: `Scene ${index} duration is ${duration.toFixed(2)}s; min_scene_duration_s is ${minSceneDurationS}s.`,
        proposed_fix: `Extend scene ${index} so its duration is at least ${minSceneDurationS}s; current duration is ${duration.toFixed(2)}s.`,
        patch: {
          artifact_path: `scenes[${index}].end_s`,
          new_value: numberValue(scene.start_s) === undefined ? minSceneDurationS : numberValue(scene.start_s)! + minSceneDurationS,
        },
        status: "pending",
      });
    }
  });

  return findings;
}

function checkMusicSectionBoundaries(scenes: UnknownRecord[], pipeline: ScenePacingPipeline): Finding[] {
  if (pipeline.master_clock !== "audio") {
    return [];
  }

  const boundaries = sectionBoundaries(pipeline);
  if (boundaries.length === 0) {
    return [];
  }

  return scenes.flatMap((scene, index) => {
    if (scene.section_crossing_allowed === true) {
      return [];
    }

    const startS = numberValue(scene.start_s);
    const endS = numberValue(scene.end_s);
    if (startS === undefined || endS === undefined) {
      return [];
    }

    const crossedBoundary = boundaries.find((boundary) => startS < boundary.time_s && endS > boundary.time_s);
    if (crossedBoundary === undefined) {
      return [];
    }

    return [
      {
        severity: "suggestion",
        title: "Scene crosses music section boundary",
        location: `scenes[${index}]`,
        description: `Scene ${index} runs ${startS.toFixed(2)}s-${endS.toFixed(2)}s and crosses ${crossedBoundary.label} at ${crossedBoundary.time_s.toFixed(2)}s.`,
        proposed_change: `Split scene ${index} at ${crossedBoundary.time_s.toFixed(2)}s or set section_crossing_allowed: true if the bleed is intentional.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function sectionBoundaries(pipeline: ScenePacingPipeline): SectionBoundary[] {
  const sections = sectionRecords(pipeline.defaults?.sections ?? pipeline.sections);
  if (sections.length < 2) {
    return [];
  }

  const starts = sections.map((section) => numberValue(section.start_s)).filter(isPresentNumber);
  const ends = sections.map((section) => numberValue(section.end_s)).filter(isPresentNumber);
  const firstStart = Math.min(...starts);
  const lastEnd = Math.max(...ends);
  const boundaries = new Map<number, string>();

  sections.forEach((section, index) => {
    const startS = numberValue(section.start_s);
    const endS = numberValue(section.end_s);
    const label = stringValue(section.label) ?? `section ${index}`;

    if (startS !== undefined && startS > firstStart && startS < lastEnd) {
      boundaries.set(startS, label);
    }
    if (endS !== undefined && endS > firstStart && endS < lastEnd) {
      boundaries.set(endS, label);
    }
  });

  return [...boundaries.entries()]
    .sort(([left], [right]) => left - right)
    .map(([time_s, label]) => ({ time_s, label }));
}

function sectionRecords(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function sceneDuration(scene: UnknownRecord): number | undefined {
  const startS = numberValue(scene.start_s);
  const endS = numberValue(scene.end_s);
  if (startS === undefined || endS === undefined) {
    return undefined;
  }

  return endS - startS;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isPresentNumber(value: number | undefined): value is number {
  return value !== undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
