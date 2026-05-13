import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getUploadCount, quotaFilePath, recordUpload, shouldWarn } from "./host-quota.js";

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("host quota tracking", () => {
  it("increments today's counter per provider", async () => {
    const root = await tempDir();
    const now = new Date("2026-05-13T12:00:00.000Z");

    expect(recordUpload("catbox", { projectRoot: root, now })).toEqual({ count_today: 1, warned: false });
    expect(recordUpload("catbox", { projectRoot: root, now })).toEqual({ count_today: 2, warned: false });
    expect(getUploadCount("catbox", { projectRoot: root, now })).toBe(2);
  });

  it("warns exactly at the Catbox threshold", async () => {
    const root = await tempDir();
    const now = new Date("2026-05-13T12:00:00.000Z");
    let record = { count_today: 0, warned: false };

    for (let index = 0; index < 41; index += 1) {
      record = recordUpload("catbox", { projectRoot: root, now });
      if (index < 39) {
        expect(record.warned).toBe(false);
      }
    }

    expect(shouldWarn("catbox", 40)).toBe(true);
    expect(record).toEqual({ count_today: 41, warned: false });
  });

  it("rolls over counters by day", async () => {
    const root = await tempDir();

    recordUpload("catbox", { projectRoot: root, now: new Date("2026-05-13T23:59:00.000Z") });
    expect(getUploadCount("catbox", { projectRoot: root, now: new Date("2026-05-14T00:01:00.000Z") })).toBe(0);
  });

  it("prunes entries older than seven days", async () => {
    const root = await tempDir();
    await mkdir(join(root, ".predit"), { recursive: true });
    await writeFile(
      quotaFilePath(root),
      `${JSON.stringify({
        catbox: {
          "2026-05-01": 3,
          "2026-05-06": 4,
        },
      })}\n`,
      "utf8",
    );

    expect(getUploadCount("catbox", { projectRoot: root, now: new Date("2026-05-13T12:00:00.000Z") })).toBe(0);
    const retained = getUploadCount("catbox", { projectRoot: root, now: new Date("2026-05-06T12:00:00.000Z") });
    expect(retained).toBe(4);
  });
});

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-host-quota-${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
}
