import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { BundledPlaybookSchema, type BundledPlaybook } from "./schema.js";

export type PlaybookGenerationInput =
  | string
  | {
      name?: string;
      slug?: string;
      brief?: string;
      videoAnalysisBrief?: VideoAnalysisBrief;
    };

type InferredStyle = {
  category: BundledPlaybook["identity"]["category"];
  mood: string;
  pace: BundledPlaybook["identity"]["pace"];
  palette: {
    primary: string[];
    accent: string[];
    background: string;
    text: string;
    muted: string;
  };
  fonts: {
    headings: string;
    body: string;
    code: string;
  };
  transitions: string[];
  animationStyle: string;
  minSceneS: number;
  maxSceneS: number;
  musicMood: string;
  promptPrefix: string;
  texture: string;
};

export function generatePlaybook(input: PlaybookGenerationInput): BundledPlaybook {
  const options: Exclude<PlaybookGenerationInput, string> = typeof input === "string" ? { brief: input } : input;
  const brief = options.brief ?? summarizeVideoAnalysisBrief(options.videoAnalysisBrief) ?? "custom video";
  const name = options.name ?? titleFromBrief(brief);
  const inferred = inferStyle(brief, options.videoAnalysisBrief);
  const flatPalette = [
    ...inferred.palette.primary,
    ...inferred.palette.accent,
    inferred.palette.background,
    inferred.palette.text,
    inferred.palette.muted,
  ];

  return BundledPlaybookSchema.parse({
    identity: {
      name,
      category: inferred.category,
      mood: inferred.mood,
      pace: inferred.pace,
      best_for: `Generated starter playbook for ${brief.slice(0, 96)}`,
    },
    slug: options.slug,
    visual_language: {
      color_palette: inferred.palette,
      composition: "clear focal hierarchy with safe margins for captions and editor handoff",
      texture: inferred.texture,
    },
    typography: {
      headings: { font: inferred.fonts.headings, weight: 800, tracking: "0em" },
      body: { font: inferred.fonts.body, weight: 400, line_height: 1.45 },
      code: { font: inferred.fonts.code, weight: 400 },
      stat_card: { font: inferred.fonts.headings, weight: 900, size_multiplier: 2.6 },
      scale_system: "major_third",
      weight_matrix: { title: 800, heading: 700, body: 400, caption: 500 },
    },
    motion: {
      transitions: inferred.transitions,
      animation_style: inferred.animationStyle,
      pacing_rules: {
        min_scene_hold_seconds: inferred.minSceneS,
        max_scene_hold_seconds: inferred.maxSceneS,
        text_card_hold_seconds: Math.max(2.5, inferred.minSceneS + 0.5),
        stat_card_hold_seconds: Math.max(3, inferred.minSceneS + 0.5),
        transition_duration_seconds: inferred.pace === "rapid" ? 0.25 : 0.4,
      },
      entrance: "purposeful fade or slide tied to scene intent",
      exit: "clean cut or fade before the next beat",
    },
    audio: {
      voice_style: inferred.category === "cinematic" ? "measured, textured, emotionally controlled" : "clear, conversational, confident",
      music_mood: inferred.musicMood,
      music_volume: inferred.category === "cinematic" ? 0.16 : 0.1,
      sfx_style: "subtle transitions only when they clarify the beat",
      ducking_threshold_db: -3,
    },
    asset_generation: {
      image_prompt_prefix: inferred.promptPrefix,
      consistency_anchors: [
        `Primary palette: ${inferred.palette.primary.join(", ")}`,
        `Accent palette: ${inferred.palette.accent.join(", ")}`,
        `Texture: ${inferred.texture}`,
      ],
    },
    quality_rules: [
      "Text must remain readable at 720p.",
      "Keep palette, typography, and motion consistent across scenes.",
      "Do not let decorative motion obscure the content.",
      "Honor the approved delivery promise and runtime decision.",
    ],
    chart_palette: [...inferred.palette.primary, ...inferred.palette.accent, "#10B981", "#EF4444"],
    color_rules: {
      harmony_type: inferred.category === "cinematic" ? "split-complementary" : "analogous",
      contrast_validation: true,
      colorblind_safe: true,
    },
    palette: flatPalette,
    transitions_allowed: inferred.transitions,
    pacing: {
      min_scene_s: inferred.minSceneS,
      max_scene_s: inferred.maxSceneS,
    },
    style_cues: [
      inferred.mood,
      inferred.texture,
      inferred.animationStyle,
      ...inferred.palette.primary,
      ...inferred.palette.accent,
    ],
  });
}

function inferStyle(brief: string, videoAnalysisBrief?: VideoAnalysisBrief): InferredStyle {
  const text = `${brief} ${videoAnalysisBrief?.pacing_style ?? ""} ${videoAnalysisBrief?.promise_elements.join(" ") ?? ""}`.toLowerCase();
  const motionClipRatio = videoAnalysisBrief ? ratio(videoAnalysisBrief.scenes.filter((scene) => scene.motion_type === "motion_clip").length, videoAnalysisBrief.scenes.length) : 0;

  if (/(cinematic|trailer|dramatic|film|documentary|noir)/u.test(text) || motionClipRatio > 0.5) {
    return {
      category: "cinematic",
      mood: "cinematic, dramatic, focused",
      pace: text.includes("slow") ? "deliberate" : "moderate",
      palette: {
        primary: ["#0F172A", "#334155"],
        accent: ["#F59E0B", "#38BDF8"],
        background: "#020617",
        text: "#F8FAFC",
        muted: "#94A3B8",
      },
      fonts: { headings: "Inter Tight", body: "Inter", code: "JetBrains Mono" },
      transitions: ["cut", "fade", "match-cut"],
      animationStyle: "restrained cinematic moves with motivated reveals",
      minSceneS: 3,
      maxSceneS: 8,
      musicMood: "cinematic pulse, controlled tension",
      promptPrefix: "cinematic editorial frame, motivated lighting, strong composition, ",
      texture: "subtle film grain, high-contrast depth",
    };
  }

  if (/(news|broadcast|report|headline|politic|election)/u.test(text)) {
    return {
      category: "motion-graphics",
      mood: "urgent, credible, editorial",
      pace: "fast",
      palette: {
        primary: ["#1D4ED8", "#0F172A"],
        accent: ["#DC2626", "#FACC15"],
        background: "#F8FAFC",
        text: "#111827",
        muted: "#64748B",
      },
      fonts: { headings: "Inter Tight", body: "Inter", code: "JetBrains Mono" },
      transitions: ["cut", "wipe", "lower-third"],
      animationStyle: "snappy editorial motion with clear lower-third hierarchy",
      minSceneS: 2,
      maxSceneS: 6,
      musicMood: "news bed, focused, urgent but not chaotic",
      promptPrefix: "editorial news graphic, crisp lighting, high legibility, ",
      texture: "broadcast clean with subtle data texture",
    };
  }

  if (/(playful|hip hop|rap|bold|energetic|youth|social)/u.test(text)) {
    return {
      category: "motion-graphics",
      mood: "playful, bold, kinetic",
      pace: "rapid",
      palette: {
        primary: ["#7C3AED", "#0EA5E9"],
        accent: ["#F97316", "#EC4899"],
        background: "#FFFFFF",
        text: "#111827",
        muted: "#64748B",
      },
      fonts: { headings: "Outfit", body: "Inter", code: "JetBrains Mono" },
      transitions: ["cut", "pop", "slide"],
      animationStyle: "kinetic, beat-aware, playful but readable",
      minSceneS: 1.5,
      maxSceneS: 5,
      musicMood: "upbeat rhythmic groove",
      promptPrefix: "bold playful motion-graphics style, high energy, ",
      texture: "clean digital with punchy accents",
    };
  }

  return {
    category: "motion-graphics",
    mood: "polished, trustworthy, clear",
    pace: pacingFromBrief(text),
    palette: {
      primary: ["#2563EB", "#1E40AF"],
      accent: ["#F59E0B", "#10B981"],
      background: "#FFFFFF",
      text: "#1F2937",
      muted: "#6B7280",
    },
    fonts: { headings: "Inter", body: "Inter", code: "JetBrains Mono" },
    transitions: ["cut", "fade", "slide-left"],
    animationStyle: "clean ease-in-out motion with no decorative bounce",
    minSceneS: 2.5,
    maxSceneS: 10,
    musicMood: "ambient, focused, supportive",
    promptPrefix: "clean professional flat illustration, high legibility, ",
    texture: "clean flat, no noise",
  };
}

function pacingFromBrief(text: string): InferredStyle["pace"] {
  if (/(rapid|fast|shorts|tiktok|reels|urgent)/u.test(text)) {
    return "fast";
  }
  if (/(slow|calm|deliberate|meditative)/u.test(text)) {
    return "deliberate";
  }
  return "moderate";
}

function summarizeVideoAnalysisBrief(brief?: VideoAnalysisBrief): string | undefined {
  if (!brief) {
    return undefined;
  }

  const subjects = brief.scenes
    .flatMap((scene) => scene.subject)
    .filter(Boolean)
    .slice(0, 4)
    .join(", ");
  const pacing = brief.pacing_style ? `${brief.pacing_style} pacing` : "analyzed pacing";

  return subjects ? `${pacing} reference with ${subjects}` : `${pacing} reference-driven video`;
}

function titleFromBrief(brief: string): string {
  const words = brief
    .replace(/[^a-zA-Z0-9 ]/gu, " ")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 5);

  return words.length > 0 ? words.map(capitalize).join(" ") : "Custom Playbook";
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}
