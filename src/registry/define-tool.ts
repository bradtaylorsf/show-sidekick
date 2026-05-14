import type { z, ZodTypeAny } from "zod";
import {
  announceBeforeExecute,
  detectMajorChange,
  enforceMotionGuardrail,
  requireApproval,
} from "../announce/index.js";
import { probe } from "./availability.js";
import type { Availability, Tool, ToolAvailabilityContext, ToolContext } from "./tool.js";

export type ToolDefinition<IS extends ZodTypeAny, OS extends ZodTypeAny> = Omit<
  Tool<z.infer<IS>, z.infer<OS>>,
  "input" | "output" | "execute" | "isAvailable"
> & {
  input: IS;
  output: OS;
  isAvailable?: (ctx?: ToolAvailabilityContext) => Promise<Availability>;
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
    isAvailable?: (ctx?: ToolAvailabilityContext) => Promise<Availability>;
  };
  const execute = tool.execute.bind(tool);

  tool.isAvailable ??= () => probe(tool.integration, defaultProbeOptions(tool.integration));
  tool.execute = async (params: z.infer<IS>, ctx: ToolContext): Promise<z.infer<OS>> => {
    const policy = ctx.execution;

    if (policy?.motionGuardrail !== undefined) {
      await enforceMotionGuardrail({
        ...policy.motionGuardrail,
        mode: policy.mode,
        io: policy.io,
      });
    }

    if (policy?.majorChange !== undefined) {
      const change = detectMajorChange(policy.majorChange);
      await requireApproval(change, {
        ...policy.majorChange,
        mode: policy.mode,
        io: policy.io,
        showEpisode: policy.showEpisode,
        projectRoot: ctx.projectRoot,
      });
    }

    if (tool.integration.kind === "api" && tool.cost !== undefined && tool.cost.usd > 0) {
      const availability = await (tool as DefinedTool<IS, OS>).isAvailable({ projectRoot: ctx.projectRoot });
      if (!availability.available) {
        throw new Error(`${tool.name} unavailable: ${availability.reason}. Install: ${tool.integration.install}`);
      }
    }

    return await announceBeforeExecute(
      {
        tool: tool as DefinedTool<IS, OS>,
        params,
        ctx,
        reason: policy?.reason ?? tool.best_for,
        sampleOrBatch: policy?.sampleOrBatch,
        model: policy?.model,
        units: policy?.units,
        budgetUsd: policy?.budgetUsd,
        budgetRemainingUsd: policy?.budgetRemainingUsd,
        costLog: policy?.costLog,
        projectRoot: ctx.projectRoot,
        showEpisode: policy?.showEpisode,
        mode: policy?.mode,
        io: policy?.io,
      },
      () => execute(params, ctx),
    );
  };

  return tool as DefinedTool<IS, OS>;
}

function defaultProbeOptions(integration: Tool["integration"]): { timeoutMs?: number } {
  if (integration.kind === "cli" && integration.auth.mode === "cli-login") {
    return { timeoutMs: integration.auth.timeoutMs };
  }

  return {};
}
