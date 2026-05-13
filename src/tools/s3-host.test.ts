import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import s3Host from "./s3-host.js";

const envNames = [
  "PREDIT_S3_BUCKET",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "PREDIT_S3_PRESIGN_EXPIRES_S",
  "PREDIT_S3_PUBLIC_BASE_URL",
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

describe("s3_host tool", () => {
  it("uploads to S3 and returns a presigned URL with expiry", async () => {
    originalEnv = { ...process.env };
    process.env.PREDIT_S3_BUCKET = "predit-test";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.PREDIT_S3_PRESIGN_EXPIRES_S = "60";
    const root = await tempDir();
    const localPath = join(root, "image.png");
    await writeFile(localPath, "fixture", "utf8");
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await s3Host.execute({ local_path: localPath }, testContext(root));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/predit-test\.s3\.us-east-1\.amazonaws\.com\/predit\//),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ authorization: expect.stringContaining("AWS4-HMAC-SHA256") }),
      }),
    );
    expect(result.provider).toBe("s3");
    expect(result.url).toContain("X-Amz-Signature=");
    expect(result.expires_at).toEqual(expect.any(String));
    expect(result.cost_usd).toBe(0);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-s3-host-${crypto.randomUUID()}`), { recursive: true });
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
