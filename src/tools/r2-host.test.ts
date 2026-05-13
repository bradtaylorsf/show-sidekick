import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import r2Host from "./r2-host.js";

const envNames = [
  "PREDIT_R2_BUCKET",
  "PREDIT_R2_ACCOUNT_ID",
  "PREDIT_R2_ACCESS_KEY_ID",
  "PREDIT_R2_SECRET_ACCESS_KEY",
  "PREDIT_R2_PUBLIC_BASE_URL",
];

let tempDirs: string[] = [];
let originalEnv: NodeJS.ProcessEnv;

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

describe("r2_host tool", () => {
  it("uploads to R2 and returns the public URL", async () => {
    originalEnv = { ...process.env };
    process.env.PREDIT_R2_BUCKET = "predit-test";
    process.env.PREDIT_R2_ACCOUNT_ID = "account123";
    process.env.PREDIT_R2_ACCESS_KEY_ID = "R2TEST";
    process.env.PREDIT_R2_SECRET_ACCESS_KEY = "secret";
    process.env.PREDIT_R2_PUBLIC_BASE_URL = "https://cdn.example.test";
    const root = await tempDir();
    const localPath = join(root, "image.png");
    await writeFile(localPath, "fixture", "utf8");
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await r2Host.execute({ local_path: localPath }, testContext(root));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/account123\.r2\.cloudflarestorage\.com\/predit-test\/predit\//),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ authorization: expect.stringContaining("AWS4-HMAC-SHA256") }),
      }),
    );
    expect(result.provider).toBe("r2");
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.test\/predit\/.+\/image\.png$/);
    expect(result.expires_at).toBeNull();
    expect(result.cost_usd).toBe(0);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-r2-host-${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
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
