import { describe, expect, it, vi } from "vitest";
import { fakeComfy, installedModels } from "./__fixtures__/fake-comfy.js";
import { MODEL_FILES } from "./models.js";
import type { Hardware } from "./platform.js";
import { downloadCommand, formatCommand, runComfySetup, type ComfySetupDeps, type SetupCommand } from "./setup.js";

const mac: Hardware = { os: "darwin", arch: "arm64", accelerator: "mps", unifiedMemoryGb: 128, gpus: [], systemMemoryGb: 128 };

function harness(options: {
  answers?: boolean[];
  binaries?: string[];
  comfy?: ReturnType<typeof fakeComfy>;
  capture?: (command: SetupCommand) => { ok: boolean; stdout: string };
}) {
  const answers = [...(options.answers ?? [])];
  const lines: string[] = [];
  const questions: string[] = [];
  const ran: string[] = [];
  const comfy = options.comfy ?? fakeComfy({ models: installedModels() });
  const binaries = new Set(options.binaries ?? ["comfy", "uv", "hf"]);
  const deps: ComfySetupDeps = {
    write: (line) => lines.push(line),
    confirm: vi.fn(async (question: string) => {
      questions.push(question);
      return answers.shift() ?? false;
    }),
    run: vi.fn(async (command: SetupCommand) => {
      ran.push(formatCommand(command));
      if (command.command === "uv") {
        binaries.add("comfy");
      }
      return { ok: true, stdout: "" };
    }),
    capture: vi.fn(async (command: SetupCommand) => {
      if (options.capture !== undefined) {
        return options.capture(command);
      }
      if (command.command === "comfy") {
        return { ok: true, stdout: JSON.stringify({ ok: true, data: { workspace_path: "/home/me/ComfyUI" } }) };
      }
      return { ok: false, stdout: "" };
    }),
    commandExists: async (binary) => binaries.has(binary),
    hardware: async () => mac,
    client: comfy.client,
    sleep: async () => undefined,
  };

  return { deps, lines, questions, ran, comfy, output: () => lines.join("\n") };
}

describe("showkick setup comfy", () => {
  it("prints the plan and never prompts or runs anything in plan-only mode", async () => {
    const h = harness({ binaries: [] });

    const steps = await runComfySetup({ planOnly: true }, h.deps);

    expect(h.deps.confirm).not.toHaveBeenCalled();
    expect(h.deps.run).not.toHaveBeenCalled();
    expect(steps.find((step) => step.id === "comfy-cli")).toMatchObject({ status: "blocked" });
    expect(h.output()).toContain("Apple Silicon (arm64), 128 GB unified memory");
    expect(h.output()).toContain("Recommended tier: full");
  });

  it("will not install uv or comfy-cli behind the user's back", async () => {
    const h = harness({ binaries: [] });

    const steps = await runComfySetup({}, h.deps);

    expect(h.deps.run).not.toHaveBeenCalled();
    expect(steps.at(-1)).toMatchObject({ id: "comfy-cli", status: "blocked" });
    expect(h.output()).toContain("Install uv first (https://docs.astral.sh/uv/getting-started/installation/)");
  });

  it("asks before `uv tool install comfy-cli` and stops when declined", async () => {
    const h = harness({ binaries: ["uv"], answers: [false] });

    const steps = await runComfySetup({}, h.deps);

    expect(h.questions[0]).toContain("`uv tool install comfy-cli`");
    expect(h.ran).toEqual([]);
    expect(steps.at(-1)).toMatchObject({ id: "comfy-cli", status: "declined" });
  });

  it("installs ComfyUI with --m-series and launches it in the background only after yes", async () => {
    const comfy = fakeComfy({ reachable: false, models: installedModels() });
    let launched = false;
    const h = harness({
      binaries: ["uv"],
      answers: [true, true, true],
      comfy,
      capture: (command) =>
        command.command === "comfy" && launched
          ? { ok: true, stdout: JSON.stringify({ data: { workspace_path: "/home/me/ComfyUI" } }) }
          : { ok: false, stdout: "" },
    });
    h.deps.run = vi.fn(async (command: SetupCommand) => {
      h.ran.push(formatCommand(command));
      if (command.args.includes("install") && command.command === "comfy") {
        launched = true;
      }
      if (command.args[0] === "launch") {
        comfy.state.reachable = true;
      }
      return { ok: true, stdout: "" };
    });

    await runComfySetup({ skipModels: true }, h.deps);

    expect(h.ran).toEqual(["uv tool install comfy-cli", "comfy --skip-prompt install --m-series", "comfy launch --background"]);
    expect(h.questions[2]).toContain("Start it with `comfy launch --background`");
  });

  it("offers `comfy node install` for missing packs and says core gaps need a ComfyUI update", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    delete comfy.state.objectInfo.UnetLoaderGGUF;
    delete comfy.state.objectInfo["RIFE VFI"];
    delete comfy.state.objectInfo.TextEncodeQwenImage21;
    const h = harness({ comfy, answers: [false] });

    const steps = await runComfySetup({ engines: ["wan2.2-i2v-a14b", "rife-4.7", "qwen-image-2.1"], skipModels: true }, h.deps);

    expect(h.questions[0]).toContain("`comfy node install comfyui-gguf comfyui-frame-interpolation`");
    expect(steps.find((step) => step.id === "comfyui-version")).toMatchObject({
      status: "blocked",
      commands: ["comfy update comfy", "comfy stop && comfy launch --background"],
    });
    expect(h.ran).toEqual([]);
  });

  it("lists every missing file with size, repo and licence, holds gated files until `hf auth login`, and downloads only after yes", async () => {
    const h = harness({ answers: [true] });

    const steps = await runComfySetup({ engines: ["ltx-2.5", "seedvr2-7b-q8", "qwen-image-2.1"] }, h.deps);
    const output = h.output();

    expect(output).toContain("SEEDVR2/seedvr2_ema_7b-Q8_0.gguf  8.84 GB  from cmeka/SeedVR2-GGUF  Apache-2.0");
    expect(output).toContain("diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors  42.02 GB  from Lightricks/LTX-2.5  LTX-2.x community licence [gated]");
    expect(output).toContain("licence — qwen-image-2.1: Research / non-commercial licence");
    expect(output).toContain("free for entities under $10M annual revenue");
    expect(steps.find((step) => step.id === "models-gated")).toMatchObject({ status: "blocked", commands: ["hf auth login"] });
    expect(h.questions.at(-1)).toMatch(/^Download 5 file\(s\), 42\.2 GB, into \/home\/me\/ComfyUI\/models\?/u);
    expect(h.ran.some((command) => command.includes("Lightricks"))).toBe(false);
    expect(h.ran).toContain(
      "comfy --workspace /home/me/ComfyUI --skip-prompt model download --url https://huggingface.co/cmeka/SeedVR2-GGUF/resolve/main/seedvr2_ema_7b-Q8_0.gguf --relative-path models/SEEDVR2 --filename seedvr2_ema_7b-Q8_0.gguf",
    );
    expect(h.ran).toContain("hf download Comfy-Org/Qwen-Image-2.1 diffusion_models/qwen_image_2.1_bf16.safetensors --local-dir /home/me/ComfyUI/models");
    expect(steps.at(-1)).toMatchObject({ id: "models", status: "done" });
  });

  it("downloads nothing when the download prompt is declined", async () => {
    const h = harness({ answers: [false] });

    const steps = await runComfySetup({ engines: ["seedvr2-7b-q8"] }, h.deps);

    expect(h.ran).toEqual([]);
    expect(steps.at(-1)).toMatchObject({ id: "models", status: "declined" });
  });
});

describe("downloadCommand", () => {
  it("keeps the Comfy folder layout and never passes a token", () => {
    const zVae = downloadCommand(MODEL_FILES.zImageVae, "/ws");
    const ltx = downloadCommand(MODEL_FILES.ltxUnet, "/ws", { hfAvailable: false });
    const qwenWithoutHf = downloadCommand(MODEL_FILES.qwen21Vae, "/ws", { hfAvailable: false });

    // The repo calls it ae.safetensors; it is saved as z_image_ae.safetensors.
    expect(formatCommand(zVae)).toBe(
      "comfy --workspace /ws --skip-prompt model download --url https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors --relative-path models/vae --filename z_image_ae.safetensors",
    );
    expect(formatCommand(ltx)).toBe("hf download Lightricks/LTX-2.5 diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors --local-dir /ws/models");
    expect(qwenWithoutHf.command).toBe("comfy");
    for (const command of [zVae, ltx, qwenWithoutHf]) {
      expect(command.args.join(" ")).not.toMatch(/token/iu);
    }
  });
});
