import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_CACHE_DIRS, computeBundledChecksum, copyBundledInto } from "./bundled.js";

let scratchDirs: string[] = [];

async function scratchDir(label: string): Promise<string> {
  const root = path.join(tmpdir(), `predit-${label}-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("bundled cache materialization", () => {
  it("copies the bundled cache directories into .predit", async () => {
    const source = await scratchDir("bundled-source");
    const target = await scratchDir("bundled-target");
    await writeMinimalBundled(source);

    await copyBundledInto(target, source);

    for (const dirname of BUNDLED_CACHE_DIRS) {
      await expect(readFile(path.join(target, dirname, `${dirname}.txt`), "utf8")).resolves.toBe(`${dirname}\n`);
    }
  });

  it("creates empty cache directories when a bundled directory has not shipped yet", async () => {
    const source = await scratchDir("bundled-source");
    const target = await scratchDir("bundled-target");
    await mkdir(path.join(source, "pipelines"), { recursive: true });
    await writeFile(path.join(source, "pipelines", "example.yaml"), "slug: example\n", "utf8");

    await copyBundledInto(target, source);

    await expect(readFile(path.join(target, "pipelines", "example.yaml"), "utf8")).resolves.toBe("slug: example\n");
    await expect(stat(path.join(target, "starters"))).resolves.toMatchObject({ isDirectory: expect.any(Function) });
  });

  it("computes a deterministic checksum over sorted bundled files", async () => {
    const source = await scratchDir("bundled-source");
    await writeMinimalBundled(source);

    const first = await computeBundledChecksum(source);
    const second = await computeBundledChecksum(source);
    expect(first).toBe(second);

    await writeFile(path.join(source, "skills", "skills.txt"), "changed\n", "utf8");
    await expect(computeBundledChecksum(source)).resolves.not.toBe(first);
  });
});

async function writeMinimalBundled(source: string): Promise<void> {
  for (const dirname of BUNDLED_CACHE_DIRS) {
    await mkdir(path.join(source, dirname), { recursive: true });
    await writeFile(path.join(source, dirname, `${dirname}.txt`), `${dirname}\n`, "utf8");
  }
}
