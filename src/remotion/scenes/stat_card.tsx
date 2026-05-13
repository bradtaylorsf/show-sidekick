import { z } from "zod";
import { accentRule, bodyText, element, label, panel, sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const StatCardPropsSchema = BaseScenePropsSchema.extend({
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
  trend: z.enum(["up", "down", "flat"]).default("flat"),
  footnote: z.string().optional(),
});

export type StatCardProps = z.input<typeof StatCardPropsSchema>;

export function stat_card(props: StatCardProps) {
  const parsed = StatCardPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const deltaColor = parsed.trend === "down" ? theme.palette.danger : parsed.trend === "up" ? theme.palette.accent : theme.palette.muted;

  return sceneRoot("stat_card", parsed, [
    panel(theme, [
      label(theme, parsed.label),
      element("text", {
        role: "stat-value",
        text: parsed.value,
        style: {
          color: theme.palette.text,
          fontFamily: theme.typography.display,
          fontSize: 132,
          fontWeight: 900,
          letterSpacing: 0,
        },
      }),
      ...(parsed.delta
        ? [
            element("text", {
              role: "stat-delta",
              text: parsed.delta,
              trend: parsed.trend,
              style: { color: deltaColor, fontSize: theme.typography.body_size, fontWeight: 800 },
            }),
          ]
        : []),
      ...(parsed.footnote ? [bodyText(theme, parsed.footnote)] : []),
      accentRule(theme),
    ]),
  ]);
}
