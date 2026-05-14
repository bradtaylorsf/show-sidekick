import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCapabilityExtensions } from "./capability-extension.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("loadCapabilityExtensions", () => {
  it("discovers project scripts, tools, playbooks, and show skills", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, "projects", "show", "episode", "scripts"), { recursive: true });
    await mkdir(path.join(root, "projects", "show", "episode", "tools"), { recursive: true });
    await mkdir(path.join(root, "playbooks"), { recursive: true });
    await mkdir(path.join(root, "shows", "show", "skills"), { recursive: true });
    await writeFile(path.join(root, "projects", "show", "episode", "scripts", "render-map.ts"), "export {}\n", "utf8");
    await writeFile(
      path.join(root, "projects", "show", "episode", "tools", "signed-upload.js"),
      "export default { cost: { unit: 'call', usd: 0.12 }, integration: { kind: 'api' } };\n",
      "utf8",
    );
    await writeFile(path.join(root, "projects", "show", "episode", "tools", "_draft.js"), "export default {};\n", "utf8");
    await writeFile(path.join(root, "playbooks", "custom-look.yaml"), "identity: {}\n", "utf8");
    await writeFile(path.join(root, "shows", "show", "skills", "reference-fix.md"), "# skill\n", "utf8");

    const extensions = await loadCapabilityExtensions({ projectRoot: root, show: "show", episode: "episode" });

    expect(extensions.scripts).toEqual([
      expect.objectContaining({ kind: "script", name: "render-map", isPaid: false }),
    ]);
    expect(extensions.tools).toEqual([
      expect.objectContaining({ kind: "tool", name: "signed-upload", isPaid: true }),
    ]);
    expect(extensions.playbooks).toEqual([
      expect.objectContaining({ kind: "playbook", name: "custom-look", isPaid: false }),
    ]);
    expect(extensions.skills).toEqual([
      expect.objectContaining({ kind: "skill", name: "reference-fix", isPaid: false }),
    ]);
    expect(extensions.all.map((extension) => `${extension.kind}:${extension.name}`)).toEqual([
      "playbook:custom-look",
      "script:render-map",
      "skill:reference-fix",
      "tool:signed-upload",
    ]);
  });

  it("is tolerant of missing extension directories", async () => {
    const root = await scratchProject();

    await expect(loadCapabilityExtensions({ projectRoot: root, show: "show", episode: "episode" })).resolves.toEqual({
      scripts: [],
      tools: [],
      playbooks: [],
      skills: [],
      all: [],
    });
  });

  it("wraps project tool import failures with the registry project-tool error shape", async () => {
    const root = await scratchProject();
    await mkdir(path.join(root, "projects", "show", "episode", "tools"), { recursive: true });
    await writeFile(
      path.join(root, "projects", "show", "episode", "tools", "broken.js"),
      "throw new Error('boom');\nexport default {};\n",
      "utf8",
    );

    await expect(loadCapabilityExtensions({ projectRoot: root, show: "show", episode: "episode" })).rejects.toMatchObject({
      name: "RegistryError",
      code: "project-tool-failed",
      message: expect.stringContaining("Failed to import project tool"),
    });
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-capability-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}
