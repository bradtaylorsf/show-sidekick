import { z } from "zod";
import { bodyText, element, label, sceneRoot, title } from "../scene-helpers.js";
import { spring, useCurrentFrame } from "../primitives.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const AnimeScenePropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  character: z.string(),
  action: z.string(),
  setting: z.string(),
  mood: z.string().default("kinetic"),
});

export type AnimeSceneProps = z.input<typeof AnimeScenePropsSchema>;

export function anime_scene(props: AnimeSceneProps) {
  const parsed = AnimeScenePropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const parallax = spring({ frame: useCurrentFrame(), fps: parsed.fps, damping: 10, stiffness: 80 });

  return sceneRoot("anime_scene", parsed, [
    element("anime-background", {
      setting: parsed.setting,
      style: {
        background: theme.palette.surface,
        parallax,
      },
    }),
    element("anime-character-card", {
      action: parsed.action,
      character: parsed.character,
      mood: parsed.mood,
      style: { borderColor: theme.palette.primary },
    }),
    label(theme, parsed.mood),
    title(theme, parsed.title),
    bodyText(theme, `${parsed.character} ${parsed.action} in ${parsed.setting}.`),
  ]);
}
