import { z } from "zod";
import { element } from "../primitives.js";
import { sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";
import { SlideRectPropsSchema } from "../scenes/slide_scene.js";

export const SlideCalloutOverlayPropsSchema = BaseScenePropsSchema.extend({
  text: z.string(),
  target_rect: SlideRectPropsSchema.optional(),
  anchor: z.enum(["top", "right", "bottom", "left"]).default("right"),
  color: z.string().optional(),
});

export type SlideCalloutOverlayProps = z.input<typeof SlideCalloutOverlayPropsSchema>;

export function slide_callout(props: SlideCalloutOverlayProps) {
  const parsed = SlideCalloutOverlayPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const color = parsed.color ?? theme.palette.primary;

  return sceneRoot(
    "slide_callout",
    parsed,
    [
      parsed.target_rect === undefined
        ? null
        : element("callout-target", {
            style: {
              borderColor: color,
              borderRadius: 8,
              borderWidth: 4,
              height: `${Math.round(parsed.target_rect.height * 100)}%`,
              left: `${Math.round(parsed.target_rect.x * 100)}%`,
              position: "absolute",
              top: `${Math.round(parsed.target_rect.y * 100)}%`,
              width: `${Math.round(parsed.target_rect.width * 100)}%`,
            },
          }),
      element("callout-bubble", {
        anchor: parsed.anchor,
        text: parsed.text,
        style: {
          background: color,
          borderRadius: 8,
          color: "#07111f",
          fontFamily: theme.typography.body,
          fontSize: 28,
          fontWeight: 800,
          maxWidth: 440,
          padding: "20px 24px",
          position: "absolute",
          ...bubblePosition(parsed.anchor),
        },
      }),
    ],
    { overlay: true },
  );
}

function bubblePosition(anchor: "top" | "right" | "bottom" | "left"): Record<string, unknown> {
  if (anchor === "top") {
    return { left: "22%", top: "6%" };
  }
  if (anchor === "bottom") {
    return { bottom: "8%", left: "22%" };
  }
  if (anchor === "left") {
    return { left: "5%", top: "36%" };
  }
  return { right: "5%", top: "36%" };
}
