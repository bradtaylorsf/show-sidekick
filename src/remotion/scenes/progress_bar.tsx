import { z } from "zod";
import { bodyText, element, label, sceneRoot, title } from "../scene-helpers.js";
import { clamp, spring, useCurrentFrame } from "../primitives.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const ProgressBarPropsSchema = BaseScenePropsSchema.extend({
  label: z.string(),
  value: z.number().min(0).max(1),
  target_label: z.string().optional(),
  caption: z.string().optional(),
});

export type ProgressBarProps = z.input<typeof ProgressBarPropsSchema>;

export function progress_bar(props: ProgressBarProps) {
  const parsed = ProgressBarPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const easedValue = clamp(parsed.value * spring({ frame: useCurrentFrame(), fps: parsed.fps }), 0, parsed.value);

  return sceneRoot("progress_bar", parsed, [
    label(theme, parsed.label),
    title(theme, `${Math.round(parsed.value * 100)}%`),
    element("progress-track", { target_label: parsed.target_label }, element("progress-fill", { value: Math.round(easedValue * 10000) / 10000 })),
    ...(parsed.caption ? [bodyText(theme, parsed.caption)] : []),
  ]);
}
