import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import fluxImage from "./flux-image.js";
import googleImagen from "./google-imagen.js";
import grokImage from "./grok-image.js";
import openaiImage from "./openai-image.js";
import recraftImage from "./recraft-image.js";

const envNames = [
  "BFL_API_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_CLOUD_PROJECT",
  "OPENAI_API_KEY",
  "XAI_API_KEY",
  "RECRAFT_API_KEY",
];

const imageBytes = Buffer.from("generated-image-fixture");
const imageBase64 = imageBytes.toString("base64");

let originalEnv: NodeJS.ProcessEnv;
let tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const name of envNames) {
    if (originalEnv?.[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnv[name];
    }
  }
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("API image generation tools", () => {
  it("reports API env availability and configured per-image costs", async () => {
    originalEnv = { ...process.env };
    for (const name of envNames) {
      delete process.env[name];
    }

    await expect(fluxImage.isAvailable()).resolves.toEqual({ available: false, reason: "missing env: BFL_API_KEY", fix: "env" });
    await expect(openaiImage.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: OPENAI_API_KEY",
      fix: "env",
    });
    await expect(googleImagen.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_JSON",
      fix: "env",
    });

    process.env.BFL_API_KEY = "bfl-key";
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount());

    await expect(fluxImage.isAvailable()).resolves.toEqual({ available: true });
    await expect(openaiImage.isAvailable()).resolves.toEqual({ available: true });
    await expect(googleImagen.isAvailable()).resolves.toEqual({ available: true });
    expect(fluxImage.cost).toEqual({ unit: "image", usd: 0.04 });
    expect(openaiImage.cost).toEqual({ unit: "image", usd: 0.04 });
    expect(googleImagen.cost).toEqual({ unit: "image", usd: 0.04 });
    expect(grokImage.cost).toEqual({ unit: "image", usd: 0.07 });
    expect(recraftImage.cost).toEqual({ unit: "image", usd: 0.04 });
  });

  it("generates a FLUX image by creating, polling, downloading, and writing bytes", async () => {
    originalEnv = { ...process.env };
    process.env.BFL_API_KEY = "bfl-key";
    const root = await tempDir();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ id: "request-1" }))
      .mockResolvedValueOnce(jsonResponse({ status: "Ready", result: { sample: "https://cdn.example.test/flux.png" } }))
      .mockResolvedValueOnce(new Response(imageBytes));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fluxImage.execute(
      {
        prompt: "a clean product shot",
        aspect_ratio: "16:9",
        seed: 42,
        poll_interval_ms: 0,
      },
      testContext(root),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.bfl.ai/v1/flux-pro-1.1",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-key": "bfl-key" }),
      }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      prompt: "a clean product shot",
      aspect_ratio: "16:9",
      seed: 42,
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.bfl.ai/v1/get_result?id=request-1",
      expect.objectContaining({ method: "GET" }),
    );
    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result).toMatchObject({
      url: "https://cdn.example.test/flux.png",
      provider: "bfl",
      model: "flux-pro-1.1",
      cost_usd: 0.04,
      seed: 42,
    });
  });

  it("generates a Google Imagen image with a service account access token", async () => {
    originalEnv = { ...process.env };
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount());
    process.env.GOOGLE_CLOUD_PROJECT = "predit-project";
    const root = await tempDir();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ access_token: "google-token" }))
      .mockResolvedValueOnce(jsonResponse({ predictions: [{ bytesBase64Encoded: imageBase64 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await googleImagen.execute(
      {
        prompt: "a watercolor storyboard frame",
        aspect_ratio: "4:3",
        seed: 7,
      },
      testContext(root),
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://us-central1-aiplatform.googleapis.com/v1/projects/predit-project/locations/us-central1/publishers/google/models/imagen-3.0-generate-001:predict",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer google-token" }),
      }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toEqual({
      instances: [{ prompt: "a watercolor storyboard frame" }],
      parameters: { aspectRatio: "4:3", seed: 7, sampleCount: 1 },
    });
    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result).toMatchObject({
      provider: "google",
      model: "imagen-3.0-generate-001",
      cost_usd: 0.04,
      seed: 7,
    });
  });

  it("generates an OpenAI image and writes the decoded base64 bytes", async () => {
    originalEnv = { ...process.env };
    process.env.OPENAI_API_KEY = "openai-key";
    const root = await tempDir();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: imageBase64 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await openaiImage.execute({ prompt: "poster text that reads Launch Day", size: "1024x1536" }, testContext(root));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer openai-key" }),
      }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      model: "gpt-image-1",
      prompt: "poster text that reads Launch Day",
      size: "1024x1536",
      quality: "auto",
      n: 1,
    });
    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result).toMatchObject({ provider: "openai", model: "gpt-image-1", cost_usd: 0.04 });
  });

  it("generates a Grok image through xAI", async () => {
    originalEnv = { ...process.env };
    process.env.XAI_API_KEY = "xai-key";
    const root = await tempDir();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: imageBase64 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await grokImage.execute({ prompt: "a cinematic concept frame", aspect_ratio: "16:9" }, testContext(root));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.x.ai/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer xai-key" }),
      }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      model: "grok-2-image",
      prompt: "a cinematic concept frame",
      n: 1,
      response_format: "b64_json",
      aspect_ratio: "16:9",
    });
    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result).toMatchObject({ provider: "xai", model: "grok-2-image", cost_usd: 0.07 });
  });

  it("generates a Recraft v3 image", async () => {
    originalEnv = { ...process.env };
    process.env.RECRAFT_API_KEY = "recraft-key";
    const root = await tempDir();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ data: [{ b64_json: imageBase64 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await recraftImage.execute(
      { prompt: "a vector editorial spot illustration", size: "1024x1024", style: "digital_illustration" },
      testContext(root),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://external.api.recraft.ai/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer recraft-key" }),
      }),
    );
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
      prompt: "a vector editorial spot illustration",
      model: "recraftv3",
      size: "1024x1024",
      style: "digital_illustration",
    });
    await expect(readFile(result.image_path)).resolves.toEqual(imageBytes);
    expect(result).toMatchObject({ provider: "recraft", model: "recraftv3", cost_usd: 0.04 });
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-api-image-${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function serviceAccount(): Record<string, string> {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  return {
    client_email: "predit-test@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    project_id: "service-project",
  };
}

function testContext(root: string) {
  return {
    projectRoot: root,
    execution: {
      mode: "non_interactive" as const,
      io: { event: () => undefined },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
