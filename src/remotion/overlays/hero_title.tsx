import { z } from "zod";
import { bodyText, element, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const HeroTitleOverlayPropsSchema = BaseScenePropsSchema.extend({
  badge: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export type HeroTitleOverlayProps = z.input<typeof HeroTitleOverlayPropsSchema>;

export function overlay_hero_title(props: HeroTitleOverlayProps) {
  const parsed = HeroTitleOverlayPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot(
    "overlay_hero_title",
    parsed,
    [
      ...(parsed.badge
        ? [
            element("badge", {
              text: parsed.badge,
              style: { background: theme.palette.primary, color: theme.palette.background },
            }),
          ]
        : []),
      title(theme, parsed.title),
      ...(parsed.subtitle ? [bodyText(theme, parsed.subtitle, { role: "subtitle" })] : []),
    ],
    { overlay: true },
  );
}
