import type { Finding } from "../artifacts/review.js";
import type { Playbook } from "../shows/playbook.js";

type UnknownRecord = Record<string, unknown>;

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}/g;
const COMMON_COLOR_NAMES = new Set([
  "black",
  "blue",
  "brown",
  "cyan",
  "gold",
  "gray",
  "green",
  "grey",
  "magenta",
  "orange",
  "pink",
  "purple",
  "red",
  "silver",
  "white",
  "yellow",
]);

const COLOR_FIELD_NAMES = new Set([
  "background",
  "color",
  "colour",
  "fill",
  "foreground",
  "hex",
  "palette",
  "stroke",
  "tint",
]);

export function crossCheckAgainstPlaybook(stageSlug: string, artifact: unknown, playbook: Playbook): Finding[] {
  return [
    ...checkPalette(stageSlug, artifact, playbook),
    ...checkTransitions(stageSlug, artifact, playbook),
    ...checkPacing(stageSlug, artifact, playbook),
    ...checkStyleCues(stageSlug, artifact, playbook),
  ];
}

function checkPalette(stageSlug: string, artifact: unknown, playbook: Playbook): Finding[] {
  const allowedColors = new Set(playbook.palette.map(normalizePaletteToken));
  const findings: Finding[] = [];

  visitStrings(artifact, stageSlug, (value, location) => {
    const colorRefs = extractColorRefs(value, location);
    colorRefs.forEach((colorRef) => {
      if (allowedColors.has(normalizePaletteToken(colorRef))) {
        return;
      }

      findings.push({
        severity: "suggestion",
        title: "Color reference is outside playbook palette",
        location,
        description: `${colorRef} is not listed in the active playbook palette.`,
        proposed_change: `Use one of the active playbook palette values: "${playbook.palette.join(", ")}".`,
        status: "pending",
      });
    });
  });

  return findings;
}

function checkTransitions(stageSlug: string, artifact: unknown, playbook: Playbook): Finding[] {
  const allowedTransitions = new Set(playbook.transitions_allowed.map((transition) => transition.toLowerCase()));
  const findings: Finding[] = [];

  visitStrings(artifact, stageSlug, (value, location) => {
    if (!isTransitionLocation(location)) {
      return;
    }

    if (allowedTransitions.has(value.toLowerCase())) {
      return;
    }

    findings.push({
      severity: "suggestion",
      title: "Transition is outside playbook allowlist",
      location,
      description: `${value} is not in the playbook transition allowlist.`,
      proposed_change: `Use an allowed transition: "${playbook.transitions_allowed.join(", ")}".`,
      status: "pending",
    });
  });

  return findings;
}

function checkPacing(stageSlug: string, artifact: unknown, playbook: Playbook): Finding[] {
  if (!isRecord(artifact) || !Array.isArray(artifact.scenes)) {
    return [];
  }

  return artifact.scenes.flatMap((scene, index) => {
    if (!isRecord(scene) || typeof scene.start_s !== "number" || typeof scene.end_s !== "number") {
      return [];
    }

    const duration = scene.end_s - scene.start_s;
    if (duration >= playbook.pacing.min_scene_s && duration <= playbook.pacing.max_scene_s) {
      return [];
    }

    return [
      {
        severity: "suggestion",
        title: "Scene pacing is outside playbook range",
        location: `${stageSlug}.scenes[${index}]`,
        description: `Scene duration is ${duration}s; playbook range is ${playbook.pacing.min_scene_s}-${playbook.pacing.max_scene_s}s.`,
        proposed_change: `Adjust scene ${index} duration to stay between ${playbook.pacing.min_scene_s}s and ${playbook.pacing.max_scene_s}s.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function checkStyleCues(stageSlug: string, artifact: unknown, playbook: Playbook): Finding[] {
  if (playbook.style_cues.length === 0 || !isRecord(artifact)) {
    return [];
  }

  const findings: Finding[] = [];
  checkDescriptions(`${stageSlug}.scenes`, artifact.scenes, playbook, findings);
  checkDescriptions(`${stageSlug}.assets`, artifact.assets, playbook, findings);

  return findings;
}

function checkDescriptions(path: string, value: unknown, playbook: Playbook, findings: Finding[]): void {
  if (!Array.isArray(value)) {
    return;
  }

  value.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }

    const description = item.description;
    const location = `${path}[${index}].description`;
    const descriptionText = typeof description === "string" ? description : "";
    if (containsStyleCue(descriptionText, playbook.style_cues)) {
      return;
    }

    findings.push({
      severity: "suggestion",
      title: "Asset description is missing playbook style cues",
      location,
      description: "Description does not mention any active playbook style cue.",
      proposed_change: `Revise the description to include one of: "${playbook.style_cues.join(", ")}".`,
      status: "pending",
    });
  });
}

function extractColorRefs(value: string, location: string): string[] {
  const refs: string[] = value.match(HEX_COLOR_PATTERN) ?? [];
  const trimmedValue = value.trim();
  const lowerValue = trimmedValue.toLowerCase();

  if (COMMON_COLOR_NAMES.has(lowerValue) || isColorFieldLocation(location)) {
    refs.push(trimmedValue);
  }

  return [...new Set(refs)];
}

function isTransitionLocation(location: string): boolean {
  return (
    location.endsWith(".transition_in") ||
    location.endsWith(".transition_out") ||
    /(^|\.)transitions\[\d+\]/.test(location)
  );
}

function isColorFieldLocation(location: string): boolean {
  const lastSegment = location.split(".").at(-1);
  if (lastSegment === undefined) {
    return false;
  }

  const fieldName = lastSegment.replace(/\[\d+\]$/, "");
  return COLOR_FIELD_NAMES.has(fieldName);
}

function containsStyleCue(description: string, styleCues: string[]): boolean {
  const normalizedDescription = description.toLowerCase();
  return styleCues.some((cue) => normalizedDescription.includes(cue.toLowerCase()));
}

function visitStrings(value: unknown, path: string, visitor: (value: string, location: string) => void): void {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      visitStrings(item, `${path}[${index}]`, visitor);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  Object.entries(value).forEach(([key, childValue]) => {
    visitStrings(childValue, `${path}.${key}`, visitor);
  });
}

function normalizePaletteToken(token: string): string {
  return token.toLowerCase();
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
