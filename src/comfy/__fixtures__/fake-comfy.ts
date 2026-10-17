import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ComfyClient, type ComfyGraph, type ComfyNodeInfo } from "../client.js";

/** Test double for a ComfyUI server: a fetch implementation backed by in-memory state. */

export function fixtureObjectInfo(): Record<string, ComfyNodeInfo> {
  const path = fileURLToPath(new URL("./object-info.json", import.meta.url));
  return (JSON.parse(readFileSync(path, "utf8")) as { nodes: Record<string, ComfyNodeInfo> }).nodes;
}

export type FakeComfyState = {
  reachable: boolean;
  os: string;
  device: "mps" | "cuda";
  objectInfo: Record<string, ComfyNodeInfo>;
  models: Record<string, string[]>;
  queued: Array<{ graph: ComfyGraph; promptId: string }>;
  uploads: string[];
  /** Poll count before a queued job reports completion. */
  pollsUntilDone: number;
  failWith?: string;
  rejectWith?: { status: number; body: unknown };
  outputFile: { filename: string; subfolder: string; type: string };
  outputBytes: Buffer;
  outputKey: "images" | "videos";
};

export function fakeComfy(overrides: Partial<FakeComfyState> = {}): {
  state: FakeComfyState;
  client: ComfyClient;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
} {
  const state: FakeComfyState = {
    reachable: true,
    os: "darwin",
    device: "mps",
    objectInfo: fixtureObjectInfo(),
    models: {},
    queued: [],
    uploads: [],
    pollsUntilDone: 1,
    outputFile: { filename: "show-sidekick_00001_.png", subfolder: "show-sidekick", type: "output" },
    outputBytes: Buffer.from("fake-image-bytes"),
    outputKey: "images",
    ...overrides,
  };
  const polls = new Map<string, number>();

  const fetchImpl = async (input: string, init?: RequestInit): Promise<Response> => {
    if (!state.reachable) {
      const error = new TypeError("fetch failed") as TypeError & { cause?: unknown };
      error.cause = { code: "ECONNREFUSED" };
      throw error;
    }

    const url = new URL(input);
    const path = url.pathname;

    if (path === "/system_stats") {
      return json({
        system: { os: state.os, comfyui_version: "0.33.0", ram_total: 128 * 1024 ** 3 },
        devices: [{ name: state.device, type: state.device, vram_total: 128 * 1024 ** 3 }],
      });
    }
    if (path === "/object_info") {
      return json(state.objectInfo);
    }
    if (path.startsWith("/models/")) {
      const folder = decodeURIComponent(path.slice("/models/".length));
      return folder in state.models ? json(state.models[folder]) : new Response("not found", { status: 404 });
    }
    if (path === "/queue") {
      return json({ queue_running: [], queue_pending: [] });
    }
    if (path === "/upload/image" && init?.method === "POST") {
      const form = init.body as FormData;
      const file = form.get("image") as File;
      state.uploads.push(file.name);
      return json({ name: file.name, subfolder: String(form.get("subfolder") ?? ""), type: "input" });
    }
    if (path === "/prompt" && init?.method === "POST") {
      if (state.rejectWith !== undefined) {
        return json(state.rejectWith.body, state.rejectWith.status);
      }
      const body = JSON.parse(String(init.body)) as { prompt: ComfyGraph };
      const promptId = `prompt-${state.queued.length + 1}`;
      state.queued.push({ graph: body.prompt, promptId });
      return json({ prompt_id: promptId, number: state.queued.length, node_errors: {} });
    }
    if (path.startsWith("/history/")) {
      const promptId = decodeURIComponent(path.slice("/history/".length));
      const count = (polls.get(promptId) ?? 0) + 1;
      polls.set(promptId, count);
      if (count < state.pollsUntilDone) {
        return json({});
      }
      if (state.failWith !== undefined) {
        return json({
          [promptId]: {
            status: {
              status_str: "error",
              completed: false,
              messages: [["execution_error", { node_type: "KSampler", exception_message: state.failWith }]],
            },
            outputs: {},
          },
        });
      }
      return json({
        [promptId]: {
          status: { status_str: "success", completed: true, messages: [] },
          outputs: { save: { [state.outputKey]: [state.outputFile] } },
        },
      });
    }
    if (path === "/view") {
      return new Response(new Uint8Array(state.outputBytes), { status: 200 });
    }

    return new Response("unexpected", { status: 500 });
  };

  return {
    state,
    fetch: fetchImpl,
    client: new ComfyClient({ baseUrl: "http://comfy.test:8188", fetch: fetchImpl, sleep: async () => undefined, pollIntervalMs: 1 }),
  };
}

/** Model folders as a fully provisioned Mac would list them (no LTX, no Qwen 2.1, no 7B SeedVR2). */
export function installedModels(): Record<string, string[]> {
  return {
    diffusion_models: ["z_image_turbo_bf16.safetensors", "qwen_image_edit_2511_bf16.safetensors", "wan2.2_ti2v_5B_fp16.safetensors"],
    text_encoders: ["qwen_3_4b.safetensors", "qwen_2.5_vl_7b.safetensors"],
    vae: ["z_image_ae.safetensors", "qwen_image_vae.safetensors", "wan2.2_vae.safetensors", "wan_2.1_vae.safetensors"],
    loras: [
      "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
      "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-high_noise.safetensors",
      "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-low_noise.safetensors",
    ],
    unet_gguf: ["Wan2.2-I2V-A14B-HighNoise-Q8_0.gguf", "Wan2.2-I2V-A14B-LowNoise-Q8_0.gguf"],
    clip_gguf: ["umt5-xxl-encoder-Q8_0.gguf"],
    clip_vision: [],
    latent_upscale_models: [],
    seedvr2: ["ema_vae_fp16.safetensors", "seedvr2_ema_3b_fp16.safetensors"],
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
