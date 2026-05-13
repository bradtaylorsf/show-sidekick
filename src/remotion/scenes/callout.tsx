import { z } from "zod";
import { bodyText, element, label, panel, sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const CalloutPropsSchema = BaseScenePropsSchema.extend({
  label: z.string(),
  text: z.string(),
  tone: z.enum(["info", "warning", "success", "danger"]).default("info"),
});

export type CalloutProps = z.input<typeof CalloutPropsSchema>;

export function callout(props: CalloutProps) {
  const parsed = CalloutPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const toneColor = {
    danger: theme.palette.danger,
    info: theme.palette.primary,
    success: theme.palette.accent,
    warning: theme.palette.secondary,
  }[parsed.tone];

  return sceneRoot("callout", parsed, [
    panel(theme, [
      element("callout-mark", { tone: parsed.tone, style: { background: toneColor, borderRadius: 8, height: 96, width: 16 } }),
      label(theme, parsed.label, { style: { color: toneColor, fontSize: theme.typography.label_size } }),
      bodyText(theme, parsed.text),
    ]),
  ]);
}
