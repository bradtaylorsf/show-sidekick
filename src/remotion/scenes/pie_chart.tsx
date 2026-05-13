import { z } from "zod";
import { element, normalizeChartData, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, ChartDatumSchema, resolveTheme } from "../types.js";

export const PieChartPropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  data: z.array(ChartDatumSchema).min(2),
  center_label: z.string().optional(),
});

export type PieChartProps = z.input<typeof PieChartPropsSchema>;

export function pie_chart(props: PieChartProps) {
  const parsed = PieChartPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  let cursor = 0;

  return sceneRoot("pie_chart", parsed, [
    title(theme, parsed.title),
    element(
      "pie-chart",
      { center_label: parsed.center_label },
      ...normalizeChartData(parsed.data).map((slice, index) => {
        const start = cursor;
        cursor += slice.percent;
        return element("pie-slice", {
          color: slice.color ?? [theme.palette.primary, theme.palette.secondary, theme.palette.accent][index % 3],
          end: Math.round(cursor * 10000) / 10000,
          label: slice.label,
          percent: slice.percent,
          start,
          value: slice.value,
        });
      }),
    ),
  ]);
}
