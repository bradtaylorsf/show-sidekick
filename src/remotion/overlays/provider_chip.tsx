import { z } from "zod";
import { element, sceneRoot } from "../scene-helpers.js";
import { BaseScenePropsSchema, resolveTheme } from "../types.js";

export const ProviderChipOverlayPropsSchema = BaseScenePropsSchema.extend({
  provider: z.string(),
  model: z.string().optional(),
  status: z.enum(["draft", "approved", "rendering"]).default("draft"),
});

export type ProviderChipOverlayProps = z.input<typeof ProviderChipOverlayPropsSchema>;

export function provider_chip(props: ProviderChipOverlayProps) {
  const parsed = ProviderChipOverlayPropsSchema.parse(props);
  const theme = resolveTheme(parsed.theme);

  return sceneRoot(
    "provider_chip",
    parsed,
    [
      element("provider-chip", {
        model: parsed.model,
        provider: parsed.provider,
        status: parsed.status,
        style: {
          background: theme.palette.surface,
          borderColor: parsed.status === "approved" ? theme.palette.accent : theme.palette.primary,
          color: theme.palette.text,
        },
      }),
    ],
    { overlay: true },
  );
}
