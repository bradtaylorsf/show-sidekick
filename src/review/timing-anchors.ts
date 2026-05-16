import type { Finding } from "../artifacts/review.js";

type UnknownRecord = Record<string, unknown>;

type TimedWord = {
  text: string;
  start_s: number;
  end_s: number;
};

export type TimingAnchorReviewOptions = {
  audioLed: boolean;
  cuesheet?: unknown;
  lyricsAligned?: unknown;
  maxSceneDurationS?: number;
};

export function checkTimingAnchors(
  stageSlug: string,
  artifact: unknown,
  options: TimingAnchorReviewOptions,
): Finding[] {
  if (!options.audioLed || !timingContextAvailable(options)) {
    return [];
  }

  const normalized = normalizeStage(stageSlug);
  if (normalized === "scene_plan") {
    const scenes = recordsAt(artifact, "scenes");
    return [
      ...checkRecordsForAnchors("scenes", scenes),
      ...checkSceneDurations(scenes, options.maxSceneDurationS ?? 5),
    ];
  }

  if (normalized === "edit") {
    const cuts = recordsAt(artifact, "cuts");
    return [
      ...checkRecordsForAnchors("cuts", cuts),
      ...checkMidWordCutBoundaries(cuts, timedWords(options.cuesheet)),
    ];
  }

  return [];
}

function checkSceneDurations(scenes: UnknownRecord[], maxSceneDurationS: number): Finding[] {
  return scenes.flatMap((scene, index) => {
    const startS = sceneStartS(scene);
    const endS = sceneEndS(scene);
    if (startS === undefined || endS === undefined || endS <= startS) {
      return [];
    }

    const durationS = endS - startS;
    if (durationS <= maxSceneDurationS + 1e-6) {
      return [];
    }

    return [
      {
        severity: "critical",
        title: "Scene exceeds audio timing duration cap",
        location: `scenes[${index}].end_s`,
        description: `Scene ${index} runs ${durationS.toFixed(3)}s, above the ${maxSceneDurationS.toFixed(3)}s audio-led timing cap.`,
        proposed_fix: `Split scenes[${index}] into lyric phrase, beat, or manual timing windows no longer than ${maxSceneDurationS.toFixed(3)}s, preserving timing_anchor and timing_ref on each split scene.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function checkRecordsForAnchors(kind: "scenes" | "cuts", records: UnknownRecord[]): Finding[] {
  return records.flatMap((record, index) => {
    const timingAnchor = stringValue(record.timing_anchor);
    const timingSource = stringValue(record.timing_source);

    if (timingAnchor !== undefined && timingSource !== undefined) {
      return [];
    }

    return [
      {
        severity: "critical",
        title: "Timing anchor missing",
        location: `${kind}[${index}]`,
        description: `${kind === "scenes" ? "Scene" : "Cut"} ${index} is missing timing_anchor or timing_source even though audio timing context is available.`,
        proposed_fix: `Add timing_anchor, timing_source, and timing_ref that cite the lyric phrase, word, beat, climax, or manual timing source for ${kind === "scenes" ? "scene" : "cut"} ${index}.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function checkMidWordCutBoundaries(cuts: UnknownRecord[], words: TimedWord[]): Finding[] {
  if (words.length === 0) {
    return [];
  }

  return cuts.flatMap((cut, cutIndex) => {
    const boundaries = [
      { field: "start_s", value: numberValue(cut.start_s) },
      { field: "end_s", value: numberValue(cut.end_s) },
    ];

    return boundaries.flatMap((boundary) => {
      if (boundary.value === undefined || boundary.value === 0) {
        return [];
      }

      const word = words.find((candidate) => boundary.value! > candidate.start_s && boundary.value! < candidate.end_s);
      if (word === undefined) {
        return [];
      }

      return [
        {
          severity: "critical",
          title: "Cut falls inside word timing",
          location: `cuts[${cutIndex}].${boundary.field}`,
          description: `Cut boundary ${boundary.value.toFixed(3)}s falls inside word "${word.text}" (${word.start_s.toFixed(3)}s-${word.end_s.toFixed(3)}s).`,
          proposed_fix: `Move cuts[${cutIndex}].${boundary.field} to ${word.start_s.toFixed(3)}s or ${word.end_s.toFixed(3)}s, or cite a manual timing_ref if the mid-word cut is intentional.`,
          status: "pending",
        } satisfies Finding,
      ];
    });
  });
}

function timingContextAvailable(options: TimingAnchorReviewOptions): boolean {
  return timedWords(options.cuesheet).length > 0 || lyricPhraseWindows(options.lyricsAligned) > 0;
}

function lyricPhraseWindows(value: unknown): number {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return 0;
  }

  return value.lines.filter((line) => {
    if (!isRecord(line)) {
      return false;
    }

    return numberValue(line.start_s) !== undefined && numberValue(line.end_s) !== undefined;
  }).length;
}

function timedWords(cuesheet: unknown): TimedWord[] {
  if (!isRecord(cuesheet)) {
    return [];
  }

  const directWords = Array.isArray(cuesheet.words) ? cuesheet.words : [];
  const segmentWords = Array.isArray(cuesheet.segments)
    ? cuesheet.segments.flatMap((segment) => (isRecord(segment) && Array.isArray(segment.words) ? segment.words : []))
    : [];
  const seen = new Set<string>();

  return [...directWords, ...segmentWords].flatMap((word) => {
    if (!isRecord(word)) {
      return [];
    }

    const text = stringValue(word.text);
    const startS = numberValue(word.start_s);
    const endS = numberValue(word.end_s);
    if (text === undefined || startS === undefined || endS === undefined || endS <= startS) {
      return [];
    }

    const key = `${text}:${startS}:${endS}`;
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [{ text, start_s: startS, end_s: endS }];
  });
}

function recordsAt(value: unknown, key: "scenes" | "cuts"): UnknownRecord[] {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    return [];
  }

  return value[key].filter(isRecord);
}

function normalizeStage(stageSlug: string): string {
  if (stageSlug === "edit_decisions") {
    return "edit";
  }

  return stageSlug;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sceneStartS(scene: UnknownRecord): number | undefined {
  const startS = numberValue(scene.start_s);
  if (startS !== undefined) {
    return startS;
  }

  const startMs = numberValue(scene.start_ms);
  return startMs === undefined ? undefined : startMs / 1000;
}

function sceneEndS(scene: UnknownRecord): number | undefined {
  const endS = numberValue(scene.end_s);
  if (endS !== undefined) {
    return endS;
  }

  const endMs = numberValue(scene.end_ms);
  return endMs === undefined ? undefined : endMs / 1000;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
