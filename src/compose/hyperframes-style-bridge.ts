import { writeFile } from "node:fs/promises";
import { PlaybookSchema, type Playbook } from "../artifacts/playbook.js";

export type CssVariableMap = Record<string, string>;

export function playbookToCssVariables(playbook: unknown): CssVariableMap {
  const parsed = PlaybookSchema.parse(playbook);
  const palette = parsed.palette;
  const typography = parsed.typography;
  const motion = parsed.motion;

  return compactCssVars({
    "--brand-primary": palette.primary,
    "--brand-secondary": palette.secondary,
    "--brand-accent": palette.accent,
    "--brand-background": palette.background,
    "--brand-surface": palette.surface,
    "--brand-text": palette.text,
    "--brand-muted": palette.muted,
    "--brand-danger": palette.danger,
    "--font-display": typography.display,
    "--font-body": typography.body,
    "--font-mono": typography.mono,
    "--type-title-size": px(typography.title_size),
    "--type-body-size": px(typography.body_size),
    "--type-caption-size": px(typography.caption_size),
    "--motion-fast": ms(motion.fast_ms),
    "--motion-medium": ms(motion.medium_ms),
    "--motion-slow": ms(motion.slow_ms),
    "--motion-ease": motion.ease,
    "--motion-transition-allowlist": Array.isArray(motion.allowed_transitions)
      ? motion.allowed_transitions.join(",")
      : undefined,
    "--caption-font": parsed.caption_style?.font_family,
    "--caption-fill": parsed.caption_style?.fill,
    "--caption-active-fill": parsed.caption_style?.active_fill,
    "--caption-stroke": parsed.caption_style?.stroke,
  });
}

export const hyperframes_style_bridge = playbookToCssVariables;

export async function writeCssVarsFile(cssVars: CssVariableMap, outPath: string): Promise<void> {
  const body = Object.entries(cssVars)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");

  await writeFile(outPath, `:root {\n${body}\n}\n`);
}

function compactCssVars(vars: Record<string, unknown>): CssVariableMap {
  return Object.fromEntries(
    Object.entries(vars).flatMap(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return [];
      }

      return [[key, String(value)]];
    }),
  );
}

function px(value: Playbook["typography"][string] | undefined): string | undefined {
  if (typeof value === "number") {
    return `${value}px`;
  }

  return typeof value === "string" ? value : undefined;
}

function ms(value: Playbook["motion"][string] | undefined): string | undefined {
  if (typeof value === "number") {
    return `${value}ms`;
  }

  return typeof value === "string" ? value : undefined;
}
