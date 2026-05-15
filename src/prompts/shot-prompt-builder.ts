export const _SHOT_SIZE_PHRASES = {
  extreme_wide: "extreme wide establishing shot",
  wide: "wide shot with full environment context",
  full: "full-body shot with the subject head to toe",
  medium_wide: "medium-wide shot balancing subject and surroundings",
  medium: "medium shot framed from the waist up",
  medium_close_up: "medium close-up framed from the chest up",
  close_up: "close-up emphasizing face or key object detail",
  extreme_close_up: "extreme close-up isolating a small detail",
  over_the_shoulder: "over-the-shoulder composition",
  point_of_view: "point-of-view framing from the subject's perspective",
} as const;

export const _MOVEMENT_PHRASES = {
  static: "locked-off static camera with no movement, zoom, or focus shift",
  dolly_in: "dolly forward toward the subject",
  dolly_out: "dolly backward away from the subject",
  truck_left: "truck left with lateral camera translation",
  truck_right: "truck right with lateral camera translation",
  pedestal_up: "pedestal up as the camera rises vertically",
  pedestal_down: "pedestal down as the camera lowers vertically",
  pan_left: "pan left with the camera pivoting in place",
  pan_right: "pan right with the camera pivoting in place",
  tilt_up: "tilt up with the camera pivoting vertically",
  tilt_down: "tilt down with the camera pivoting vertically",
  zoom_in: "zoom in through focal-length change, not physical movement",
  zoom_out: "zoom out through focal-length change, not physical movement",
  rack_focus: "rack focus between foreground and background subjects",
  orbit: "orbit around the subject in a smooth arc",
  crane: "crane movement revealing height and scale",
  handheld: "handheld movement with natural micro-shake",
  tracking: "tracking follow shot matched to subject movement",
} as const;

export const _LIGHTING_PHRASES = {
  natural: "natural light with realistic softness",
  golden_hour: "golden-hour warm sunlight with long shadows",
  high_key: "high-key bright even lighting",
  low_key: "low-key high-contrast lighting",
  rembrandt: "Rembrandt portrait lighting with a cheek triangle",
  film_noir: "film noir lighting with stark highlights and deep shadows",
  volumetric: "volumetric light rays through atmosphere",
  backlighting: "backlighting separating the subject from the background",
  side_lighting: "side lighting with directional shadow shape",
  practical_lights: "practical lights visible in the frame",
  rim_light: "rim light outlining the subject edge",
} as const;

export const _DOF_PHRASES = {
  shallow: "shallow depth of field with subject isolation",
  deep: "deep focus with foreground, midground, and background readable",
  rack: "rack focus changing the focal plane during the shot",
} as const;

export const _COLOR_TEMP_PHRASES = {
  warm: "warm tungsten or amber color temperature",
  cool: "cool daylight or blue color temperature",
  neutral: "neutral balanced color temperature",
  mixed: "mixed color temperature with motivated practical contrast",
} as const;

export type AspectValue = string | { value?: string; naReason?: string };

export type ShotPromptInput = {
  subject: AspectValue;
  subjectMotion: AspectValue;
  scene: AspectValue;
  spatialFraming: AspectValue;
  camera: AspectValue;
};

const ASPECTS = [
  ["Subject", "subject"],
  ["Subject Motion", "subjectMotion"],
  ["Scene", "scene"],
  ["Spatial Framing", "spatialFraming"],
  ["Camera", "camera"],
] as const satisfies readonly (readonly [string, keyof ShotPromptInput])[];

export function buildShotPrompt(input: ShotPromptInput, playbookStyle?: string): string {
  const aspectSentences = ASPECTS.map(([label, key]) => `${label}: ${formatAspect(input[key])}.`);
  const prompt = aspectSentences.join(" ");
  const suffix = playbookStyle?.trim();

  return suffix ? `${prompt} Style: ${suffix}.` : prompt;
}

function formatAspect(value: AspectValue): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? "N/A" : trimmed;
  }

  const naReason = value.naReason?.trim();
  if (naReason) {
    return `N/A — ${naReason}`;
  }

  const text = value.value?.trim();
  return text ? text : "N/A";
}
