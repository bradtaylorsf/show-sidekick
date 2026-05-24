import { describe, expect, it } from "vitest";
import { deepMerge } from "./deep-merge.js";
import { EpisodeSchema, validateEpisodeAgainstShow } from "./episode.js";
import { ShowSchema } from "./show.js";

describe("ShowSchema", () => {
  it("accepts a single-pipeline show", () => {
    const show = ShowSchema.parse({
      slug: "music-videos",
      display_name: "Music Videos",
      created: "2026-05-12",
      brand: "./brand/",
      characters: "./characters/",
      skills: "./skills/",
      pipelines: {
        "music-video": {
          playbook: "playful-hip-hop-explainer",
          runtime: "hyperframes",
          aspect: "9:16",
          budget_usd: 5,
        },
      },
      defaults: {
        pipeline: "music-video",
      },
    });

    expect(show.defaults.pipeline).toBe("music-video");
  });

  it("accepts a multi-format news and music show", () => {
    const show = ShowSchema.parse({
      slug: "news-music-studio",
      display_name: "News Music Studio",
      description: "News songs plus evergreen music videos",
      created: "2026-05-12",
      brand: "./brand/",
      characters: "./characters/",
      skills: "./skills/",
      pipelines: {
        "news-song": {
          playbook: "ps2-dystopian-news-rap",
          runtime: "hyperframes",
          aspect: "16:9",
          budget_usd: 6,
          playbook_overrides: "./pipelines/news-song.playbook-overrides.yaml",
        },
        "music-video": {
          playbook: "beat-synced-lyric-video",
          runtime: "hyperframes",
          aspect: "16:9",
          budget_usd: 5,
        },
      },
      defaults: {
        pipeline: "news-song",
        language: "en",
      },
      ingest: {
        episode_template: "./episode.template.yaml",
        watch: [
          {
            path: "../../music_library/news-music-studio-news",
            match: "**/track.mp3",
            pipeline: "news-song",
            slug_from: "parent_dir",
          },
          {
            path: "../../music_library/news-music-studio-songs",
            match: "**/track.mp3",
            pipeline: "music-video",
            slug_from: "parent_dir",
          },
        ],
      },
      export: {
        default_target: "capcut",
        asset_link_mode: "copy",
      },
    });

    expect(Object.keys(show.pipelines)).toEqual(["news-song", "music-video"]);
  });

  it("accepts a product studio as a multi-pipeline show", () => {
    const show = ShowSchema.parse({
      slug: "product-studio",
      display_name: "Product Studio",
      created: "2026-05-12",
      pipelines: {
        "screen-demo": {
          playbook: "clean-professional",
          runtime: "remotion",
          capture_mode: "synthetic_terminal",
        },
        "talking-head": {
          playbook: "clean-professional",
          runtime: "remotion",
        },
      },
      defaults: {
        pipeline: "screen-demo",
      },
    });

    expect(show.pipelines["talking-head"]?.runtime).toBe("remotion");
    expect(show.pipelines["screen-demo"]?.capture_mode).toBe("synthetic_terminal");
  });

  it("accepts sample provider plans at show and pipeline scope", () => {
    const show = ShowSchema.parse({
      slug: "provider-flex",
      display_name: "Provider Flex",
      created: "2026-05-12",
      sample_providers: {
        image: { provider: "google", model: "imagen-3.0-generate-001" },
        video: { tool: "veo_video", model: "veo-2.0-generate-001" },
      },
      pipelines: {
        explainer: {
          runtime: "remotion",
          sample_providers: {
            tts: { tool: "google_tts", voice_id: "en-US-Chirp3-HD-Charon" },
          },
        },
      },
      defaults: {
        pipeline: "explainer",
      },
    });

    expect(show.sample_providers?.image?.provider).toBe("google");
    expect(show.pipelines.explainer?.sample_providers?.tts?.tool).toBe("google_tts");
  });

  it("rejects a show with no pipelines", () => {
    expect(() =>
      ShowSchema.parse({
        slug: "empty",
        display_name: "Empty",
        created: "2026-05-12",
        pipelines: {},
        defaults: {
          pipeline: "music-video",
        },
      }),
    ).toThrow("show.pipelines must declare at least one pipeline");
  });

  it("rejects defaults.pipeline when it is not declared", () => {
    expect(() =>
      ShowSchema.parse({
        slug: "bad-default",
        display_name: "Bad Default",
        created: "2026-05-12",
        pipelines: {
          "music-video": {},
        },
        defaults: {
          pipeline: "daily-news",
        },
      }),
    ).toThrow("defaults.pipeline 'daily-news' is not a key in pipelines");
  });

  it("rejects ingest watch pipeline references that are not declared", () => {
    expect(() =>
      ShowSchema.parse({
        slug: "bad-ingest",
        display_name: "Bad Ingest",
        created: "2026-05-12",
        pipelines: {
          "news-song": {},
        },
        defaults: {
          pipeline: "news-song",
        },
        ingest: {
          watch: [
            {
              path: "./drop",
              match: "**/*.mp3",
              pipeline: "music-video",
            },
          ],
        },
      }),
    ).toThrow("ingest.watch[0].pipeline 'music-video' is not a key in pipelines");
  });
});

describe("EpisodeSchema", () => {
  it("accepts an episode with pipeline overrides", () => {
    const episode = EpisodeSchema.parse({
      slug: "2026-05-12-news-jam",
      title: "Bi-weekly News Jam - May 12",
      created: "2026-05-12",
      pipeline: "news-song",
      playbook: "ps2-dystopian-news-rap",
      runtime: "hyperframes",
      aspect: "16:9",
      budget_usd: 6,
      inputs: {
        track: "music_library/news-music-studio-news/2026-05-12-news-jam/track.mp3",
      },
      cast: ["host-mc", "ambient-crowd"],
      tags: ["news-song", "ps2", "political-rap"],
    });

    expect(episode.pipeline).toBe("news-song");
  });

  it("accepts episode sample provider overrides", () => {
    const episode = EpisodeSchema.parse({
      slug: "provider-override",
      title: "Provider Override",
      created: "2026-05-12",
      sample_providers: {
        image: { tool: "flux_image", model: "flux-dev" },
        voice: { provider: "openai", voice_id: "alloy" },
      },
    });

    expect(episode.sample_providers?.image?.tool).toBe("flux_image");
    expect(episode.sample_providers?.voice?.voice_id).toBe("alloy");
  });

  it("falls back to show.defaults.pipeline during show validation", () => {
    const show = ShowSchema.parse({
      slug: "music-videos",
      display_name: "Music Videos",
      created: "2026-05-12",
      pipelines: {
        "music-video": {},
      },
      defaults: {
        pipeline: "music-video",
      },
    });
    const episode = EpisodeSchema.parse({
      slug: "demo",
      title: "Demo",
      created: "2026-05-12",
    });

    expect(validateEpisodeAgainstShow(episode, show)).toEqual({ ok: true, errors: [] });
  });

  it("returns structured errors for an episode pipeline that is not declared by the parent show", () => {
    const show = ShowSchema.parse({
      slug: "product-studio",
      display_name: "Product Studio",
      created: "2026-05-12",
      pipelines: {
        "screen-demo": {},
      },
      defaults: {
        pipeline: "screen-demo",
      },
    });
    const episode = EpisodeSchema.parse({
      slug: "talking-head-demo",
      title: "Talking Head Demo",
      created: "2026-05-12",
      pipeline: "talking-head",
    });

    expect(validateEpisodeAgainstShow(episode, show)).toEqual({
      ok: false,
      errors: [
        {
          path: "pipeline",
          message: "episode.pipeline 'talking-head' is not a key in show.pipelines",
        },
      ],
    });
  });
});

describe("deepMerge", () => {
  it("merges objects by key", () => {
    expect(deepMerge({ nested: { a: 1, b: 2 } }, { nested: { b: 3, c: 4 } })).toEqual({
      nested: { a: 1, b: 3, c: 4 },
    });
  });

  it("replaces arrays instead of concatenating", () => {
    expect(deepMerge({ values: [1, 2], keep: true }, { values: [3] })).toEqual({
      values: [3],
      keep: true,
    });
  });

  it("removes keys when the override is null", () => {
    expect(deepMerge({ a: 1, nested: { b: 2, c: 3 } }, { nested: { b: null } })).toEqual({
      a: 1,
      nested: { c: 3 },
    });
  });

  it("does not mutate either input", () => {
    const base = { nested: { values: [1, 2] } };
    const overrides = { nested: { values: [3] } };

    expect(deepMerge(base, overrides)).toEqual({ nested: { values: [3] } });
    expect(base).toEqual({ nested: { values: [1, 2] } });
    expect(overrides).toEqual({ nested: { values: [3] } });
  });
});
