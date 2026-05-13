import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import codeSnippet from "./code-snippet.js";
import diagramGen from "./diagram-gen.js";
import localDiffusion from "./local-diffusion.js";
import mathAnimate from "./math-animate.js";

let originalEnv: NodeJS.ProcessEnv;
let tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("local and niche image generation tools", () => {
  it("runs local_diffusion only when python and a local model path are available", async () => {
    originalEnv = { ...process.env };
    const root = await tempDir("predit-local-diffusion-root-");
    const binDir = await tempDir("predit-local-diffusion-bin-");
    const modelDir = await tempDir("predit-local-diffusion-model-");
    const argsLog = join(root, "python-args.txt");
    await writeFakeBin(
      binDir,
      "python3",
      `#!/bin/sh
printf '%s\\n' "$@" > "$PREDIT_FAKE_ARGS_LOG"
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "--output" ]; then out="$arg"; fi
  prev="$arg"
done
printf 'local-diffusion-image' > "$out"
`,
    );
    process.env.PATH = `${binDir}:${originalEnv.PATH ?? ""}`;
    delete process.env.PREDIT_LOCAL_SD_MODEL;
    process.env.PREDIT_FAKE_ARGS_LOG = argsLog;

    await expect(localDiffusion.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: PREDIT_LOCAL_SD_MODEL",
      fix: "env",
    });

    process.env.PREDIT_LOCAL_SD_MODEL = modelDir;
    await expect(localDiffusion.isAvailable()).resolves.toEqual({ available: true });

    const result = await localDiffusion.execute(
      {
        prompt: "local matte painting",
        width: 512,
        height: 512,
        steps: 12,
        seed: 99,
      },
      testContext(root),
    );
    const args = await readFile(argsLog, "utf8");

    expect(args).toContain("--model\n");
    expect(args).toContain(`${modelDir}\n`);
    expect(args).toContain("--prompt\nlocal matte painting\n");
    expect(args).toContain("--seed\n99\n");
    await expect(readFile(result.image_path, "utf8")).resolves.toBe("local-diffusion-image");
    expect(result).toMatchObject({ provider: "local", model: modelDir, cost_usd: 0, seed: 99 });
  });

  it("renders code_snippet as a transparent PNG", async () => {
    originalEnv = { ...process.env };
    const root = await tempDir("predit-code-snippet-");

    const result = await codeSnippet.execute(
      {
        code: "const total = 42;\nreturn total;",
        language: "ts",
        background: "transparent",
        padding: 12,
        font_size: 16,
      },
      testContext(root),
    );
    const png = await readFile(result.image_path);
    const decoded = decodePng(png);

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(decoded.width).toBe(result.width);
    expect(decoded.height).toBe(result.height);
    expect(alphaAt(decoded, 0, 0)).toBe(0);
    expect(alphaAt(decoded, decoded.width - 1, decoded.height - 1)).toBe(0);
    expect(result.cost_usd).toBe(0);
  });

  it("renders diagram_gen through Mermaid CLI with expected arguments", async () => {
    originalEnv = { ...process.env };
    const root = await tempDir("predit-diagram-root-");
    const binDir = await tempDir("predit-diagram-bin-");
    const argsLog = join(root, "mmdc-args.txt");
    await writeFakeBin(
      binDir,
      "mmdc",
      `#!/bin/sh
printf '%s\\n' "$@" > "$PREDIT_FAKE_ARGS_LOG"
out=""
prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
printf 'diagram-image' > "$out"
`,
    );
    process.env.PATH = `${binDir}:${originalEnv.PATH ?? ""}`;
    process.env.PREDIT_FAKE_ARGS_LOG = argsLog;

    await expect(diagramGen.isAvailable()).resolves.toEqual({ available: true });

    const result = await diagramGen.execute(
      {
        source: "flowchart TD\nA-->B",
        format: "svg",
        theme: "dark",
        background: "transparent",
        width: 800,
        height: 600,
      },
      testContext(root),
    );
    const args = await readFile(argsLog, "utf8");

    expect(args).toContain("-i\n");
    expect(args).toContain("-o\n");
    expect(args).toContain("-t\ndark\n");
    expect(args).toContain("-b\ntransparent\n");
    expect(args).toContain("-w\n800\n");
    expect(args).toContain("-H\n600\n");
    await expect(readFile(result.image_path, "utf8")).resolves.toBe("diagram-image");
    expect(result).toMatchObject({ format: "svg", cost_usd: 0 });
  });

  it("renders math_animate through Manim and copies the rendered fixture", async () => {
    originalEnv = { ...process.env };
    const root = await tempDir("predit-manim-root-");
    const binDir = await tempDir("predit-manim-bin-");
    const argsLog = join(root, "manim-args.txt");
    await writeFakeBin(
      binDir,
      "manim",
      `#!/bin/sh
printf '%s\\n' "$@" > "$PREDIT_FAKE_ARGS_LOG"
format="mp4"
out="scene"
prev=""
for arg in "$@"; do
  if [ "$prev" = "--format" ]; then format="$arg"; fi
  if [ "$prev" = "-o" ]; then out="$arg"; fi
  prev="$arg"
done
mkdir -p media/videos/scene/480p15
printf 'manim-render' > "media/videos/scene/480p15/$out.$format"
`,
    );
    process.env.PATH = `${binDir}:${originalEnv.PATH ?? ""}`;
    process.env.PREDIT_FAKE_ARGS_LOG = argsLog;

    await expect(mathAnimate.isAvailable()).resolves.toEqual({ available: true });

    const result = await mathAnimate.execute(
      {
        scene_source: "from manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.add(MathTex('x^2'))",
        scene_class: "Demo",
        quality: "l",
        output_format: "png",
      },
      testContext(root),
    );
    const args = await readFile(argsLog, "utf8");

    expect(args).toContain("-ql\n");
    expect(args).toContain("--format\npng\n");
    expect(args).toContain("-o\n");
    expect(args).toContain("Demo\n");
    await expect(readFile(result.image_path, "utf8")).resolves.toBe("manim-render");
    expect(result).toMatchObject({ format: "png", cost_usd: 0 });
  });
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `${prefix}${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
}

async function writeFakeBin(dir: string, name: string, script: string): Promise<void> {
  const path = join(dir, name);
  await writeFile(path, script, "utf8");
  await chmod(path, 0o755);
}

function testContext(root: string) {
  return {
    projectRoot: root,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}

type DecodedPng = {
  width: number;
  height: number;
  raw: Buffer;
};

function decodePng(png: Buffer): DecodedPng {
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    }
    if (type === "IDAT") {
      idat.push(data);
    }
    offset += 12 + length;
  }

  return { width, height, raw: inflateSync(Buffer.concat(idat)) };
}

function alphaAt(png: DecodedPng, x: number, y: number): number {
  const scanline = png.width * 4 + 1;
  return png.raw[y * scanline + 1 + x * 4 + 3] ?? -1;
}
