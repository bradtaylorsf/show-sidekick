import type { ComfyGraph, ComfyNodeInfo } from "./client.js";

/**
 * Offline check of an API-format graph against a server's /object_info: every class
 * exists, every input name is real, every required input is wired, links point at a
 * real output whose type matches, and plain enums hold a listed value. Model-file
 * enums are reported separately — a missing file is a setup problem, not a graph bug.
 */

export type GraphIssue = { node: string; classType: string; input?: string; message: string };

export type GraphValidation = { errors: GraphIssue[]; missingFiles: GraphIssue[] };

const MODEL_FILE_INPUTS = new Set(["unet_name", "clip_name", "vae_name", "lora_name", "model_name", "ckpt_name", "model", "image", "file", "video"]);

export function validateGraph(graph: ComfyGraph, objectInfo: Record<string, ComfyNodeInfo>): GraphValidation {
  const errors: GraphIssue[] = [];
  const missingFiles: GraphIssue[] = [];

  for (const [id, node] of Object.entries(graph)) {
    const info = objectInfo[node.class_type];
    if (info === undefined) {
      errors.push({ node: id, classType: node.class_type, message: "unknown node class" });
      continue;
    }

    const required = info.input?.required ?? {};
    const optional = info.input?.optional ?? {};
    const specs: Record<string, unknown> = { ...required, ...optional };
    const provided = new Set(Object.keys(node.inputs));

    for (const [name, value] of Object.entries(node.inputs)) {
      const base = name.includes(".") ? (name.split(".")[0] as string) : name;
      const spec = specs[name] ?? specs[base];
      if (spec === undefined) {
        errors.push({ node: id, classType: node.class_type, input: name, message: "not an input of this node" });
        continue;
      }

      const type = specType(spec);
      if (name !== base) {
        if (type !== "COMFY_AUTOGROW_V3" && type !== "COMFY_DYNAMICCOMBO_V3") {
          errors.push({ node: id, classType: node.class_type, input: name, message: "dotted input on a non-dynamic input" });
        }
        checkLink(graph, objectInfo, id, node.class_type, name, value, autogrowTemplateType(spec), errors);
        continue;
      }

      if (isLink(value)) {
        checkLink(graph, objectInfo, id, node.class_type, name, value, type, errors);
        continue;
      }

      const options = enumOptions(spec);
      if (options !== undefined && !options.includes(value as string | number)) {
        const issue = { node: id, classType: node.class_type, input: name, message: `value ${JSON.stringify(value)} is not one of ${options.length} listed options` };
        (MODEL_FILE_INPUTS.has(name) && typeof value === "string" ? missingFiles : errors).push(issue);
      }
    }

    for (const name of Object.keys(required)) {
      const type = specType(required[name]);
      if (type === "COMFY_AUTOGROW_V3") {
        const min = autogrowMin(required[name]);
        const filled = [...provided].filter((key) => key.startsWith(`${name}.`)).length;
        if (filled < min) {
          errors.push({ node: id, classType: node.class_type, input: name, message: `needs at least ${min} ${name}.* input(s)` });
        }
        continue;
      }
      if (!provided.has(name)) {
        errors.push({ node: id, classType: node.class_type, input: name, message: "required input is missing" });
      }
    }
  }

  return { errors, missingFiles };
}

export function formatGraphIssues(issues: GraphIssue[]): string {
  return issues.map((issue) => `${issue.node} (${issue.classType})${issue.input === undefined ? "" : `.${issue.input}`}: ${issue.message}`).join("; ");
}

function checkLink(
  graph: ComfyGraph,
  objectInfo: Record<string, ComfyNodeInfo>,
  id: string,
  classType: string,
  input: string,
  value: unknown,
  expectedType: string | undefined,
  errors: GraphIssue[],
): void {
  if (!isLink(value)) {
    return;
  }

  const [sourceId, index] = value;
  const source = graph[sourceId];
  if (source === undefined) {
    errors.push({ node: id, classType, input, message: `links to missing node ${sourceId}` });
    return;
  }

  const outputs = objectInfo[source.class_type]?.output ?? [];
  const outputType = outputs[index];
  if (outputType === undefined) {
    errors.push({ node: id, classType, input, message: `links to output ${index} of ${sourceId} (${source.class_type}), which has ${outputs.length}` });
    return;
  }

  if (!typesCompatible(outputType, expectedType)) {
    errors.push({ node: id, classType, input, message: `expects ${expectedType}, got ${outputType} from ${sourceId} (${source.class_type})` });
  }
}

function typesCompatible(output: string, expected: string | undefined): boolean {
  if (expected === undefined || expected === "*" || output === "*" || expected.startsWith("COMFY_")) {
    return true;
  }
  if (expected === "COMBO") {
    return true;
  }
  const accepted = expected.split(",").map((part) => part.trim());
  const produced = output.split(",").map((part) => part.trim());
  return produced.some((type) => accepted.includes(type));
}

function specType(spec: unknown): string | undefined {
  if (!Array.isArray(spec)) {
    return undefined;
  }
  return typeof spec[0] === "string" ? spec[0] : Array.isArray(spec[0]) ? "COMBO" : undefined;
}

function enumOptions(spec: unknown): Array<string | number> | undefined {
  if (!Array.isArray(spec)) {
    return undefined;
  }
  if (Array.isArray(spec[0])) {
    return spec[0] as Array<string | number>;
  }
  if (spec[0] === "COMBO" || spec[0] === "COMFY_DYNAMICCOMBO_V3") {
    const options = (spec[1] as { options?: unknown[] } | undefined)?.options;
    if (Array.isArray(options)) {
      return options.map((option) =>
        typeof option === "object" && option !== null && "key" in option ? String((option as { key: unknown }).key) : (option as string | number),
      );
    }
  }
  return undefined;
}

function autogrowTemplateType(spec: unknown): string | undefined {
  const template = Array.isArray(spec) ? (spec[1] as { template?: { input?: Record<string, Record<string, unknown>> } } | undefined)?.template : undefined;
  for (const group of Object.values(template?.input ?? {})) {
    for (const value of Object.values(group)) {
      return specType(value);
    }
  }
  return undefined;
}

function autogrowMin(spec: unknown): number {
  const template = Array.isArray(spec) ? (spec[1] as { template?: { min?: number } } | undefined)?.template : undefined;
  return typeof template?.min === "number" ? template.min : 0;
}

function isLink(value: unknown): value is [string, number] {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
}
