import type { Cut } from "../artifacts/edit-decisions.js";
import type { Cuesheet, DeckManifest, EditDecisions, Script } from "../artifacts/index.js";
import type { Finding } from "../artifacts/review.js";

export type CompositionInput = {
  cuts: Cut[];
  subtitles?: EditDecisions["subtitles"];
  audio?: EditDecisions["audio"];
};

export type PresentationCompositionValidationContext = {
  pipelineSlug?: string;
  deckManifest?: DeckManifest;
  script?: Script;
  cuesheet?: Cuesheet;
  requireSlideMapping?: boolean;
  requireNarrationAudio?: boolean;
  requireCaptions?: boolean;
};

type IndexedCut = Cut & {
  originalIndex: number;
};

const TIMING_EPSILON_S = 0.05;

export function validateComposition(
  editDecisions: CompositionInput,
  plannedDurationS: number,
  ctx: PresentationCompositionValidationContext = {},
): Finding[] {
  if (editDecisions.cuts.length === 0) {
    return [
      {
        severity: "critical",
        title: "Composition has no cuts",
        location: "edit_decisions.cuts",
        description: `No cuts are present, so the planned ${plannedDurationS}s duration cannot be covered.`,
        proposed_fix: `Add cuts covering 0s through ${plannedDurationS}s before compose validation round 1, starting with a cut at start_s 0.`,
        patch: {
          artifact_path: "cuts",
          new_value: [],
        },
        status: "pending",
      },
    ];
  }

  const cuts = editDecisions.cuts
    .map((cut, originalIndex) => ({ ...cut, originalIndex }))
    .sort((left, right) => left.start_s - right.start_s);

  return [
    ...checkLeadingGap(cuts[0]),
    ...checkAdjacentCoverage(cuts),
    ...checkPlannedDurationCoverage(cuts[cuts.length - 1], plannedDurationS),
    ...checkPresentationDemoCoverage(editDecisions, ctx),
  ];
}

function checkLeadingGap(firstCut: IndexedCut | undefined): Finding[] {
  if (firstCut === undefined || firstCut.start_s <= TIMING_EPSILON_S) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Composition has a leading gap",
      location: `edit_decisions.cuts[${firstCut.originalIndex}].start_s`,
      description: `First cut starts at ${firstCut.start_s}s, leaving the rendered output uncovered from 0s.`,
      proposed_fix: `Set edit_decisions.cuts[${firstCut.originalIndex}].start_s to 0 so cuts cover the timeline from 0s with no leading gap.`,
      patch: {
        artifact_path: `cuts[${firstCut.originalIndex}].start_s`,
        new_value: 0,
      },
      status: "pending",
    },
  ];
}

function checkAdjacentCoverage(cuts: IndexedCut[]): Finding[] {
  const findings: Finding[] = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const current = cuts[index];
    const next = cuts[index + 1];
    if (current === undefined || next === undefined) {
      continue;
    }

    const gapS = next.start_s - current.end_s;
    if (gapS > TIMING_EPSILON_S) {
      findings.push({
        severity: "critical",
        title: "Composition has a gap between cuts",
        location: `edit_decisions.cuts[${current.originalIndex}].end_s`,
        description: `Cut ${current.originalIndex} ends at ${current.end_s}s and cut ${next.originalIndex} starts at ${next.start_s}s, leaving a ${gapS.toFixed(2)}s gap.`,
        proposed_fix: `Extend cuts[${current.originalIndex}].end_s to ${next.start_s}s or move cuts[${next.originalIndex}].start_s to ${current.end_s}s so the gap is 0s.`,
        patch: {
          artifact_path: `cuts[${current.originalIndex}].end_s`,
          new_value: next.start_s,
        },
        status: "pending",
      });
    }

    const overlapS = current.end_s - next.start_s;
    if (overlapS > TIMING_EPSILON_S) {
      findings.push({
        severity: "suggestion",
        title: "Composition has overlapping cuts",
        location: `edit_decisions.cuts[${current.originalIndex}].end_s`,
        description: `Cut ${current.originalIndex} overlaps cut ${next.originalIndex} by ${overlapS.toFixed(2)}s.`,
        proposed_change: `Trim cuts[${current.originalIndex}].end_s to ${next.start_s}s if the overlap is not an intentional transition.`,
        status: "pending",
      });
    }
  }

  return findings;
}

function checkPlannedDurationCoverage(lastCut: IndexedCut | undefined, plannedDurationS: number): Finding[] {
  if (lastCut === undefined || lastCut.end_s >= plannedDurationS - TIMING_EPSILON_S) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Composition does not cover full planned duration",
      location: `edit_decisions.cuts[${lastCut.originalIndex}].end_s`,
      description: `Last cut ends at ${lastCut.end_s}s, before planned duration ${plannedDurationS}s.`,
      proposed_fix: `Extend cuts[${lastCut.originalIndex}].end_s to ${plannedDurationS}s or add another cut ending at ${plannedDurationS}s before compose.`,
      patch: {
        artifact_path: `cuts[${lastCut.originalIndex}].end_s`,
        new_value: plannedDurationS,
      },
      status: "pending",
    },
  ];
}

function checkPresentationDemoCoverage(
  editDecisions: CompositionInput,
  ctx: PresentationCompositionValidationContext,
): Finding[] {
  const presentationMode =
    ctx.pipelineSlug === "presentation-demo" ||
    ctx.deckManifest !== undefined ||
    ctx.requireSlideMapping === true ||
    ctx.requireCaptions === true ||
    ctx.requireNarrationAudio === true;
  if (!presentationMode) {
    return [];
  }

  return [
    ...checkSlideReferences(editDecisions, ctx.deckManifest),
    ...checkNarratedSectionsHaveSlides(editDecisions, ctx.script),
    ...checkNarrationAudio(editDecisions, ctx),
    ...checkCaptions(editDecisions, ctx),
  ];
}

function checkSlideReferences(editDecisions: CompositionInput, deckManifest: DeckManifest | undefined): Finding[] {
  if (deckManifest === undefined) {
    return [];
  }

  const slideIds = new Set(deckManifest.slides.map((slide) => slide.id));
  return editDecisions.cuts.flatMap((cut, index) => {
    const slideId = slideIdForCut(cut);
    if (slideId === undefined || slideIds.has(slideId)) {
      return [];
    }

    return [
      {
        severity: "critical",
        title: "Presentation cut references missing slide",
        location: `edit_decisions.cuts[${index}].slide_id`,
        description: `Cut ${index} references slide_id '${slideId}', but deck_manifest does not contain that slide.`,
        proposed_fix: "Use a slide_id present in deck_manifest.slides or regenerate deck_manifest before compose.",
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function checkNarratedSectionsHaveSlides(
  editDecisions: CompositionInput,
  script: Script | undefined,
): Finding[] {
  const narratedSections = script?.sections.filter((section) => {
    const hasNarration = typeof section.narration === "string" && section.narration.trim().length > 0;
    return hasNarration || (section.dialogue?.length ?? 0) > 0;
  }) ?? [];
  if (narratedSections.length === 0) {
    return [];
  }

  return narratedSections.flatMap((section) => {
    const mapped = editDecisions.cuts.some((cut) => {
      return cut.end_s > section.start_s && cut.start_s < section.end_s && slideIdForCut(cut) !== undefined;
    });
    if (mapped) {
      return [];
    }

    return [
      {
        severity: "critical",
        title: "Narrated section is not mapped to a slide",
        location: `script.sections.${section.slug}`,
        description: `Narrated section '${section.slug}' has no overlapping edit_decisions cut with a slide_id.`,
        proposed_fix: `Add slide_id to the edit cut covering ${section.start_s}s-${section.end_s}s, or revise scene_plan so the section maps to a deck slide or support visual.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function checkNarrationAudio(
  editDecisions: CompositionInput,
  ctx: PresentationCompositionValidationContext,
): Finding[] {
  if (ctx.requireNarrationAudio !== true && ctx.cuesheet === undefined) {
    return [];
  }

  const hasAudio = Boolean(ctx.cuesheet?.audio.path || editDecisions.audio?.music?.track_path);
  if (hasAudio) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Narration audio is missing",
      location: "cuesheet.audio.path",
      description: "Presentation-demo compose requires narration audio when the voiceover clock is present.",
      proposed_fix: "Attach cuesheet.audio.path or edit_decisions.audio.music.track_path before compose.",
      status: "pending",
    },
  ];
}

function checkCaptions(
  editDecisions: CompositionInput,
  ctx: PresentationCompositionValidationContext,
): Finding[] {
  if (ctx.requireCaptions !== true) {
    return [];
  }

  const cuesheetWordCount = ctx.cuesheet?.words?.length ?? ctx.cuesheet?.segments.reduce((sum, segment) => sum + segment.words.length, 0) ?? 0;
  const hasCaptions = Boolean(editDecisions.subtitles?.enabled || editDecisions.subtitles?.source || cuesheetWordCount > 0);
  if (hasCaptions) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Caption timing is missing",
      location: "edit_decisions.subtitles",
      description: "Presentation-demo compose requires caption source or word timings when captions are declared.",
      proposed_fix: "Enable edit_decisions.subtitles with a source path or provide cuesheet word timings.",
      status: "pending",
    },
  ];
}

function slideIdForCut(cut: Cut): string | undefined {
  const direct = valueAsString((cut as Cut & { slide_id?: unknown }).slide_id);
  if (direct !== undefined) {
    return direct;
  }

  const treatment = (cut as Cut & { treatment?: unknown }).treatment;
  if (isRecord(treatment)) {
    return valueAsString(treatment.slide_id);
  }

  return undefined;
}

function valueAsString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
