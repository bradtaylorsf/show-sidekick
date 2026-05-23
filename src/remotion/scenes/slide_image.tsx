import { z } from "zod";
import { element, sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";
import { interpolate, useCurrentFrame } from "../primitives.js";

const RectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const SlideImagePropsSchema = BaseScenePropsSchema.extend({
  slide_id: z.string(),
  image_path: z.string(),
  title: z.string().optional(),
  motion: z
    .object({
      kind: z.enum(["static", "zoom_pan", "push_in", "pull_out", "pan", "support_visual"]).default("zoom_pan"),
      start_zoom: z.number().positive().default(1),
      end_zoom: z.number().positive().default(1.06),
      pan_x: z.number().default(0),
      pan_y: z.number().default(0),
    })
    .default({}),
  highlights: z
    .array(
      z.object({
        rect: RectSchema,
        label: z.string().optional(),
        tone: z.enum(["info", "warning", "success", "danger"]).default("info"),
      }),
    )
    .default([]),
  callouts: z
    .array(
      z.object({
        text: z.string(),
        anchor_rect: RectSchema.optional(),
        position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]).default("bottom-right"),
        tone: z.enum(["info", "warning", "success", "danger"]).default("info"),
      }),
    )
    .default([]),
  caption: z.string().optional(),
});

export type SlideImageProps = z.input<typeof SlideImagePropsSchema>;

export function slide_image(props: SlideImageProps) {
  const parsed = SlideImagePropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, Math.max(1, parsed.duration_frames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const zoom = parsed.motion.kind === "static"
    ? parsed.motion.start_zoom
    : interpolate(progress, [0, 1], [parsed.motion.start_zoom, parsed.motion.end_zoom], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  const translateX = parsed.motion.kind === "static" ? 0 : Math.round(parsed.motion.pan_x * parsed.width * progress);
  const translateY = parsed.motion.kind === "static" ? 0 : Math.round(parsed.motion.pan_y * parsed.height * progress);
  const toneColor = {
    danger: theme.palette.danger,
    info: theme.palette.primary,
    success: theme.palette.accent,
    warning: theme.palette.secondary,
  };

  return sceneRoot("slide_image", parsed, [
    element(
      "slide-frame",
      {
        image_path: parsed.image_path,
        slide_id: parsed.slide_id,
        style: {
          background: theme.palette.surface,
          borderColor: theme.palette.grid,
          borderRadius: 8,
          borderWidth: 2,
          height: Math.round(parsed.height * 0.82),
          left: Math.round(parsed.width * 0.055),
          overflow: "hidden",
          position: "absolute",
          top: Math.round(parsed.height * 0.06),
          width: Math.round(parsed.width * 0.89),
        },
      },
      element("slide-image", {
        alt: parsed.title ?? parsed.slide_id,
        src: parsed.image_path,
        style: {
          height: "100%",
          objectFit: "contain",
          transform: `scale(${zoom}) translate(${translateX}px, ${translateY}px)`,
          width: "100%",
        },
      }),
      ...parsed.highlights.map((highlight) =>
        element("slide-highlight", {
          label: highlight.label,
          rect: highlight.rect,
          style: {
            borderColor: toneColor[highlight.tone],
            borderRadius: 6,
            borderWidth: 5,
            boxShadow: `0 0 28px ${toneColor[highlight.tone]}`,
          },
        }),
      ),
      ...parsed.callouts.map((callout) =>
        element("slide-callout", {
          anchor_rect: callout.anchor_rect,
          position: callout.position,
          text: callout.text,
          style: {
            background: theme.palette.background,
            borderColor: toneColor[callout.tone],
            borderRadius: 8,
            borderWidth: 2,
            color: theme.palette.text,
            fontSize: theme.typography.body_size,
            padding: 22,
          },
        }),
      ),
    ),
    ...(parsed.caption
      ? [
          element("caption", {
            text: parsed.caption,
            style: {
              background: "rgba(0, 0, 0, 0.72)",
              borderRadius: 8,
              bottom: 34,
              color: theme.palette.text,
              fontSize: theme.typography.body_size,
              left: Math.round(parsed.width * 0.16),
              padding: 18,
              position: "absolute",
              right: Math.round(parsed.width * 0.16),
            },
          }),
        ]
      : []),
  ]);
}
