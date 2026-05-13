import { z } from "zod";
import { element, label, panel, sceneRoot } from "../scene-helpers.js";
import { useCurrentFrame } from "../primitives.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const TerminalScenePropsSchema = BaseScenePropsSchema.extend({
  title: z.string(),
  prompt: z.string().default("$"),
  lines: z.array(z.string()).min(1),
  cursor: z.boolean().default(true),
});

export type TerminalSceneProps = z.input<typeof TerminalScenePropsSchema>;

export function terminal_scene(props: TerminalSceneProps) {
  const parsed = TerminalScenePropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);
  const visibleLines = Math.max(1, Math.min(parsed.lines.length, Math.floor(useCurrentFrame() / 6) + 1));

  return sceneRoot("terminal_scene", parsed, [
    panel(theme, [
      label(theme, parsed.title),
      element(
        "terminal",
        {
          cursor: parsed.cursor,
          prompt: parsed.prompt,
          style: {
            background: "#050816",
            color: theme.palette.accent,
            fontFamily: theme.typography.mono,
            fontSize: 30,
          },
        },
        ...parsed.lines.slice(0, visibleLines).map((line, index) => element("terminal-line", { index, text: line })),
      ),
    ]),
  ]);
}
