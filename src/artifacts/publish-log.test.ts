import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PublishLogSchema, publishLogPath, readPublishLog, writePublishLog, type PublishLog } from "./publish-log.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("PublishLogSchema", () => {
  it("round-trips a publish log artifact", async () => {
    const root = scratchRoot();
    const log = publishLog();

    const outputPath = await writePublishLog(root, "show", "episode", log);
    const readBack = await readPublishLog(root, "show", "episode");

    expect(outputPath).toBe(publishLogPath(root, "show", "episode"));
    expect(readBack).toEqual(log);
  });

  it("requires outputs", () => {
    expect(() => PublishLogSchema.parse({ metadata: {} })).toThrow();
  });
});

function scratchRoot(): string {
  const root = path.join(tmpdir(), `predit-publish-log-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

function publishLog(): PublishLog {
  return {
    outputs: [
      {
        path: "/project/exports/show__episode.premiere/timeline.xml",
        kind: "fcp7_xml",
        platform: "premiere",
      },
    ],
    metadata: {
      exported_at: "2026-05-14T12:00:00.000Z",
      target: "premiere",
    },
    source_manifest_path: "/project/projects/show/episode/asset_manifest.json",
    captions_path: "/project/exports/show__episode.premiere/captions/word_timings.json",
    notes: ["Exported Premiere package."],
  };
}
