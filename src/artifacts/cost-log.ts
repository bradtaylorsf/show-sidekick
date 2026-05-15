import { z } from "zod";

export const CostEntrySchema = z.object({
  tool: z.string(),
  provider: z.string(),
  model: z.string(),
  units: z.number().nonnegative(),
  usd: z.number().nonnegative(),
  mode: z.enum(["sample", "full"]),
  cache_hit: z.boolean().optional(),
});

export const CostLogSchema = z.array(CostEntrySchema);

export type CostEntry = z.infer<typeof CostEntrySchema>;
export type CostLog = z.infer<typeof CostLogSchema>;
