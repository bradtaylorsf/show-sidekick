import { z } from "zod";
import { bodyText, element, label, panel, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

const ComparisonSideSchema = z.object({
  label: z.string(),
  headline: z.string(),
  points: z.array(z.string()).min(1),
});

export const ComparisonPropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  left: ComparisonSideSchema,
  right: ComparisonSideSchema,
});

export type ComparisonProps = z.input<typeof ComparisonPropsSchema>;

export function comparison(props: ComparisonProps) {
  const parsed = ComparisonPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot("comparison", parsed, [
    title(theme, parsed.title),
    element("comparison-grid", { columns: 2, gap: 32 }, side(theme, "left", parsed.left), side(theme, "right", parsed.right)),
  ]);
}

function side(theme: ReturnType<typeof resolveTheme>, sideName: string, sideProps: z.infer<typeof ComparisonSideSchema>) {
  return panel(
    theme,
    [
      label(theme, sideProps.label),
      bodyText(theme, sideProps.headline, { role: "side-headline" }),
      element(
        "list",
        { side: sideName },
        ...sideProps.points.map((point, index) => element("list-item", { index, text: point })),
      ),
    ],
    { side: sideName },
  );
}
