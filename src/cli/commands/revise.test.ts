import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSampleCheckpoint, writeSampleCheckpoint } from "../../checkpoints/sample.js";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-revise-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("revise command", () => {
  it("increments the sample version and stores the revision note", async () => {
    const root = await scratchProject();
    await writeSampleCheckpoint(root, "show", "episode", 1, {
      cost_for_this_sample: 0.5,
      cumulative_sample_cost: 0.5,
      projected_full_cost: 3,
      sample_video_path: "projects/show/episode/renders/sample.mp4",
    });
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "revise", "show/episode", "tighten the chorus"], {
      from: "node",
    });

    const event = JSON.parse(output().stdout.trim()) as { event: string; version: number; revision_note: string };
    expect(event).toEqual(
      expect.objectContaining({
        event: "sample_revised",
        version: 2,
        revision_note: "tighten the chorus",
      }),
    );
    await expect(readSampleCheckpoint(root, "show", "episode", 2)).resolves.toMatchObject({
      version: 2,
      cost_for_this_sample: 0.5,
      cumulative_sample_cost: 0.5,
      projected_full_cost: 3,
      sample_video_path: "projects/show/episode/renders/sample.mp4",
      revision_note: "tighten the chorus",
    });
  });
});

function captureProgram() {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
    stdout: {
      write: (value: string) => {
        stdout += value;
        return true;
      },
    },
    stderr: {
      write: (value: string) => {
        stderr += value;
        return true;
      },
    },
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}
