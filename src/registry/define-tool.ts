import type { z, ZodTypeAny } from "zod";
import { probe } from "./availability.js";
import type { Availability, Tool, ToolContext } from "./tool.js";

export type ToolDefinition<IS extends ZodTypeAny, OS extends ZodTypeAny> = Omit<
  Tool<z.infer<IS>, z.infer<OS>>,
  "input" | "output" | "execute" | "isAvailable"
> & {
  input: IS;
  output: OS;
  isAvailable?: () => Promise<Availability>;
  execute(params: z.infer<IS>, ctx: ToolContext): Promise<z.infer<OS>>;
};

export type DefinedTool<IS extends ZodTypeAny, OS extends ZodTypeAny> = Tool<z.infer<IS>, z.infer<OS>> & {
  input: IS;
  output: OS;
};

export function defineTool<IS extends ZodTypeAny, OS extends ZodTypeAny>(
  definition: ToolDefinition<IS, OS>,
): DefinedTool<IS, OS> {
  const tool = definition as ToolDefinition<IS, OS> & {
    isAvailable?: () => Promise<Availability>;
  };

  tool.isAvailable ??= () => probe(tool.integration, defaultProbeOptions(tool.integration));

  return tool as DefinedTool<IS, OS>;
}

function defaultProbeOptions(integration: Tool["integration"]): { timeoutMs?: number } {
  if (integration.kind === "cli" && integration.auth.mode === "cli-login") {
    return { timeoutMs: integration.auth.timeoutMs };
  }

  return {};
}
