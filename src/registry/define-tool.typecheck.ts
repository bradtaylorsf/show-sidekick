import { z } from "zod";
import { defineTool } from "./define-tool.js";
import type { CliAuth, Integration } from "./tool.js";

export const sampleTool = defineTool({
  name: "sample",
  capability: "tts",
  provider: "sample",
  status: "beta",
  integration: { kind: "api", env: ["SAMPLE_KEY"], install: "noop" },
  best_for: "type inference smoke test",
  input: z.object({ text: z.string() }),
  output: z.object({ url: z.string() }),
  execute: async (params) => ({ url: params.text }),
});

const cliIntegration: Integration = {
  kind: "cli",
  binary: "sample",
  auth: { mode: "none" },
  install: "noop",
};

if (cliIntegration.kind === "cli") {
  cliIntegration.binary.toUpperCase();
}

const cliAuth: CliAuth = { mode: "cli-login", check: "sample whoami" };

if (cliAuth.mode === "cli-login") {
  cliAuth.check.toUpperCase();
}

// @ts-expect-error cli integrations require auth.
const missingAuth: Integration = { kind: "cli", binary: "sample", install: "noop" };

// @ts-expect-error api integrations do not accept binary fields.
const mixedIntegration: Integration = { kind: "api", binary: "sample", env: ["SAMPLE_KEY"], install: "noop" };

void missingAuth;
void mixedIntegration;
