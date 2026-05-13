import { z } from "zod";
import { element, label, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, ColorTokenSchema, resolveTheme } from "../types.js";

const LineSeriesSchema = z.object({
  label: z.string(),
  color: ColorTokenSchema.optional(),
  points: z.array(z.number()).min(2),
});

export const LineChartPropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  x_labels: z.array(z.string()).default([]),
  series: z.array(LineSeriesSchema).min(1),
});

export type LineChartProps = z.input<typeof LineChartPropsSchema>;

export function line_chart(props: LineChartProps) {
  const parsed = LineChartPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const allValues = parsed.series.flatMap((series) => series.points);
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;

  return sceneRoot("line_chart", parsed, [
    title(theme, parsed.title),
    element(
      "line-chart",
      { max, min, x_labels: parsed.x_labels },
      ...parsed.series.map((series, index) =>
        element("line-series", {
          color: series.color ?? (index === 0 ? theme.palette.primary : theme.palette.secondary),
          label: series.label,
          points: series.points.map((value, pointIndex) => ({
            x: pointIndex,
            y: Math.round(((value - min) / span) * 1000) / 1000,
          })),
        }),
      ),
    ),
    label(theme, `${parsed.series.length} series`),
  ]);
}
