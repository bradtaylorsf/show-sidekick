import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

import {
  EpisodeSchema,
  ShowSchema,
  validateEpisodeAgainstShow,
} from "./index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

type MutableShowFixture = Record<string, unknown> & {
  defaults?: { pipeline?: string };
  ingest?: { watch?: Array<{ pipeline?: string }> };
  pipelines?: Record<string, unknown>;
};

function loadFixture(name: string): unknown {
  return YAML.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

function issueMessages(result: ReturnType<typeof ShowSchema.safeParse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("ShowSchema", () => {
  it.each([
    ["music-videos.show.yaml", "music-videos"],
    ["thechaosfm.show.yaml", "thechaosfm"],
    ["last-rev.show.yaml", "last-rev"],
  ])("parses the %s fixture", (fixtureName, expectedSlug) => {
    const show = ShowSchema.parse(loadFixture(fixtureName));

    expect(show.slug).toBe(expectedSlug);
  });

  it("rejects shows with an empty pipelines map", () => {
    const show = loadFixture("music-videos.show.yaml") as MutableShowFixture;
    show.pipelines = {};

    const result = ShowSchema.safeParse(show);

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "show.pipelines must declare at least one pipeline",
    );
  });

  it("rejects a default pipeline that is not declared by the show", () => {
    const show = loadFixture("music-videos.show.yaml") as MutableShowFixture;
    show.defaults = { pipeline: "no-such" };

    const result = ShowSchema.safeParse(show);

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "defaults.pipeline 'no-such' is not a key in pipelines",
    );
  });

  it("rejects ingest watch entries that target undeclared pipelines", () => {
    const show = loadFixture("thechaosfm.show.yaml") as MutableShowFixture;
    const [firstWatch] = show.ingest?.watch ?? [];
    if (firstWatch) {
      firstWatch.pipeline = "no-such";
    }

    const result = ShowSchema.safeParse(show);

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "ingest.watch[0].pipeline 'no-such' is not a key in pipelines",
    );
  });
});

describe("EpisodeSchema", () => {
  it("validates an episode against its parent show pipeline map", () => {
    const show = ShowSchema.parse(loadFixture("thechaosfm.show.yaml"));
    const episode = EpisodeSchema.parse(loadFixture("news-song.episode.yaml"));

    const result = validateEpisodeAgainstShow(episode, show);

    expect(result).toEqual({ ok: true, resolvedPipeline: "news-song" });
  });

  it("falls back to the show default pipeline when the episode omits pipeline", () => {
    const show = ShowSchema.parse(loadFixture("thechaosfm.show.yaml"));
    const source = loadFixture("news-song.episode.yaml") as Record<string, unknown>;
    const { pipeline: _pipeline, ...withoutPipeline } = source;
    const episode = EpisodeSchema.parse(withoutPipeline);

    const result = validateEpisodeAgainstShow(episode, show);

    expect(result).toEqual({ ok: true, resolvedPipeline: "news-song" });
  });

  it("returns a helpful error when an episode targets an undeclared pipeline", () => {
    const show = ShowSchema.parse(loadFixture("thechaosfm.show.yaml"));
    const episode = EpisodeSchema.parse(loadFixture("undeclared-pipeline.episode.yaml"));

    const result = validateEpisodeAgainstShow(episode, show);

    expect(result).toEqual({
      ok: false,
      error:
        "episode pipeline 'documentary' is not declared in show.pipelines (available: news-song, music-video)",
    });
  });
});
