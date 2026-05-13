import { z } from "zod";

export const CaptionPositionSchema = z.enum(["top", "center", "bottom"]);

export const PlaybookCaptionStyleSchema = z.object({
  font_family: z.string().default("Inter"),
  font_size: z.number().positive().default(54),
  font_weight: z.union([z.number().int().positive(), z.string()]).default(800),
  fill: z.string().default("#f8fafc"),
  inactive_fill: z.string().default("#cbd5e1"),
  active_fill: z.string().default("#38bdf8"),
  stroke: z.string().default("#020617"),
  stroke_width: z.number().nonnegative().default(4),
  background: z.string().default("rgba(2, 6, 23, 0.72)"),
  position: CaptionPositionSchema.default("bottom"),
  max_chars_per_line: z.number().int().positive().default(32),
});

export const PlaybookSchema = z
  .object({
    slug: z.string().optional(),
    palette: z.record(z.string()).default({}),
    typography: z.record(z.union([z.string(), z.number()])).default({}),
    motion: z.record(z.union([z.string(), z.number(), z.array(z.string())])).default({}),
    caption_style: PlaybookCaptionStyleSchema.optional(),
  })
  .passthrough();

export type PlaybookCaptionStyle = z.infer<typeof PlaybookCaptionStyleSchema>;
export type Playbook = z.infer<typeof PlaybookSchema>;
