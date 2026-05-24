import type { z } from "zod";
import { CaptionBurnPropsSchema } from "../captions/index.js";
import {
  AnimeScenePropsSchema,
  BarChartPropsSchema,
  CalloutPropsSchema,
  ComparisonPropsSchema,
  HeroTitlePropsSchema,
  KpiGridPropsSchema,
  LineChartPropsSchema,
  PieChartPropsSchema,
  ProgressBarPropsSchema,
  SlideScenePropsSchema,
  StatCardPropsSchema,
  TerminalScenePropsSchema,
  TextCardPropsSchema,
} from "../scenes/index.js";
import {
  HeroTitleOverlayPropsSchema,
  ProviderChipOverlayPropsSchema,
  SectionTitleOverlayPropsSchema,
  SlideCalloutOverlayPropsSchema,
  SlideHighlightOverlayPropsSchema,
  StatRevealOverlayPropsSchema,
} from "../overlays/index.js";

export const sharedTheme = {
  palette: {
    background: "#07111f",
    surface: "#0f1d32",
    text: "#f8fafc",
    muted: "#93a4ba",
    primary: "#2dd4bf",
    secondary: "#f59e0b",
    accent: "#a3e635",
    danger: "#fb7185",
    grid: "rgba(147, 164, 186, 0.25)",
  },
  typography: {
    display: "Inter Tight",
    body: "Inter",
    mono: "JetBrains Mono",
  },
};

export const textCardFixture = {
  eyebrow: "Market pulse",
  title: "AI editing moves from novelty to workflow",
  subtitle: "Teams are standardizing around repeatable scene systems.",
  body: "This fixture proves rich text cards render without runtime data.",
  align: "left",
  theme: sharedTheme,
} satisfies z.input<typeof TextCardPropsSchema>;

export const statCardFixture = {
  label: "Weekly output",
  value: "3.4x",
  delta: "+28% vs baseline",
  trend: "up",
  footnote: "Measured across scripted episodes.",
  theme: sharedTheme,
} satisfies z.input<typeof StatCardPropsSchema>;

export const calloutFixture = {
  label: "Production note",
  text: "Lock the runtime before compose and log any approved switch.",
  tone: "warning",
  theme: sharedTheme,
} satisfies z.input<typeof CalloutPropsSchema>;

export const comparisonFixture = {
  title: "Runtime fit",
  left: {
    label: "Remotion",
    headline: "React-native composition control",
    points: ["Reusable scenes", "Deterministic props", "Great for product explainers"],
  },
  right: {
    label: "HyperFrames",
    headline: "CSS and motion-first animation",
    points: ["Audio-reactive typography", "GSAP-friendly", "Good for kinetic openings"],
  },
  theme: sharedTheme,
} satisfies z.input<typeof ComparisonPropsSchema>;

export const heroTitleFixture = {
  kicker: "Epic 5",
  title: "Composition tools come online",
  subtitle: "Scene systems, overlays, captions, and runtime adapters.",
  background_label: "deep editorial field",
  theme: sharedTheme,
} satisfies z.input<typeof HeroTitlePropsSchema>;

export const terminalSceneFixture = {
  title: "Compose diagnostics",
  prompt: "showkick$",
  lines: ["load edit_decisions.json", "validate assets", "render runtime=remotion"],
  cursor: true,
  theme: sharedTheme,
} satisfies z.input<typeof TerminalScenePropsSchema>;

export const animeSceneFixture = {
  title: "Character beat",
  character: "Mika",
  action: "leans into a neon wind",
  setting: "a rain-lit station platform",
  mood: "hopeful tension",
  theme: sharedTheme,
} satisfies z.input<typeof AnimeScenePropsSchema>;

export const barChartFixture = {
  title: "Asset mix",
  subtitle: "Final scene plan",
  data: [
    { label: "Video", value: 8 },
    { label: "Image", value: 5 },
    { label: "Overlay", value: 11 },
  ],
  value_suffix: " clips",
  theme: sharedTheme,
} satisfies z.input<typeof BarChartPropsSchema>;

export const lineChartFixture = {
  title: "Pacing curve",
  x_labels: ["0s", "15s", "30s", "45s"],
  series: [
    { label: "energy", points: [0.2, 0.5, 0.9, 0.7] },
    { label: "density", points: [0.1, 0.4, 0.6, 0.8], color: "#f59e0b" },
  ],
  theme: sharedTheme,
} satisfies z.input<typeof LineChartPropsSchema>;

export const pieChartFixture = {
  title: "Attention budget",
  center_label: "60 sec",
  data: [
    { label: "Hook", value: 12 },
    { label: "Proof", value: 32 },
    { label: "Close", value: 16 },
  ],
  theme: sharedTheme,
} satisfies z.input<typeof PieChartPropsSchema>;

export const kpiGridFixture = {
  title: "Episode readiness",
  items: [
    { label: "Scenes", value: "12", delta: "locked" },
    { label: "Assets", value: "18", delta: "ready" },
    { label: "Warnings", value: "0", delta: "clean" },
    { label: "Runtime", value: "remotion", delta: "approved" },
  ],
  theme: sharedTheme,
} satisfies z.input<typeof KpiGridPropsSchema>;

export const progressBarFixture = {
  label: "Render readiness",
  value: 0.76,
  target_label: "validation gate",
  caption: "Pre-compose checks passed; waiting on final runtime.",
  theme: sharedTheme,
} satisfies z.input<typeof ProgressBarPropsSchema>;

export const slideSceneFixture = {
  slide_id: "slide-001",
  image_path: "captures/slides/slide-001.png",
  title: "Deck source becomes motion",
  caption: "Speaker notes drive the voiceover and timing.",
  focus_rect: { x: 0.12, y: 0.18, width: 0.42, height: 0.34 },
  motion: { type: "pan_right", zoom_start: 1, zoom_end: 1.09 },
  highlights: [
    {
      rect: { x: 0.1, y: 0.16, width: 0.46, height: 0.2 },
      shape: "rect",
      label: "source evidence",
    },
  ],
  callouts: [
    {
      text: "Review before TTS",
      target_rect: { x: 0.58, y: 0.52, width: 0.28, height: 0.16 },
      anchor: "right",
    },
  ],
  theme: sharedTheme,
} satisfies z.input<typeof SlideScenePropsSchema>;

export const sectionTitleOverlayFixture = {
  section: "03",
  title: "Validation Gate",
  subtitle: "Lint, validate, render",
  theme: sharedTheme,
} satisfies z.input<typeof SectionTitleOverlayPropsSchema>;

export const statRevealOverlayFixture = {
  label: "Caption sync",
  value: "±33ms",
  caption: "Within the word-timestamp tolerance.",
  theme: sharedTheme,
} satisfies z.input<typeof StatRevealOverlayPropsSchema>;

export const heroTitleOverlayFixture = {
  badge: "Live",
  title: "Runtime locked",
  subtitle: "No silent swaps after proposal approval.",
  theme: sharedTheme,
} satisfies z.input<typeof HeroTitleOverlayPropsSchema>;

export const providerChipOverlayFixture = {
  provider: "remotion",
  model: "scene-library",
  status: "approved",
  theme: sharedTheme,
} satisfies z.input<typeof ProviderChipOverlayPropsSchema>;

export const slideHighlightOverlayFixture = {
  rect: { x: 0.14, y: 0.22, width: 0.38, height: 0.18 },
  shape: "rect",
  label: "approved slide reference",
  theme: sharedTheme,
} satisfies z.input<typeof SlideHighlightOverlayPropsSchema>;

export const slideCalloutOverlayFixture = {
  text: "Timing follows narration",
  target_rect: { x: 0.56, y: 0.48, width: 0.24, height: 0.2 },
  anchor: "right",
  theme: sharedTheme,
} satisfies z.input<typeof SlideCalloutOverlayPropsSchema>;

export const captionBurnOverlayFixture = {
  words: [
    { text: "Timing", start_s: 0, end_s: 0.4, confidence: 1 },
    { text: "follows", start_s: 0.4, end_s: 0.8, confidence: 1 },
    { text: "narration", start_s: 0.8, end_s: 1.2, confidence: 1 },
  ],
  theme: sharedTheme,
} satisfies z.input<typeof CaptionBurnPropsSchema>;

export const sceneFixtures = {
  anime_scene: animeSceneFixture,
  bar_chart: barChartFixture,
  callout: calloutFixture,
  comparison: comparisonFixture,
  hero_title: heroTitleFixture,
  kpi_grid: kpiGridFixture,
  line_chart: lineChartFixture,
  pie_chart: pieChartFixture,
  progress_bar: progressBarFixture,
  slide_scene: slideSceneFixture,
  stat_card: statCardFixture,
  terminal_scene: terminalSceneFixture,
  text_card: textCardFixture,
};

export const overlayFixtures = {
  caption_burn: captionBurnOverlayFixture,
  hero_title: heroTitleOverlayFixture,
  provider_chip: providerChipOverlayFixture,
  section_title: sectionTitleOverlayFixture,
  slide_callout: slideCalloutOverlayFixture,
  slide_highlight: slideHighlightOverlayFixture,
  stat_reveal: statRevealOverlayFixture,
};
