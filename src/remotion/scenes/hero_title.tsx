import { z } from "zod";
import { accentRule, bodyText, element, label, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const HeroTitlePropsSchema = BaseScenePropsSchema.extend({
  kicker: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  background_label: z.string().optional(),
});

export type HeroTitleProps = z.input<typeof HeroTitlePropsSchema>;

export function hero_title(props: HeroTitleProps) {
  const parsed = HeroTitlePropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot("hero_title", parsed, [
    element("background-field", {
      label: parsed.background_label ?? "gradient-field",
      style: {
        background: `${theme.palette.background} -> ${theme.palette.surface}`,
      },
    }),
    ...(parsed.kicker ? [label(theme, parsed.kicker)] : []),
    title(theme, parsed.title, { maxLines: 2 }),
    ...(parsed.subtitle ? [bodyText(theme, parsed.subtitle, { role: "subtitle" })] : []),
    accentRule(theme),
  ]);
}
