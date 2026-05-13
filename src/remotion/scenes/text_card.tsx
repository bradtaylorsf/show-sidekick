import { z } from "zod";
import { accentRule, bodyText, label, panel, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const TextCardPropsSchema = BaseScenePropsSchema.extend({
  eyebrow: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  body: z.string().optional(),
  align: z.enum(["left", "center", "right"]).default("center"),
});

export type TextCardProps = z.input<typeof TextCardPropsSchema>;

export function text_card(props: TextCardProps) {
  const parsed = TextCardPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot("text_card", parsed, [
    panel(theme, [
      ...(parsed.eyebrow ? [label(theme, parsed.eyebrow)] : []),
      title(theme, parsed.title, { align: parsed.align }),
      ...(parsed.subtitle ? [bodyText(theme, parsed.subtitle, { role: "subtitle" })] : []),
      ...(parsed.body ? [bodyText(theme, parsed.body)] : []),
      accentRule(theme),
    ]),
  ]);
}
