import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import { clipCacheKey, lookupClipCache, rememberClipCache } from "../tool-support/clip-cache.js";

const inputSchema = z
  .object({
    mode: z.enum(["lookup", "store"]),
    prompt: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    video_path: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "store" && !value.video_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["video_path"],
        message: "video_path is required when storing a clip",
      });
    }
  });

const outputSchema = z.object({
  hit: z.boolean(),
  video_path: z.string().optional(),
  cache_key: z.string(),
});

export default defineTool({
  name: "clip_cache",
  capability: "clip_cache",
  provider: "local",
  status: "beta",
  integration: { kind: "library", package: "node:crypto", install: "built into Node.js" },
  best_for: "Caching generated clips by prompt, provider, and model to avoid duplicate provider calls.",
  supports: ["generated-clip-cache", "prompt-provider-model-key"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const key = clipCacheKey(input);

    if (input.mode === "lookup") {
      const entry = await lookupClipCache(ctx, input);
      return outputSchema.parse({
        hit: entry !== undefined,
        video_path: entry?.video_path,
        cache_key: key,
      });
    }

    const stored = await rememberClipCache(ctx, {
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      video_path: input.video_path ?? "",
    });

    return outputSchema.parse({
      hit: stored !== undefined,
      video_path: stored?.video_path,
      cache_key: key,
    });
  },
});
