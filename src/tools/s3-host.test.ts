import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import s3Host from "./s3-host.js";

const envNames = [
  "SHOW_SIDEKICK_S3_BUCKET",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "SHOW_SIDEKICK_S3_PRESIGN_EXPIRES_S",
  "SHOW_SIDEKICK_S3_PUBLIC_BASE_URL",
  "PREDIT_S3_BUCKET",
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
    process.env.SHOW_SIDEKICK_S3_BUCKET = "show-sidekick-test";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    process.env.SHOW_SIDEKICK_S3_PRESIGN_EXPIRES_S = "60";
    const root = await tempDir();
    const localPath = join(root, "image.png");
    await writeFile(localPath, "fixture", "utf8");
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await s3Host.execute({ local_path: localPath }, testContext(root));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/show-sidekick-test\.s3\.us-east-1\.amazonaws\.com\/show-sidekick\//),
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

  it("rejects legacy PREDIT_S3 env vars with migration guidance", async () => {
    originalEnv = { ...process.env };
    process.env.PREDIT_S3_BUCKET = "legacy";
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "AKIATEST";
    process.env.AWS_SECRET_ACCESS_KEY = "secret";
    const root = await tempDir();
    const localPath = join(root, "image.png");
    await writeFile(localPath, "fixture", "utf8");

    await expect(s3Host.execute({ local_path: localPath }, testContext(root))).rejects.toThrow(
      "Rename it to SHOW_SIDEKICK_S3_BUCKET",
    );
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
