import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getUploadCount, recordUpload } from "../registry/host-quota.js";
import catboxHost from "./catbox-host.js";

let tempDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("catbox_host tool", () => {
  it("uploads a local file and records quota", async () => {
    const root = await tempDir();
    const localPath = join(root, "image.png");
    await writeFile(localPath, "fixture", "utf8");
    const fetchMock = vi.fn(async () => new Response("https://files.catbox.moe/fixture.png\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await catboxHost.execute({ local_path: localPath }, testContext(root));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://catbox.moe/user/api.php",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(result).toEqual({
      url: "https://files.catbox.moe/fixture.png",
      expires_at: null,
      cost_usd: 0,
      provider: "catbox",
    });
    expect(getUploadCount("catbox", { projectRoot: root })).toBe(1);
  });

  it("warns at the Catbox soft quota threshold", async () => {
    const root = await tempDir();
    const localPath = join(root, "image.png");
    await writeFile(localPath, "fixture", "utf8");
    for (let index = 0; index < 39; index += 1) {
      recordUpload("catbox", { projectRoot: root });
    }
    const warn = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("https://files.catbox.moe/fixture.png", { status: 200 })));

    await catboxHost.execute({ local_path: localPath }, testContext(root, { warn }));

    expect(warn).toHaveBeenCalledWith("catbox quota: 40/50 uploads today", { count_today: 40 });
  });

  it("is unavailable when the daily Catbox quota is exhausted", async () => {
    const root = await tempDir();
    process.chdir(root);
    for (let index = 0; index < 50; index += 1) {
      recordUpload("catbox", { projectRoot: root });
    }

    await expect(catboxHost.isAvailable()).resolves.toEqual({
      available: false,
      reason: "catbox daily quota exhausted",
      fix: "manual",
    });
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-catbox-host-${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function testContext(root: string, overrides: { warn?: (...args: unknown[]) => void } = {}) {
  return {
    projectRoot: root,
    logger: {
      info: () => undefined,
      warn: overrides.warn ?? (() => undefined),
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
