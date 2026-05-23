import { z } from "zod";
import { bodyText, element, label, sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

const RectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const SlideCalloutPropsSchema = BaseScenePropsSchema.extend({
  slide_id: z.string(),
  image_path: z.string(),
  text: z.string(),
  label: z.string().default("Callout"),
  anchor_rect: RectSchema.optional(),
  tone: z.enum(["info", "warning", "success", "danger"]).default("info"),
});

export type SlideCalloutProps = z.input<typeof SlideCalloutPropsSchema>;

export function slide_callout(props: SlideCalloutProps) {
  const parsed = SlideCalloutPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const toneColor = {
    danger: theme.palette.danger,
    info: theme.palette.primary,
    success: theme.palette.accent,
    warning: theme.palette.secondary,
  }[parsed.tone];

  return sceneRoot("slide_callout", parsed, [
    element("slide-background", {
      slide_id: parsed.slide_id,
      src: parsed.image_path,
      style: {
        height: "100%",
        objectFit: "contain",
        opacity: 0.46,
        width: "100%",
      },
    }),
    ...(parsed.anchor_rect
      ? [
          element("slide-highlight-anchor", {
            rect: parsed.anchor_rect,
            style: {
              borderColor: toneColor,
              borderRadius: 8,
              borderWidth: 5,
            },
          }),
        ]
      : []),
    element(
      "callout-panel",
      {
        style: {
          background: theme.palette.surface,
          borderColor: toneColor,
          borderRadius: 8,
          borderWidth: 3,
          bottom: Math.round(parsed.height * 0.1),
          left: Math.round(parsed.width * 0.12),
          padding: 44,
          position: "absolute",
          width: Math.round(parsed.width * 0.46),
        },
      },
      label(theme, parsed.label, { style: { color: toneColor } }),
      bodyText(theme, parsed.text),
    ),
  ]);
}
