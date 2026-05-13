import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import corpusBuilder, { buildCorpusIndex, enumerateCorpusFiles, extensionsFromGlob, isVideoPath } from "./corpus-builder.js";

describe("corpus_builder", () => {
  it("registers the corpus index capability", async () => {
    expect(corpusBuilder.name).toBe("corpus_builder");
    expect(corpusBuilder.capability).toBe("corpus_index");
    await expect(corpusBuilder.isAvailable()).resolves.toEqual({ available: true });
  });

  it("extracts supported extensions from the default glob shape", () => {
    expect([...extensionsFromGlob("**/*.{png,jpg,jpeg,mp4,mov}")]).toEqual([".png", ".jpg", ".jpeg", ".mp4", ".mov"]);
    expect(isVideoPath("clip.mov")).toBe(true);
    expect(isVideoPath("image.png")).toBe(false);
  });

  it("enumerates fixture media files from a directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "predit-corpus-"));
    await writeFile(join(root, "a.png"), "image");
    await writeFile(join(root, "b.txt"), "ignore");
    await writeFile(join(root, "c.mov"), "video");

    const files = await enumerateCorpusFiles(root);

    expect(files.map((file) => file.slice(root.length + 1))).toEqual(["a.png", "c.mov"]);
  });

  it("builds and writes an index shape with a stub embedder", async () => {
    const index = await buildCorpusIndex(["/tmp/a.png", "/tmp/b.jpg"], async (path) => ({
      model_id: "mock-clip",
      vector: path.endsWith("a.png") ? [1, 0] : [0, 1],
    }));
    const outputPath = join(await mkdtemp(join(tmpdir(), "predit-index-")), "index.json");
    await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

    expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual({
      model_id: "mock-clip",
      items: [
        { path: "/tmp/a.png", vector: [1, 0] },
        { path: "/tmp/b.jpg", vector: [0, 1] },
      ],
    });
  });
});
