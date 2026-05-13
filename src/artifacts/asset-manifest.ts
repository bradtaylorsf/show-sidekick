import { z } from "zod";

export const AssetManifestSchema = z.object({
  assets: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      path: z.string(),
      scene_ref: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
      seed: z.number().int().optional(),
      prompt: z.string().optional(),
      cost_usd: z.number().nonnegative().optional(),
    }),
  ),
});

export type AssetManifest = z.infer<typeof AssetManifestSchema>;
