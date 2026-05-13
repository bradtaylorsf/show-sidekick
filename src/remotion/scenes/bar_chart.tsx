import { z } from "zod";
import { element, label, normalizeChartData, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, ChartDatumSchema, resolveTheme } from "../types.js";

export const BarChartPropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  subtitle: z.string().optional(),
  data: z.array(ChartDatumSchema).min(1),
  value_suffix: z.string().default(""),
});

export type BarChartProps = z.input<typeof BarChartPropsSchema>;

export function bar_chart(props: BarChartProps) {
  const parsed = BarChartPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const bars = normalizeChartData(parsed.data);

  return sceneRoot("bar_chart", parsed, [
    title(theme, parsed.title),
    ...(parsed.subtitle ? [label(theme, parsed.subtitle)] : []),
    element(
      "bar-chart",
      { max: Math.max(...parsed.data.map((datum) => datum.value)) },
      ...bars.map((bar, index) =>
        element("bar", {
          color: bar.color ?? (index % 2 === 0 ? theme.palette.primary : theme.palette.secondary),
          label: bar.label,
          ratio: bar.ratio,
          value: `${bar.value}${parsed.value_suffix}`,
        }),
      ),
    ),
  ]);
}
