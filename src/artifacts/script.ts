import { z } from "zod";
import { NarrativeRoleSchema } from "./enums.js";

export const DialogueLineSchema = z.object({
  character: z.string(),
  line: z.string(),
});

export const ScriptSchema = z.object({
  sections: z.array(
    z.object({
      slug: z.string(),
      role: NarrativeRoleSchema.optional(),
      start_s: z.number().nonnegative(),
      end_s: z.number().nonnegative(),
      narration: z.string().optional(),
      dialogue: z.array(DialogueLineSchema).default([]),
      enhancement_cues: z.array(z.string()).default([]),
    }),
  ),
});

export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type Script = z.infer<typeof ScriptSchema>;
