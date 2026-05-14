import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const portPipelineScript = path.join(repoRoot, "scripts/port-pipeline-content.mjs");
const portScripts = [
  "scripts/port-bundled-content.mjs",
  "scripts/port-agent-skills.mjs",
  "scripts/port-pipeline-content.mjs",
];

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("porter script overwrite safety", () => {
  it("keeps dry-run and clobber-guard behavior in every porter script", async () => {
    const missing: string[] = [];

    for (const script of portScripts) {
      const raw = await readFile(path.join(repoRoot, script), "utf8");
      for (const expected of ["--dry-run", "--force", "Refusing to overwrite edited files without --force"]) {
        if (!raw.includes(expected)) {
          missing.push(`${script}: ${expected}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("does not overwrite edited pipeline files unless --force is passed", async () => {
    const cwd = await scratchProject();
    const sourceRoot = path.join(cwd, "reference");
    const targetPath = path.join(cwd, "bundled/pipelines/hybrid.yaml");
    await writeHybridSource(sourceRoot);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, "human second pass\n", "utf8");

    const result = await runNode(portPipelineScript, ["reference", "hybrid"], cwd);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Refusing to overwrite edited files without --force");
    await expect(readFile(targetPath, "utf8")).resolves.toBe("human second pass\n");
  });

  it("does not write files during a dry run", async () => {
    const cwd = await scratchProject();
    await writeHybridSource(path.join(cwd, "reference"));

    const result = await runNode(portPipelineScript, ["--dry-run", "reference", "hybrid"], cwd);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Dry run would write:");
    await expect(readFile(path.join(cwd, "bundled/pipelines/hybrid.yaml"), "utf8")).rejects.toThrow();
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-port-scripts-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeHybridSource(sourceRoot: string): Promise<void> {
  await mkdir(path.join(sourceRoot, "pipeline_defs"), { recursive: true });
  await mkdir(path.join(sourceRoot, "skills/pipelines/hybrid"), { recursive: true });
  await writeFile(
    path.join(sourceRoot, "pipeline_defs/hybrid.yaml"),
    [
      "name: hybrid",
      'version: "2.0"',
      "description: Test hybrid pipeline.",
      "stability: beta",
      "orchestration:",
      "  mode: executive-producer",
      "  skill: pipelines/hybrid/executive-producer",
      "  budget_default_usd: 2",
      "stages:",
      "  - name: idea",
      "    skill: pipelines/hybrid/idea-director",
      "    produces: [brief]",
      "    tools_available: []",
      "    checkpoint_required: true",
      "    human_approval_default: true",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function runNode(script: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script, ...args], { cwd });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (!isExecError(error)) {
      throw error;
    }

    return {
      code: typeof error.code === "number" ? error.code : 1,
      stdout: String(error.stdout ?? ""),
      stderr: String(error.stderr ?? ""),
    };
  }
}

function isExecError(error: unknown): error is { code?: number | string; stdout?: unknown; stderr?: unknown } {
  return typeof error === "object" && error !== null && ("stdout" in error || "stderr" in error);
}
