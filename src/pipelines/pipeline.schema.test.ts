import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import YAML from "yaml";

import { PipelineManifestSchema } from "./index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function loadFixture(name: string): unknown {
  return YAML.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

function issueMessages(
  result: ReturnType<typeof PipelineManifestSchema.safeParse>,
): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("PipelineManifestSchema", () => {
  it.each([
    ["framework-smoke.pipeline.yaml", "framework-smoke"],
    ["music-video.pipeline.yaml", "music-video"],
    ["documentary-montage.pipeline.yaml", "documentary-montage"],
    ["daily-news.pipeline.yaml", "daily-news"],
    ["character-animation.pipeline.yaml", "character-animation"],
    ["thechaosfm.pipeline.yaml", "thechaosfm"],
  ])("parses the %s fixture", (fixtureName, expectedSlug) => {
    const manifest = PipelineManifestSchema.parse(loadFixture(fixtureName));

    expect(manifest.slug).toBe(expectedSlug);
  });

  it("parses a minimal manifest with only slug and stages", () => {
    const manifest = PipelineManifestSchema.parse(loadFixture("framework-smoke.pipeline.yaml"));

    expect(manifest).toMatchObject({
      slug: "framework-smoke",
      orchestration: {
        budget_default_usd: 3,
        max_revisions_per_stage: 2,
        max_send_backs: 3,
        max_wall_time_minutes: 30,
      },
      stages: [
        {
          slug: "research",
          tools_available: [],
          review_focus: [],
          success_criteria: [],
        },
        {
          slug: "script",
          tools_available: [],
          review_focus: [],
          success_criteria: [],
        },
      ],
    });
  });

  it("preserves arbitrary metadata keys", () => {
    const manifest = PipelineManifestSchema.parse(loadFixture("thechaosfm.pipeline.yaml"));

    expect(manifest.metadata).toMatchObject({
      brand: {
        logo: "shows/thechaosfm/brand/logo.svg",
        style_playbook: "shows/thechaosfm/brand/style-playbook.md",
        project_root: "shows/thechaosfm",
        slogans: {
          primary: "Procedural panic, explained on beat.",
        },
      },
      content_modes: {
        sourced: {
          requires_sources_yaml: true,
          citation_style: "lower_third",
        },
        source_free: {
          requires_sources_yaml: false,
          citation_style: "none",
        },
      },
    });
  });

  it("applies default orchestration limits when the block is omitted", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "defaults-check",
      stages: [{ slug: "research" }],
    });

    expect(manifest.orchestration).toEqual({
      budget_default_usd: 3,
      max_revisions_per_stage: 2,
      max_send_backs: 3,
      max_wall_time_minutes: 30,
    });
  });

  it("applies partial orchestration defaults when only some limits are declared", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "partial-defaults-check",
      stages: [{ slug: "research" }],
      orchestration: {
        max_send_backs: 1,
      },
    });

    expect(manifest.orchestration).toEqual({
      budget_default_usd: 3,
      max_revisions_per_stage: 2,
      max_send_backs: 1,
      max_wall_time_minutes: 30,
    });
  });

  it("rejects duplicate stage slugs", () => {
    const result = PipelineManifestSchema.safeParse({
      slug: "duplicate-slugs",
      stages: [{ slug: "research" }, { slug: "research" }],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "stage slug 'research' is declared more than once",
    );
  });

  it("rejects more than one audio_sync build stage", () => {
    const result = PipelineManifestSchema.safeParse({
      slug: "too-many-builders",
      stages: [
        { slug: "cuesheet", audio_sync: "build" },
        { slug: "scene_plan", audio_sync: "build" },
      ],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "at most one stage may declare audio_sync: build",
    );
  });

  it("rejects audio_sync required before the build stage", () => {
    const result = PipelineManifestSchema.safeParse({
      slug: "sync-required-too-early",
      stages: [
        { slug: "idea", audio_sync: "required" },
        { slug: "cuesheet", audio_sync: "build" },
      ],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "audio_sync: required may not precede audio_sync: build",
    );
  });

  it("rejects requires_runtime outside compose", () => {
    const result = PipelineManifestSchema.safeParse({
      slug: "bad-runtime",
      stages: [{ slug: "assets", requires_runtime: "remotion" }],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "requires_runtime is valid only on the compose stage",
    );
  });

  it("rejects canonical stages declared out of relative order", () => {
    const result = PipelineManifestSchema.safeParse({
      slug: "out-of-order",
      stages: [{ slug: "script" }, { slug: "idea" }],
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain(
      "canonical stage 'idea' appears after 'script', but canonical stages must follow: research -> idea -> proposal -> script -> capture -> cuesheet -> character_design -> rig_plan -> scene_plan -> assets -> edit -> compose -> publish",
    );
  });

  it("allows non-canonical stages between canonical stages", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "custom-stage",
      stages: [
        { slug: "research" },
        { slug: "legal_review" },
        { slug: "script" },
      ],
    });

    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "research",
      "legal_review",
      "script",
    ]);
  });
});
