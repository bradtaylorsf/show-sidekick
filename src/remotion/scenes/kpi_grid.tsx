import { z } from "zod";
import { element, label, panel, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

const KpiItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  delta: z.string().optional(),
});

export const KpiGridPropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  items: z.array(KpiItemSchema).min(2).max(8),
});

export type KpiGridProps = z.input<typeof KpiGridPropsSchema>;

export function kpi_grid(props: KpiGridProps) {
  const parsed = KpiGridPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot("kpi_grid", parsed, [
    title(theme, parsed.title),
    element(
      "kpi-grid",
      { columns: parsed.items.length <= 4 ? parsed.items.length : 4 },
      ...parsed.items.map((item, index) =>
        panel(
          theme,
          [
            label(theme, item.label),
            element("text", {
              role: "kpi-value",
              text: item.value,
              style: { color: theme.palette.text, fontFamily: theme.typography.display, fontSize: 58, fontWeight: 900 },
            }),
            ...(item.delta ? [element("text", { role: "kpi-delta", text: item.delta })] : []),
          ],
          { index },
        ),
      ),
    ),
  ]);
}
