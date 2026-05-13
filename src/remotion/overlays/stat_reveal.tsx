import { z } from "zod";
import { bodyText, element, label, sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const StatRevealOverlayPropsSchema = BaseScenePropsSchema.extend({
  label: z.string(),
  value: z.string(),
  caption: z.string().optional(),
});

export type StatRevealOverlayProps = z.input<typeof StatRevealOverlayPropsSchema>;

export function stat_reveal(props: StatRevealOverlayProps) {
  const parsed = StatRevealOverlayPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot(
    "stat_reveal",
    parsed,
    [
      label(theme, parsed.label),
      element("text", {
        role: "overlay-stat",
        text: parsed.value,
        style: { color: theme.palette.primary, fontFamily: theme.typography.display, fontSize: 96, fontWeight: 900 },
      }),
      ...(parsed.caption ? [bodyText(theme, parsed.caption)] : []),
    ],
    { overlay: true },
  );
}
