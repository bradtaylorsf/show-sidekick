import { describe, expect, it } from "vitest";
import { PipelineManifestSchema } from "./manifest.js";

function stage(slug: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug,
    skill: `pipelines/test/${slug}-director.md`,
    produces: `${slug}_artifact`,
    ...overrides,
  };
}

describe("PipelineManifestSchema", () => {
  it("accepts a minimal framework-smoke manifest", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "framework-smoke",
      stages: [stage("research"), stage("script")],
    });

    expect(manifest.orchestration).toEqual({
      budget_default_usd: 3,
      cost_drift_threshold: 1.3,
      max_revisions_per_stage: 2,
      max_send_backs: 3,
      max_wall_time_minutes: 30,
    });
  });

  it("accepts a full music-video manifest", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "music-video",
      display_name: "Music Video",
      description: "Vertical music videos for AI-generated music tracks",
      status: "production",
      master_clock: "audio",
      stage_order: "canonical",
      defaults: {
        aspect: "9:16",
        duration_strategy: "track_length",
        render_runtime: "hyperframes",
      },
      default_checkpoint_policy: "guided",
      reference_input: { supported: true },
      extensions: {
        custom_scripts: true,
        custom_playbooks: true,
        custom_skills: true,
        custom_tools: false,
      },
      required_skills: ["pipelines/music-video/executive-producer.md", "meta/reviewer"],
      compatible_playbooks: {
        recommended: ["clean-professional"],
        also_works: ["flat-motion-graphics"],
        custom_allowed: true,
      },
      stages: [
        stage("idea", {
          produces_artifacts: ["brief", "decision_log"],
          checkpoint_required: true,
          human_approval_default: true,
          tools_available: ["research", "web_search"],
          review_focus: ["hook_strength", "concept_clarity"],
          success_criteria: [{ concept_count: ">= 4" }],
          human_approval: "required",
        }),
        stage("proposal"),
        stage("script", { human_approval: "required" }),
        stage("cuesheet", {
          audio_sync: "build",
          tools_available: ["whisper", "aubio"],
          human_approval: "optional",
        }),
        stage("scene_plan", {
          audio_sync: "required",
          human_approval: "required",
        }),
        stage("assets", {
          sample_mode_supported: true,
          estimated_cost: {
            sample: { usd: 1, comment: "1-2 hero clips + 4-6 images" },
            full: { usd: 5, comment: "8-12 hero clips + 30-40 images" },
          },
        }),
        stage("edit"),
        stage("compose", {
          requires_runtime: "hyperframes",
          tools_available: ["video_compose"],
        }),
      ],
      export: {
        supported_targets: ["capcut", "premiere", "davinci", "edl"],
        default_target: "capcut",
        notes: "edit_decisions + cuesheet contain everything needed for NLE export.",
      },
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/music-video/executive-producer.md",
        budget_default_usd: 6,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 60,
      },
      sample: {
        duration_s_min: 10,
        duration_s_max: 18,
        hint: "Intro + first verse, or hook + climax-adjacent beat",
      },
    });

    expect(manifest.status).toBe("production");
  });

  it("accepts documentary-montage with skipped stages", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "documentary-montage",
        stages: [stage("idea"), stage("scene_plan"), stage("assets"), stage("edit"), stage("compose")],
      }),
    ).not.toThrow();
  });

  it("accepts daily-news with manifest order when preserving source capture-before-script semantics", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "daily-news",
        stage_order: "manifest",
        stages: [
          stage("idea"),
          stage("research"),
          stage("capture"),
          stage("script"),
          stage("scene_plan"),
          stage("assets"),
          stage("edit"),
          stage("compose"),
          stage("publish"),
        ],
      }),
    ).not.toThrow();
  });

  it("still rejects source order overrides unless stage_order is explicit", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "daily-news",
        stages: [stage("idea"), stage("research"), stage("capture"), stage("script")],
      }),
    ).toThrow("canonical stage 'research' must not appear after 'idea'");
  });

  it("accepts character-animation stages", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "character-animation",
        master_clock: "action_timeline",
        stages: [
          stage("research"),
          stage("proposal"),
          stage("script"),
          stage("character_design"),
          stage("rig_plan"),
          stage("scene_plan"),
          stage("assets"),
          stage("edit"),
          stage("compose"),
          stage("publish"),
        ],
      }),
    ).not.toThrow();
  });

  it("accepts arbitrary metadata keys for brand-specific pipeline metadata", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "news-music-studio",
      stages: [stage("idea"), stage("script"), stage("scene_plan"), stage("assets"), stage("edit"), stage("compose")],
      metadata: {
        brand: {
          voice: "source-backed musical commentary",
          content_mode: "sourced",
        },
      },
    });

    expect(manifest.metadata?.brand).toEqual({
      voice: "source-backed musical commentary",
      content_mode: "sourced",
    });
  });

  it("accepts declarative sample provider plans", () => {
    const manifest = PipelineManifestSchema.parse({
      slug: "provider-flex",
      sample_providers: {
        image: { tool: "google_imagen", model: "imagen-3.0-generate-001" },
        image_to_video: { provider: "google", tool: "veo_video" },
        tts: { tool: "google_tts", voice_id: "en-US-Chirp3-HD-Charon" },
      },
      stages: [stage("assets"), stage("edit"), stage("compose")],
    });

    expect(manifest.sample_providers?.image?.tool).toBe("google_imagen");
    expect(manifest.sample_providers?.image_to_video?.provider).toBe("google");
  });

  it("rejects empty stage lists", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "empty",
        stages: [],
      }),
    ).toThrow("Array must contain at least 1 element(s)");
  });

  it("rejects more than one audio_sync build stage", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "bad-audio-build",
        stages: [stage("cuesheet", { audio_sync: "build" }), stage("scene_plan", { audio_sync: "build" })],
      }),
    ).toThrow("only one stage may declare audio_sync: build");
  });

  it("rejects audio_sync required before a build stage", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "bad-audio-order",
        stages: [stage("idea", { audio_sync: "required" }), stage("cuesheet", { audio_sync: "build" })],
      }),
    ).toThrow("audio_sync: required may not precede an audio_sync: build stage");
  });

  it("rejects requires_runtime on non-compose stages", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "bad-runtime",
        stages: [stage("assets", { requires_runtime: "hyperframes" }), stage("compose")],
      }),
    ).toThrow("requires_runtime is valid only on the compose stage");
  });

  it("rejects duplicate stage slugs", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "duplicate-stage",
        stages: [stage("idea"), stage("idea")],
      }),
    ).toThrow("stage slug 'idea' is duplicated");
  });

  it("rejects canonical stages declared out of order", () => {
    expect(() =>
      PipelineManifestSchema.parse({
        slug: "bad-order",
        stages: [stage("script"), stage("proposal")],
      }),
    ).toThrow("canonical stage 'proposal' must not appear after 'script'");
  });
});
