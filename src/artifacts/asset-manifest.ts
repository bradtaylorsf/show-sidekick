import { z } from "zod";

export const AssetAttributionSchema = z.object({
  source_url: z.string(),
  source: z.string().optional(),
  source_domain: z.string().optional(),
  license: z.string().optional(),
});

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
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      attribution: AssetAttributionSchema.optional(),
    }),
  ),
});

export type AssetAttribution = z.infer<typeof AssetAttributionSchema>;

export type AssetManifest = z.infer<typeof AssetManifestSchema>;
