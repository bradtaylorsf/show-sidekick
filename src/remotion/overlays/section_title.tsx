import { z } from "zod";
import { accentRule, label, sceneRoot, title } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const SectionTitleOverlayPropsSchema = BaseScenePropsSchema.extend({
  section: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
});

export type SectionTitleOverlayProps = z.input<typeof SectionTitleOverlayPropsSchema>;

export function section_title(props: SectionTitleOverlayProps) {
  const parsed = SectionTitleOverlayPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot(
    "section_title",
    parsed,
    [label(theme, parsed.section), title(theme, parsed.title), ...(parsed.subtitle ? [label(theme, parsed.subtitle)] : []), accentRule(theme)],
    { overlay: true },
  );
}
