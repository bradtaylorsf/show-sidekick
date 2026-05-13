---
name: remotion
description: Scene type catalog for predit Remotion-compatible composition scenes and overlays.
---

# Remotion Scene Catalog

The composition scene library lives in `src/remotion/`. Each scene exports a component function plus a Zod prop schema, and each entry has a fixture in `src/remotion/fixtures/index.ts`.

## Full Scenes

| Type | Purpose | Primary Props | Source |
|---|---|---|---|
| `text_card` | Rich title/body text scene for explainers and transition beats. | `eyebrow`, `title`, `subtitle`, `body`, `align` | `src/remotion/scenes/text_card.tsx` |
| `stat_card` | Single KPI with optional delta and footnote. | `label`, `value`, `delta`, `trend`, `footnote` | `src/remotion/scenes/stat_card.tsx` |
| `callout` | High-emphasis production note or warning. | `label`, `text`, `tone` | `src/remotion/scenes/callout.tsx` |
| `comparison` | Two-column contrast scene. | `title`, `left`, `right` | `src/remotion/scenes/comparison.tsx` |
| `hero_title` | First-frame title treatment for an episode or major section. | `kicker`, `title`, `subtitle`, `background_label` | `src/remotion/scenes/hero_title.tsx` |
| `terminal_scene` | Console-style diagnostic or command sequence. | `title`, `prompt`, `lines`, `cursor` | `src/remotion/scenes/terminal_scene.tsx` |
| `anime_scene` | Stylized character/action beat. | `title`, `character`, `action`, `setting`, `mood` | `src/remotion/scenes/anime_scene.tsx` |
| `bar_chart` | Ranked values as horizontal bars. | `title`, `subtitle`, `data`, `value_suffix` | `src/remotion/scenes/bar_chart.tsx` |
| `line_chart` | One or more time-series or pacing curves. | `title`, `x_labels`, `series` | `src/remotion/scenes/line_chart.tsx` |
| `pie_chart` | Part-to-whole breakdown. | `title`, `data`, `center_label` | `src/remotion/scenes/pie_chart.tsx` |
| `kpi_grid` | Compact dashboard of repeated KPI tiles. | `title`, `items` | `src/remotion/scenes/kpi_grid.tsx` |
| `progress_bar` | Single completion or readiness bar. | `label`, `value`, `target_label`, `caption` | `src/remotion/scenes/progress_bar.tsx` |

## Overlays

| Type | Purpose | Primary Props | Source |
|---|---|---|---|
| `section_title` | Transparent title overlay for section breaks. | `section`, `title`, `subtitle` | `src/remotion/overlays/section_title.tsx` |
| `stat_reveal` | Transparent KPI reveal overlay. | `label`, `value`, `caption` | `src/remotion/overlays/stat_reveal.tsx` |
| `hero_title` | Transparent hero title overlay variant. | `badge`, `title`, `subtitle` | `src/remotion/overlays/hero_title.tsx` |
| `provider_chip` | Small provider/model/status chip. | `provider`, `model`, `status` | `src/remotion/overlays/provider_chip.tsx` |

Use `sceneCatalog`, `overlayCatalog`, `renderSceneByType`, and `renderOverlayByType` from `src/remotion/index.ts` when routing composition specs to concrete scene components.

## Captions And Runtime Bridge

Word-level caption burn lives in `src/remotion/captions/caption-burn.tsx`. It consumes cuesheet words shaped as `{ text, start_s, end_s }`, applies `caption_style` from the playbook, and validates frame quantization with a 50ms tolerance.

The same playbook styling feeds HyperFrames through `hyperframes_style_bridge` in `src/compose/hyperframes-style-bridge.ts`, which maps palette, typography, motion, and caption style fields to CSS variables.
