import { z } from "zod";
import { element } from "../primitives.js";
import { sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";
import { SlideRectPropsSchema } from "../scenes/slide_scene.js";

export const SlideHighlightOverlayPropsSchema = BaseScenePropsSchema.extend({
  rect: SlideRectPropsSchema,
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  label: z.string().optional(),
  color: z.string().optional(),
});

export type SlideHighlightOverlayProps = z.input<typeof SlideHighlightOverlayPropsSchema>;

export function slide_highlight(props: SlideHighlightOverlayProps) {
  const parsed = SlideHighlightOverlayPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const color = parsed.color ?? theme.palette.secondary;

  return sceneRoot(
    "slide_highlight",
    parsed,
    [
      element("slide-highlight-overlay", {
        label: parsed.label,
        shape: parsed.shape,
        style: {
          borderColor: color,
          borderRadius: parsed.shape === "ellipse" ? "999px" : "8px",
          borderWidth: 5,
          height: `${Math.round(parsed.rect.height * 100)}%`,
          left: `${Math.round(parsed.rect.x * 100)}%`,
          position: "absolute",
          top: `${Math.round(parsed.rect.y * 100)}%`,
          width: `${Math.round(parsed.rect.width * 100)}%`,
        },
      }),
    ],
    { overlay: true },
  );
}
