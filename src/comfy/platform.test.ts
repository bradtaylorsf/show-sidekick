import { describe, expect, it } from "vitest";
import { detectHardware, parseNvidiaSmi, recommendTier, type HardwareProbe } from "./platform.js";

function probe(overrides: Partial<HardwareProbe>): HardwareProbe {
  return {
    platform: () => "darwin",
    arch: () => "arm64",
    totalMemoryBytes: () => 128 * 1024 ** 3,
    nvidiaSmi: async () => undefined,
    ...overrides,
  };
}

describe("hardware detection", () => {
  it("treats Apple Silicon as MPS with unified memory and never shells out to nvidia-smi", async () => {
    let smiCalls = 0;
    const hardware = await detectHardware(
      probe({
        nvidiaSmi: async () => {
          smiCalls += 1;
          return undefined;
        },
      }),
    );

    expect(hardware).toMatchObject({ accelerator: "mps", unifiedMemoryGb: 128, gpus: [] });
    expect(smiCalls).toBe(0);
  });

  it("reads CUDA VRAM from nvidia-smi", async () => {
    const hardware = await detectHardware(
      probe({ platform: () => "linux", arch: () => "x64", totalMemoryBytes: () => 64 * 1024 ** 3, nvidiaSmi: async () => "NVIDIA GeForce RTX 4090, 24564\n" }),
    );

    expect(hardware).toMatchObject({ accelerator: "cuda", gpus: [{ name: "NVIDIA GeForce RTX 4090", vramGb: 24 }] });
    expect(parseNvidiaSmi("A, 81920\nB, 40960")).toEqual([
      { name: "A", vramGb: 80 },
      { name: "B", vramGb: 40 },
    ]);
  });
});

describe("tier recommendation", () => {
  it("puts a 128 GB Mac on the full tier and keeps research/gated licences opt-in", async () => {
    const tier = recommendTier(await detectHardware(probe({})));

    expect(tier.tier).toBe("full");
    expect(tier.installFlag).toBe("--m-series");
    expect(tier.recommended).toEqual(
      expect.arrayContaining(["z-image-turbo", "qwen-image-edit-2511", "wan2.2-i2v-a14b", "wan2.2-ti2v-5b", "seedvr2-3b", "rife-4.7"]),
    );
    expect(tier.recommended).not.toContain("qwen-image-2.1");
    expect(tier.recommended).not.toContain("ltx-2.5");
    expect(tier.optIn).toEqual(["qwen-image-2.1", "ltx-2.5"]);
    expect(tier.notes.join(" ")).toMatch(/fp8 has no Float8 kernels on MPS/u);
  });

  it("scales down for a 32 GB Mac and a CPU-only box", async () => {
    const small = recommendTier(await detectHardware(probe({ totalMemoryBytes: () => 32 * 1024 ** 3 })));
    const cpu = recommendTier(await detectHardware(probe({ platform: () => "linux", arch: () => "x64", totalMemoryBytes: () => 16 * 1024 ** 3 })));

    expect(small.tier).toBe("light");
    expect(small.recommended).toContain("z-image-turbo");
    expect(small.tooLarge).toEqual(expect.arrayContaining(["qwen-image-edit-2511", "wan2.2-i2v-a14b", "ltx-2.5"]));
    expect(cpu.tier).toBe("minimal");
    expect(cpu.installFlag).toBe("--cpu");
    expect(cpu.recommended[0]).toBe("z-image-turbo");
    expect(cpu.tooLarge).toContain("wan2.2-ti2v-5b");
  });

  it("uses --nvidia for CUDA machines", async () => {
    const tier = recommendTier(
      await detectHardware(
        probe({ platform: () => "linux", arch: () => "x64", totalMemoryBytes: () => 64 * 1024 ** 3, nvidiaSmi: async () => "RTX 4090, 24564" }),
      ),
    );

    expect(tier.installFlag).toBe("--nvidia");
    expect(tier.tier).toBe("light");
  });
});
