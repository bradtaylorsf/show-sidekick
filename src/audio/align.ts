import type { Cuesheet } from "../artifacts/cuesheet.js";
import type { ScenePlan } from "../artifacts/scene-plan.js";
import type { SceneAnchor } from "./types.js";

export type SnapTarget = SceneAnchor["snapped_to"];

export interface AlignScenesOptions {
  master: "audio" | "voiceover";
  snap_to: SnapTarget[];
  align_climax_scene_to?: string;
  max_scene_duration_s?: number;
}

type Candidate = {
  time_s: number;
  snapped_to: SnapTarget;
  source: SceneAnchor["source"];
};

const DEFAULT_MAX_SCENE_DURATION_S = 5;

export function alignScenes(scenePlan: ScenePlan, cuesheet: Cuesheet, options: AlignScenesOptions): SceneAnchor[] {
  const maxSceneDuration = options.max_scene_duration_s ?? DEFAULT_MAX_SCENE_DURATION_S;

  if (!Number.isFinite(maxSceneDuration) || maxSceneDuration <= 0) {
    throw new Error("max_scene_duration_s must be a positive number");
  }

  return [...scenePlan.scenes]
    .sort((left, right) => left.order - right.order)
    .map((scene) => {
      const forcedClimax =
        options.align_climax_scene_to && options.align_climax_scene_to === scene.slug
          ? nearestClimaxCandidate(scene.start_s, cuesheet)
          : undefined;
      const candidate = forcedClimax ?? chooseCandidate(scene.start_s, cuesheet, options.snap_to);
      const start_s = roundSeconds(candidate?.time_s ?? scene.start_s);
      const originalDuration = Math.max(0, scene.end_s - scene.start_s);
      const duration = Math.min(originalDuration, maxSceneDuration);
      const end_s = roundSeconds(Math.min(cuesheet.audio.duration_s, start_s + duration));

      return {
        scene_id: scene.slug,
        start_s,
        end_s,
        snapped_to: candidate?.snapped_to ?? "manual",
        source: candidate?.source ?? {},
      };
    });
}

function chooseCandidate(start_s: number, cuesheet: Cuesheet, snapTo: SnapTarget[]): Candidate | undefined {
  for (const snap of snapTo) {
    if (snap === "manual") {
      return { time_s: start_s, snapped_to: "manual", source: {} };
    }

    const candidate = candidatesFor(snap, cuesheet)
      .filter((target) => target.time_s >= start_s)
      .sort((left, right) => left.time_s - right.time_s)[0];

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function candidatesFor(snap: SnapTarget, cuesheet: Cuesheet): Candidate[] {
  if (snap === "section_start") {
    return cuesheet.sections.map((section) => ({
      time_s: section.start_s,
      snapped_to: "section_start",
      source: { section: section.label },
    }));
  }

  if (snap === "beat" || snap === "downbeat") {
    return cuesheet.beats
      .map((beat, index) => ({ beat, index }))
      .filter(({ beat }) => snap === "beat" || beat.is_downbeat)
      .map(({ beat, index }) => ({
        time_s: beat.time_s,
        snapped_to: snap,
        source: { beat_index: index },
      }));
  }

  if (snap === "word") {
    return cuesheet.segments.flatMap((segment, segmentIndex) =>
      segment.words.map((word, wordIndex) => ({
        time_s: word.start_s,
        snapped_to: "word" as const,
        source: { word_id: `${segmentIndex}:${wordIndex}` },
      })),
    );
  }

  if (snap === "climax") {
    return cuesheet.climax.map((climax, index) => ({
      time_s: climax.time_s,
      snapped_to: "climax",
      source: { climax_index: index },
    }));
  }

  return [];
}

function nearestClimaxCandidate(start_s: number, cuesheet: Cuesheet): Candidate | undefined {
  const candidate = cuesheet.climax
    .map((climax, index) => ({
      time_s: climax.time_s,
      snapped_to: "climax" as const,
      source: { climax_index: index },
      distance: Math.abs(climax.time_s - start_s),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  if (!candidate) {
    return undefined;
  }

  return {
    time_s: candidate.time_s,
    snapped_to: candidate.snapped_to,
    source: candidate.source,
  };
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
