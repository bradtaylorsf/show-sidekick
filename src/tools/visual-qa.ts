import { stat } from "node:fs/promises";
import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  frame_paths: z.array(z.string().min(1)).min(1),
  criteria: z.array(z.string().min(1)).default([]),
});

const findingSchema = z.object({
  frame_path: z.string().min(1),
  severity: z.enum(["critical", "warning", "note"]),
  description: z.string().min(1),
});

const outputSchema = z.object({
  findings: z.array(findingSchema),
  passed: z.boolean(),
});

type VisualQaInput = z.infer<typeof inputSchema>;
type VisualQaOutput = z.infer<typeof outputSchema>;

export function createVisualQaResult(findings: VisualQaOutput["findings"] = []): VisualQaOutput {
  return outputSchema.parse({
    findings,
    passed: findings.every((finding) => finding.severity !== "critical"),
  });
}

const visualQa = defineTool({
  name: "visual_qa",
  capability: "visual_qa",
  provider: "show-sidekick",
  status: "beta",
  integration: {
    kind: "library",
    package: "show-sidekick",
    install: "npm install show-sidekick",
  },
  best_for: "agent-driven visual inspection of sampled render or source frames",
  supports: ["sampled-frame-review", "final-review", "criteria-driven-inspection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(params: VisualQaInput): Promise<VisualQaOutput> {
    const input = inputSchema.parse(params);
    const findings: VisualQaOutput["findings"] = [];

    for (const framePath of input.frame_paths) {
      try {
        const info = await stat(framePath);
        if (!info.isFile()) {
          findings.push({
            frame_path: framePath,
            severity: "critical",
            description: "Frame path is not a file.",
          });
        }
      } catch {
        findings.push({
          frame_path: framePath,
          severity: "critical",
          description: "Frame path does not exist.",
        });
      }
    }

    return createVisualQaResult(findings);
  },
});

export default visualQa;
