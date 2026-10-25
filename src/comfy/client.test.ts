import { describe, expect, it } from "vitest";
import { fakeComfy } from "./__fixtures__/fake-comfy.js";
import { ComfyClient, ComfyError, collectOutputFiles, describeRefusal, resolveComfyUrl } from "./client.js";

describe("resolveComfyUrl", () => {
  it("defaults to the local server and honours COMFY_URL / SHOW_SIDEKICK_COMFY_URL", () => {
    expect(resolveComfyUrl({})).toBe("http://127.0.0.1:8188");
    expect(resolveComfyUrl({ COMFY_URL: "http://gpu-box:8188/" })).toBe("http://gpu-box:8188");
    expect(resolveComfyUrl({ COMFY_URL: "http://a:1", SHOW_SIDEKICK_COMFY_URL: "http://b:2" })).toBe("http://b:2");
  });
});

describe("ComfyClient", () => {
  it("queues a graph, polls history until done, and downloads the output", async () => {
    const comfy = fakeComfy({ pollsUntilDone: 3 });
    const promptId = await comfy.client.queuePrompt({ save: { class_type: "SaveImage", inputs: {} } });
    const entry = await comfy.client.waitForPrompt(promptId, { timeoutMs: 10_000 });
    const files = collectOutputFiles(entry, "save");

    expect(promptId).toBe("prompt-1");
    expect(files).toEqual([{ filename: "show-sidekick_00001_.png", subfolder: "show-sidekick", type: "output" }]);
    expect((await comfy.client.download(files[0]!)).toString()).toBe("fake-image-bytes");
  });

  it("names the node and input ComfyUI rejected", async () => {
    const comfy = fakeComfy({
      rejectWith: {
        status: 400,
        body: {
          error: { type: "prompt_outputs_failed_validation", message: "Prompt outputs failed validation" },
          node_errors: {
            unet: { class_type: "UNETLoader", errors: [{ message: "Value not in list", details: "unet_name: 'x.safetensors' not in [...]" }] },
          },
        },
      },
    });

    await expect(comfy.client.queuePrompt({})).rejects.toMatchObject({
      code: "rejected",
      message: expect.stringContaining("unet (UNETLoader): Value not in list unet_name: 'x.safetensors'"),
    });
  });

  it("surfaces the execution error message from history", async () => {
    const comfy = fakeComfy({ failWith: "MPS backend out of memory" });
    const promptId = await comfy.client.queuePrompt({});

    await expect(comfy.client.waitForPrompt(promptId, { timeoutMs: 10_000 })).rejects.toMatchObject({
      code: "execution",
      message: expect.stringContaining("KSampler: MPS backend out of memory"),
    });
  });

  it("times out instead of polling forever", async () => {
    let clock = 0;
    const comfy = fakeComfy({ pollsUntilDone: Number.MAX_SAFE_INTEGER });
    const client = new ComfyClient({
      baseUrl: "http://comfy.test:8188",
      fetch: comfy.fetch,
      sleep: async (ms) => {
        clock += ms;
      },
      now: () => clock,
      pollIntervalMs: 1_000,
    });
    const promptId = await client.queuePrompt({});

    await expect(client.waitForPrompt(promptId, { timeoutMs: 5_000 })).rejects.toMatchObject({ code: "timeout" });
  });

  it("reports an unreachable server with the connection error code", async () => {
    const comfy = fakeComfy({ reachable: false });

    await expect(comfy.client.systemStats()).rejects.toMatchObject({
      code: "unreachable",
      message: "ComfyUI is not reachable at http://comfy.test:8188 (ECONNREFUSED)",
    });
    await expect(comfy.client.isReachable()).resolves.toMatchObject({ reachable: false });
  });

  it("returns undefined for a model folder the server does not know", async () => {
    const comfy = fakeComfy({ models: { loras: ["a.safetensors"] } });

    await expect(comfy.client.listModels("loras")).resolves.toEqual(["a.safetensors"]);
    await expect(comfy.client.listModels("unet_gguf")).resolves.toBeUndefined();
  });

  it("keeps ComfyError distinguishable", () => {
    expect(new ComfyError("timeout", "x")).toBeInstanceOf(Error);
    expect(describeRefusal("not json")).toBe(": not json");
  });
});
