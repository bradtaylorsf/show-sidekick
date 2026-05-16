import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import higgsfieldImage from "./higgsfield-image.js";

const imageBytes = Buffer.from("higgsfield-image-fixture");
const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs.length = 0;
});

describe("higgsfield_image tool", () => {
  it("declares GPT Image 2 still generation through the Higgsfield CLI", () => {
    expect(higgsfieldImage).toMatchObject({
      name: "higgsfield_image",
      capability: "image_generation",
      provider: "higgsfield",
      integration: {
        kind: "cli",
        binary: "higgsfield",
        auth: { mode: "cli-login", check: "higgsfield account status --json" },
      },
      supports: ["gpt_image_2", "text-to-image", "still-assets"],
    });
  });

  it("generates a GPT Image 2 still, downloads the result, and writes it locally", async () => {
    const projectRoot = await tempDir();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(imageBytes));
    const runCli = vi.fn(async () => ({
      stdout: JSON.stringify([{ result: { url: "https://cdn.higgsfield.example/frame.png" } }]),
      stderr: "",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await higgsfieldImage.execute(
      { prompt: "low-poly political music video frame", aspect_ratio: "16:9", resolution: "2k" },
      context(projectRoot, runCli),
    );

    expect(runCli).toHaveBeenCalledWith(
      "higgsfield",
      expect.arrayContaining(["generate", "create", "gpt_image_2", "--aspect_ratio", "16:9", "--resolution", "2k", "--wait", "--json"]),
      { cwd: projectRoot },
    );
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.higgsfield.example/frame.png");
    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result).toMatchObject({
      url: "https://cdn.higgsfield.example/frame.png",
      provider: "higgsfield",
      model: "gpt_image_2",
      cost_usd: 0.04,
    });
  });

  it("accepts a local image path returned by the CLI", async () => {
    const projectRoot = await tempDir();
    await mkdir(join(projectRoot, "outputs"), { recursive: true });
    await writeFile(join(projectRoot, "outputs", "frame.png"), imageBytes);
    const runCli = vi.fn(async () => ({
      stdout: JSON.stringify({ image_path: "outputs/frame.png" }),
      stderr: "",
    }));

    const result = await higgsfieldImage.execute({ prompt: "frame" }, context(projectRoot, runCli));

    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result.url).toBeUndefined();
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "predit-higgsfield-image-"));
  tempDirs.push(dir);
  return dir;
}

function context(projectRoot: string, runCli: ToolContext["runCli"]): ToolContext {
  return {
    projectRoot,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
    execution: { mode: "non_interactive" },
    runCli,
  };
}
