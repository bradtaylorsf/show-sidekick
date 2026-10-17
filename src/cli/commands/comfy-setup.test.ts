import { describe, expect, it, vi } from "vitest";
import { fakeComfy, installedModels } from "../../comfy/__fixtures__/fake-comfy.js";
import { createComfySetupRunner, parseEngineList } from "./comfy-setup.js";

function io() {
  let stdout = "";
  return {
    io: {
      stdout: { write: (value: string) => ((stdout += value), true) },
      stderr: { write: () => true },
    },
    stdout: () => stdout,
  };
}

const hardware = async () => ({ os: "darwin" as const, arch: "arm64", accelerator: "mps" as const, unifiedMemoryGb: 64, gpus: [], systemMemoryGb: 64 });

describe("comfy setup CLI runner", () => {
  it("only prints a plan when stdin is not a terminal: no prompt, no command", async () => {
    const capture = io();
    const confirm = vi.fn(async () => true);
    const run = vi.fn(async () => ({ ok: true, stdout: "" }));

    await createComfySetupRunner({
      isTty: () => false,
      confirm,
      run,
      capture: async () => ({ ok: true, stdout: JSON.stringify({ data: { workspace_path: "/ws" } }) }),
      commandExists: async () => true,
      hardware,
      client: fakeComfy({ models: installedModels() }).client,
    })({ engines: "seedvr2-7b-q8" }, capture.io);

    expect(confirm).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(capture.stdout()).toContain("Plan only: nothing was installed or downloaded.");
    expect(capture.stdout()).toContain("--filename seedvr2_ema_7b-Q8_0.gguf");
  });

  it("emits one NDJSON event per step in --json mode", async () => {
    const capture = io();

    await createComfySetupRunner({
      isTty: () => true,
      confirm: async () => true,
      run: async () => ({ ok: true, stdout: "" }),
      capture: async () => ({ ok: true, stdout: JSON.stringify({ data: { workspace_path: "/ws" } }) }),
      commandExists: async () => true,
      hardware,
      client: fakeComfy({ models: installedModels() }).client,
    })({ json: true, skipModels: true }, capture.io);

    const events = capture.stdout().trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.map((event) => event.id)).toEqual(["hardware", "comfy-cli", "comfyui-server", "node-packs", "models"]);
    expect(events.every((event) => event.event === "comfy_setup_step" && event.plan_only === true)).toBe(true);
  });

  it("validates --engines", () => {
    expect(parseEngineList("z-image-turbo, ltx-2.5")).toEqual(["z-image-turbo", "ltx-2.5"]);
    expect(parseEngineList(undefined)).toBeUndefined();
    expect(() => parseEngineList("sdxl")).toThrow(/unknown ComfyUI engine sdxl/u);
  });
});
