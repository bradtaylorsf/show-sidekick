import { z } from "zod";

export const ColorTokenSchema = z.string().min(1);

export const RemotionPaletteSchema = z.object({
  background: ColorTokenSchema.default("#0b1020"),
  surface: ColorTokenSchema.default("#141b34"),
  text: ColorTokenSchema.default("#f8fafc"),
  muted: ColorTokenSchema.default("#94a3b8"),
  primary: ColorTokenSchema.default("#38bdf8"),
  secondary: ColorTokenSchema.default("#f97316"),
  accent: ColorTokenSchema.default("#a3e635"),
  danger: ColorTokenSchema.default("#fb7185"),
  grid: ColorTokenSchema.default("rgba(148, 163, 184, 0.25)"),
});

export const RemotionTypographySchema = z.object({
  display: z.string().default("Inter Tight"),
  body: z.string().default("Inter"),
  mono: z.string().default("JetBrains Mono"),
  title_size: z.number().positive().default(88),
  body_size: z.number().positive().default(34),
  label_size: z.number().positive().default(24),
});

export const RemotionMotionSchema = z.object({
  enter_frames: z.number().int().nonnegative().default(18),
  ease: z.string().default("out-cubic"),
  accent_delay_frames: z.number().int().nonnegative().default(8),
});

export const RemotionThemeSchema = z.object({
  palette: RemotionPaletteSchema.default({}),
  typography: RemotionTypographySchema.default({}),
  motion: RemotionMotionSchema.default({}),
});

export const RemotionThemeOverridesSchema = z
  .object({
    palette: RemotionPaletteSchema.partial().optional(),
    typography: RemotionTypographySchema.partial().optional(),
    motion: RemotionMotionSchema.partial().optional(),
  })
  .optional();

export const BaseScenePropsSchema = z.object({
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.number().positive().default(30),
  duration_frames: z.number().int().positive().default(150),
  theme: RemotionThemeOverridesSchema,
});

export const ChartDatumSchema = z.object({
  label: z.string(),
  value: z.number(),
  color: ColorTokenSchema.optional(),
});

export type RemotionTheme = z.infer<typeof RemotionThemeSchema>;
export type RemotionThemeOverrides = z.infer<typeof RemotionThemeOverridesSchema>;
export type BaseSceneProps = z.infer<typeof BaseScenePropsSchema>;
export type ChartDatum = z.infer<typeof ChartDatumSchema>;

export const DEFAULT_THEME: RemotionTheme = RemotionThemeSchema.parse({});

export function resolveTheme(overrides: RemotionThemeOverrides): RemotionTheme {
  return RemotionThemeSchema.parse({
    palette: {
      ...DEFAULT_THEME.palette,
      ...(overrides?.palette ?? {}),
    },
    typography: {
      ...DEFAULT_THEME.typography,
      ...(overrides?.typography ?? {}),
    },
    motion: {
      ...DEFAULT_THEME.motion,
      ...(overrides?.motion ?? {}),
    },
  });
}
