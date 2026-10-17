import { describe, expect, it } from "vitest";
import { fakeComfy, installedModels } from "./__fixtures__/fake-comfy.js";
import { comfyToolAvailability, describeEngineBlockers, inspectComfy } from "./availability.js";
import { DEFAULT_ENGINE_ORDER, ENGINES, LICENCES, MODEL_FILES, assertMpsSafeWeights, enginesForTool, nodePackFor } from "./models.js";
import { chooseEngine } from "./run.js";

describe("engine availability", () => {
  it("reports each engine ready or blocked, per engine, with the exact missing file and fix", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    const inspection = await inspectComfy(comfy.client);

    expect(inspection.reachable).toBe(true);
    if (!inspection.reachable) {
      return;
    }
    const byId = Object.fromEntries(inspection.engines.map((status) => [status.engine, status]));
    expect(byId["z-image-turbo"]?.available).toBe(true);
    expect(byId["wan2.2-i2v-a14b"]?.available).toBe(true);
    expect(byId["seedvr2-3b"]?.available).toBe(true);
    expect(byId["ltx-2.5"]?.available).toBe(false);
    expect(byId["ltx-2.5"]?.missingFiles.map((file) => file.filename)).toContain("ltx-2.5-22b-distilled-transformer-bf16.safetensors");
    expect(byId["seedvr2-7b-q8"]?.missingFiles.map((file) => file.filename)).toEqual(["seedvr2_ema_7b-Q8_0.gguf"]);
    expect(describeEngineBlockers(byId["seedvr2-7b-q8"]!)).toBe(
      "seedvr2-7b-q8: missing model SEEDVR2/seedvr2_ema_7b-Q8_0.gguf — fix: `showkick setup comfy --engines seedvr2-7b-q8`",
    );
    expect(byId["qwen-image-edit-2511"]?.presentOptionalFiles.map((file) => file.filename)).toEqual([
      "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
    ]);
  });

  it("finds GGUF weights through the comfyui-gguf folder keys and names the node pack when it is missing", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    delete comfy.state.objectInfo.UnetLoaderGGUF;
    delete comfy.state.objectInfo.CLIPLoaderGGUF;
    const inspection = await inspectComfy(comfy.client, [ENGINES["wan2.2-i2v-a14b"]]);

    if (!inspection.reachable) {
      throw new Error("expected reachable");
    }
    const status = inspection.engines[0]!;
    expect(status.missingFiles).toEqual([]);
    expect(status.missingNodes).toEqual([
      { classType: "UnetLoaderGGUF", pack: "comfyui-gguf" },
      { classType: "CLIPLoaderGGUF", pack: "comfyui-gguf" },
    ]);
    expect(status.fixes).toEqual(["`comfy node install comfyui-gguf`, then restart ComfyUI"]);
  });

  it("degrades per engine: the tool stays available while one engine is ready", async () => {
    const models = installedModels();
    models.diffusion_models = ["z_image_turbo_bf16.safetensors"];
    const comfy = fakeComfy({ models });

    await expect(comfyToolAvailability(comfy.client, "image")).resolves.toEqual({ available: true });
  });

  it("is unavailable with a start/install fix when ComfyUI is not running", async () => {
    const comfy = fakeComfy({ reachable: false });
    const availability = await comfyToolAvailability(comfy.client, "video");

    expect(availability).toMatchObject({ available: false, fix: "install" });
    expect(availability.available === false && availability.reason).toContain("comfy launch --background");
    expect(availability.available === false && availability.reason).toContain("showkick setup comfy");
  });

  it("checks only the engines that can serve the requested mode", async () => {
    const models = installedModels();
    models.diffusion_models = [];
    const comfy = fakeComfy({ models });

    // Wan 14B (GGUF) is ready for image-to-video, but nothing installed can do text-to-video.
    await expect(comfyToolAvailability(comfy.client, "video", ["image_to_video"])).resolves.toEqual({ available: true });
    const t2v = await comfyToolAvailability(comfy.client, "video", ["text_to_video"]);
    expect(t2v.available).toBe(false);
    expect(t2v.available === false && t2v.reason).toContain("wan2.2-ti2v-5b: missing model diffusion_models/wan2.2_ti2v_5B_fp16.safetensors");
  });
});

describe("chooseEngine", () => {
  it("picks the first ready engine in the licence-first default order", async () => {
    const comfy = fakeComfy({ models: installedModels() });

    await expect(chooseEngine(comfy.client, "text_to_image", undefined)).resolves.toMatchObject({
      engine: { id: "z-image-turbo" },
      requested: false,
    });
    await expect(chooseEngine(comfy.client, "image_to_video", undefined)).resolves.toMatchObject({ engine: { id: "wan2.2-i2v-a14b" } });
  });

  it("never swaps a requested engine for another model", async () => {
    const comfy = fakeComfy({ models: installedModels() });

    await expect(chooseEngine(comfy.client, "image_to_video", "ltx-2.5")).rejects.toThrow(
      /ltx-2\.5 is not ready in ComfyUI: ltx-2\.5: missing model/u,
    );
    await expect(chooseEngine(comfy.client, "text_to_video", "wan2.2-i2v-a14b")).rejects.toThrow(/does not support text_to_video/u);
  });
});

describe("model manifest", () => {
  it("lists only bf16/fp16/GGUF weights and resolvable engine files", () => {
    for (const file of Object.values(MODEL_FILES)) {
      expect(file.filename).not.toMatch(/fp8|e4m3|e5m2|int8|int4|nvfp4/iu);
      expect(file.repoPath).not.toMatch(/fp8|int8|int4|nvfp4/iu);
      expect(file.sizeGb).toBeGreaterThan(0);
    }
    for (const engine of Object.values(ENGINES)) {
      for (const key of [...engine.requiredFiles, ...engine.optionalFiles]) {
        expect(MODEL_FILES[key]).toBeDefined();
      }
      expect(LICENCES[engine.licence]).toBeDefined();
    }
    for (const [mode, order] of Object.entries(DEFAULT_ENGINE_ORDER)) {
      for (const id of order) {
        expect(ENGINES[id].modes).toContain(mode);
      }
    }
  });

  it("uses the Wan 2.1 VAE for every 14B engine and the 2.2 VAE only for the 5B", () => {
    expect(ENGINES["wan2.2-i2v-a14b"].requiredFiles).toContain("wan21Vae");
    expect(ENGINES["wan2.2-i2v-a14b"].requiredFiles).not.toContain("wan22Vae");
    expect(ENGINES["wan2.2-ti2v-5b"].requiredFiles).toContain("wan22Vae");
  });

  it("marks the LTX-2.5 files gated and keeps restricted licences out of the default order's first slot", () => {
    expect(ENGINES["ltx-2.5"].requiredFiles.every((key) => MODEL_FILES[key].gated === true)).toBe(true);
    expect(DEFAULT_ENGINE_ORDER.text_to_image[0]).toBe("z-image-turbo");
    expect(LICENCES[ENGINES["qwen-image-2.1"].licence].commercial).toBe("no");
    expect(enginesForTool("upscale").map((engine) => engine.id)).toEqual(["seedvr2-3b", "seedvr2-7b-q8", "rife-4.7"]);
    expect(nodePackFor("SeedVR2VideoUpscaler")).toBe("comfyui-seedvr2_videoupscaler");
  });

  it("refuses fp8 and int8_convrot weights on MPS but not on CUDA", () => {
    expect(() => assertMpsSafeWeights(["qwen_image_edit_2511_fp8mixed.safetensors"], true)).toThrow(/no Float8 kernels on MPS/u);
    expect(() => assertMpsSafeWeights(["ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors"], true)).toThrow(
      /unverified on Apple Silicon/u,
    );
    expect(() => assertMpsSafeWeights(["qwen_image_edit_2511_fp8mixed.safetensors"], false)).not.toThrow();
    expect(() => assertMpsSafeWeights(["z_image_turbo_bf16.safetensors"], true)).not.toThrow();
  });
});
