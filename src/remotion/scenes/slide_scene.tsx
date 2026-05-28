import { z } from "zod";
import { element, interpolate, useCurrentFrame } from "../primitives.js";
import { sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const SlideRectPropsSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const SlideHighlightPropsSchema = z.object({
  rect: SlideRectPropsSchema,
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  label: z.string().optional(),
});

export const SlideCalloutPropsSchema = z.object({
  text: z.string(),
  target_rect: SlideRectPropsSchema.optional(),
  anchor: z.enum(["top", "right", "bottom", "left"]).default("right"),
});

export const SlideMotionPropsSchema = z.object({
  type: z.enum(["push_in", "pull_out", "pan_left", "pan_right", "pan_up", "pan_down", "static"]).default("push_in"),
  zoom_start: z.number().positive().default(1),
  zoom_end: z.number().positive().default(1.08),
});

export const SlideScenePropsSchema = BaseScenePropsSchema.extend({
  slide_id: z.string(),
  image_path: z.string(),
  title: z.string().optional(),
  caption: z.string().optional(),
  focus_rect: SlideRectPropsSchema.optional(),
  motion: SlideMotionPropsSchema.default({}),
  highlights: z.array(SlideHighlightPropsSchema).default([]),
  callouts: z.array(SlideCalloutPropsSchema).default([]),
});

export type SlideSceneProps = z.input<typeof SlideScenePropsSchema>;

export function slide_scene(props: SlideSceneProps) {
  const parsed = SlideScenePropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, parsed.duration_frames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scale = parsed.motion.type === "pull_out"
    ? interpolate(progress, [0, 1], [parsed.motion.zoom_end, parsed.motion.zoom_start])
    : parsed.motion.type === "static"
      ? parsed.motion.zoom_start
      : interpolate(progress, [0, 1], [parsed.motion.zoom_start, parsed.motion.zoom_end]);
  const pan = panForMotion(parsed.motion.type, progress);

  return sceneRoot("slide_scene", parsed, [
    element("slide-frame", {
      slide_id: parsed.slide_id,
      style: {
        background: theme.palette.surface,
        borderColor: theme.palette.grid,
        borderRadius: 8,
        borderWidth: 2,
        height: parsed.height * 0.82,
        left: parsed.width * 0.055,
        overflow: "hidden",
        position: "absolute",
        top: parsed.height * 0.055,
        width: parsed.width * 0.89,
      },
    },
      element("slide-image", {
        focus_rect: parsed.focus_rect,
        src: parsed.image_path,
        style: {
          height: "100%",
          objectFit: "contain",
          transform: `scale(${scale}) translate(${pan.x}%, ${pan.y}%)`,
          transformOrigin: focusOrigin(parsed.focus_rect),
          width: "100%",
        },
      }),
      ...parsed.highlights.map((highlight, index) =>
        element("slide-highlight", {
          index,
          label: highlight.label,
          shape: highlight.shape,
          style: rectStyle(highlight.rect, {
            borderColor: theme.palette.secondary,
            borderRadius: highlight.shape === "ellipse" ? "999px" : "8px",
            borderWidth: 4,
            boxShadow: `0 0 0 9999px rgba(7, 17, 31, ${0.2 + progress * 0.12})`,
          }),
        }),
      ),
      ...parsed.callouts.map((callout, index) =>
        element("slide-callout", {
          anchor: callout.anchor,
          index,
          target_rect: callout.target_rect,
          text: callout.text,
          style: calloutStyle(callout.anchor, theme.palette.primary, index),
        }),
      ),
    ),
    parsed.title === undefined
      ? null
      : element("text", {
          role: "slide-title",
          text: parsed.title,
          style: {
            color: theme.palette.text,
            fontFamily: theme.typography.display,
            fontSize: 36,
            fontWeight: 800,
            left: parsed.width * 0.06,
            letterSpacing: 0,
            position: "absolute",
            top: parsed.height * 0.9,
          },
        }),
    parsed.caption === undefined
      ? null
      : element("caption", {
          text: parsed.caption,
          style: {
            background: "rgba(7, 17, 31, 0.78)",
            bottom: 28,
            color: theme.palette.text,
            fontSize: 30,
            left: parsed.width * 0.18,
            lineHeight: 1.2,
            padding: "18px 24px",
            position: "absolute",
            right: parsed.width * 0.18,
          },
        }),
  ]);
}

function panForMotion(type: z.infer<typeof SlideMotionPropsSchema>["type"], progress: number): { x: number; y: number } {
  const amount = 2.8;
  switch (type) {
    case "pan_left":
      return { x: -amount * progress, y: 0 };
    case "pan_right":
      return { x: amount * progress, y: 0 };
    case "pan_up":
      return { x: 0, y: -amount * progress };
    case "pan_down":
      return { x: 0, y: amount * progress };
    default:
      return { x: 0, y: 0 };
  }
}

function focusOrigin(rect: z.infer<typeof SlideRectPropsSchema> | undefined): string {
  if (rect === undefined) {
    return "50% 50%";
  }

  return `${Math.round((rect.x + rect.width / 2) * 100)}% ${Math.round((rect.y + rect.height / 2) * 100)}%`;
}

function rectStyle(rect: z.infer<typeof SlideRectPropsSchema>, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    height: `${Math.round(rect.height * 100)}%`,
    left: `${Math.round(rect.x * 100)}%`,
    position: "absolute",
    top: `${Math.round(rect.y * 100)}%`,
    width: `${Math.round(rect.width * 100)}%`,
    ...extra,
  };
}

function calloutStyle(anchor: "top" | "right" | "bottom" | "left", color: string, index: number): Record<string, unknown> {
  const base = {
    background: color,
    borderRadius: 8,
    color: "#07111f",
    fontSize: 24,
    fontWeight: 800,
    maxWidth: 360,
    padding: "18px 22px",
    position: "absolute",
  };

  if (anchor === "left") {
    return { ...base, left: 24, top: 80 + index * 92 };
  }
  if (anchor === "top") {
    return { ...base, left: 92 + index * 420, top: 24 };
  }
  if (anchor === "bottom") {
    return { ...base, bottom: 24, left: 92 + index * 420 };
  }
  return { ...base, right: 24, top: 80 + index * 92 };
}
