import { z } from "zod";

const toolListSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

export const SampleProviderChoiceSchema = z
  .object({
    tool: toolListSchema.optional(),
    tools: z.array(z.string().min(1)).min(1).optional(),
    provider: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    voice_id: z.string().min(1).optional(),
    voice_name: z.string().min(1).optional(),
    style: z.string().min(1).optional(),
  })
  .passthrough();

export const SampleProvidersConfigSchema = z
  .object({
    image: SampleProviderChoiceSchema.optional(),
    image_generation: SampleProviderChoiceSchema.optional(),
    video: SampleProviderChoiceSchema.optional(),
    image_to_video: SampleProviderChoiceSchema.optional(),
    text_to_video: SampleProviderChoiceSchema.optional(),
    tts: SampleProviderChoiceSchema.optional(),
    voice: SampleProviderChoiceSchema.optional(),
    voiceover: SampleProviderChoiceSchema.optional(),
  })
  .passthrough();

export type SampleProviderChoice = z.infer<typeof SampleProviderChoiceSchema>;
export type SampleProvidersConfig = z.infer<typeof SampleProvidersConfigSchema>;

export function sampleProviderToolNames(choice: SampleProviderChoice | undefined): string[] {
  if (choice === undefined) {
    return [];
  }

  const fromTool = Array.isArray(choice.tool) ? choice.tool : choice.tool === undefined ? [] : [choice.tool];
  return unique([...fromTool, ...(choice.tools ?? [])]);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
