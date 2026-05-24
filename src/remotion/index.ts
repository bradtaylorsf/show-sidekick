import type { z } from "zod";
import { renderAtFrame, type RemotionComponent, type SceneNode } from "./primitives.js";
import {
  anime_scene,
  AnimeScenePropsSchema,
  bar_chart,
  BarChartPropsSchema,
  callout,
  CalloutPropsSchema,
  comparison,
  ComparisonPropsSchema,
  hero_title,
  HeroTitlePropsSchema,
  kpi_grid,
  KpiGridPropsSchema,
  line_chart,
  LineChartPropsSchema,
  pie_chart,
  PieChartPropsSchema,
  progress_bar,
  ProgressBarPropsSchema,
  slide_scene,
  SlideScenePropsSchema,
  stat_card,
  StatCardPropsSchema,
  terminal_scene,
  TerminalScenePropsSchema,
  text_card,
  TextCardPropsSchema,
} from "./scenes/index.js";
import {
  caption_burn,
  CaptionBurnPropsSchema,
} from "./captions/index.js";
import {
  overlay_hero_title,
  HeroTitleOverlayPropsSchema,
  provider_chip,
  ProviderChipOverlayPropsSchema,
  section_title,
  SectionTitleOverlayPropsSchema,
  slide_callout,
  SlideCalloutOverlayPropsSchema,
  slide_highlight,
  SlideHighlightOverlayPropsSchema,
  stat_reveal,
  StatRevealOverlayPropsSchema,
} from "./overlays/index.js";

export * from "./fixtures/index.js";
export * from "./captions/index.js";
export * from "./overlays/index.js";
export * from "./primitives.js";
export * from "./scenes/index.js";
export * from "./types.js";

export type RemotionCatalogEntry<Props> = {
  component: RemotionComponent<Props>;
  schema: z.ZodSchema<Props>;
};

export const sceneCatalog = {
  anime_scene: { component: anime_scene, schema: AnimeScenePropsSchema },
  bar_chart: { component: bar_chart, schema: BarChartPropsSchema },
  callout: { component: callout, schema: CalloutPropsSchema },
  comparison: { component: comparison, schema: ComparisonPropsSchema },
  hero_title: { component: hero_title, schema: HeroTitlePropsSchema },
  kpi_grid: { component: kpi_grid, schema: KpiGridPropsSchema },
  line_chart: { component: line_chart, schema: LineChartPropsSchema },
  pie_chart: { component: pie_chart, schema: PieChartPropsSchema },
  progress_bar: { component: progress_bar, schema: ProgressBarPropsSchema },
  slide_scene: { component: slide_scene, schema: SlideScenePropsSchema },
  stat_card: { component: stat_card, schema: StatCardPropsSchema },
  terminal_scene: { component: terminal_scene, schema: TerminalScenePropsSchema },
  text_card: { component: text_card, schema: TextCardPropsSchema },
} as const;

export const overlayCatalog = {
  caption_burn: { component: caption_burn, schema: CaptionBurnPropsSchema },
  hero_title: { component: overlay_hero_title, schema: HeroTitleOverlayPropsSchema },
  provider_chip: { component: provider_chip, schema: ProviderChipOverlayPropsSchema },
  section_title: { component: section_title, schema: SectionTitleOverlayPropsSchema },
  slide_callout: { component: slide_callout, schema: SlideCalloutOverlayPropsSchema },
  slide_highlight: { component: slide_highlight, schema: SlideHighlightOverlayPropsSchema },
  stat_reveal: { component: stat_reveal, schema: StatRevealOverlayPropsSchema },
} as const;

export type SceneType = keyof typeof sceneCatalog;
export type OverlayType = keyof typeof overlayCatalog;

export function renderSceneByType(type: SceneType, props: unknown, frame = 0): SceneNode {
  const entry = sceneCatalog[type];
  return renderAtFrame(entry.component as RemotionComponent<unknown>, entry.schema.parse(props), frame);
}

export function renderOverlayByType(type: OverlayType, props: unknown, frame = 0): SceneNode {
  const entry = overlayCatalog[type];
  return renderAtFrame(entry.component as RemotionComponent<unknown>, entry.schema.parse(props), frame);
}
