import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Command } from "commander";
import { parse as parseYaml } from "yaml";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_MANIFEST_INVENTORY_SLUGS, SHOW_ONLY_DENYLIST } from "./demo-inventory.js";
import { PipelineManifestSchema, type PipelineManifest } from "./manifest.js";
import { createInitHandler } from "../cli/commands/init.js";
import { Registry } from "../registry/index.js";
import { computeBundledChecksum, copyBundledInto } from "../version/bundled.js";

const bundledPipelinesDir = fileURLToPath(new URL("../../bundled/pipelines/", import.meta.url));
const bundledPipelineSkillsDir = fileURLToPath(new URL("../../bundled/skills/pipelines/", import.meta.url));
const bundledArtifactSchemasDir = fileURLToPath(new URL("../../bundled/schemas/artifacts/", import.meta.url));
const bundledRootDir = fileURLToPath(new URL("../../bundled/", import.meta.url));
let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("bundled pipeline manifests", () => {
  it("does not ship unclassified bundled pipeline manifests", async () => {
    const files = await readdir(bundledPipelinesDir);
    const manifestSlugs = files
      .filter((file) => file.endsWith(".yaml"))
      .map((file) => path.basename(file, ".yaml"))
      .sort((left, right) => left.localeCompare(right));
    const knownManifestSlugs = new Set<string>(BUNDLED_MANIFEST_INVENTORY_SLUGS);

    expect(manifestSlugs).toEqual(manifestSlugs.filter((slug) => knownManifestSlugs.has(slug)));
  });

  it("does not ship show-only concepts as pipeline manifests", () => {
    for (const slug of SHOW_ONLY_DENYLIST) {
      expect(existsSync(path.join(bundledPipelinesDir, `${slug}.yaml`)), `${slug} must remain show-only`).toBe(false);
    }
  });

  it("ships the framework-smoke manifest as a minimal two-stage pipeline", async () => {
    const manifestPath = path.join(bundledPipelinesDir, "framework-smoke.yaml");
    const raw = await readFile(manifestPath, "utf8");
    const manifest = PipelineManifestSchema.parse(parseYaml(raw));

    expect(raw).not.toMatch(/^orchestration:/mu);
    expect(raw).not.toMatch(/^metadata:/mu);
    expect(manifest.slug).toBe("framework-smoke");
    expect(manifest.stages.map((stage) => stage.slug)).toEqual(["research", "script"]);
    expect(manifest.stages.map((stage) => stage.human_approval)).toEqual(["never", "never"]);
    expect(manifest.stages.every((stage) => stage.estimated_cost?.sample.usd === 0)).toBe(true);
    expect(existsSync(path.join(bundledPipelineSkillsDir, "framework-smoke", "executive-producer.md"))).toBe(false);
  });

  it("validates every bundled manifest through PipelineManifestSchema", async () => {
    const manifests = await loadAllBundledManifests();

    expect(manifests.map((manifest) => manifest.slug).sort((left, right) => left.localeCompare(right))).toEqual(
      [...BUNDLED_MANIFEST_INVENTORY_SLUGS].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("ships a manifest for every inventory slug and no extras", async () => {
    const files = await readdir(bundledPipelinesDir);
    const manifestSlugs = files
      .filter((file) => file.endsWith(".yaml"))
      .map((file) => path.basename(file, ".yaml"))
      .sort((left, right) => left.localeCompare(right));

    expect(manifestSlugs).toEqual([...BUNDLED_MANIFEST_INVENTORY_SLUGS].sort((left, right) => left.localeCompare(right)));
  });

  it("ships the hybrid manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("hybrid");
    const hybridSkillsDir = path.join(bundledPipelineSkillsDir, "hybrid");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "hybrid",
      status: "production",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/hybrid/executive-producer.md",
        budget_default_usd: 2,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 12,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(hybridSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(hybridSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(hybridSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the animated-explainer manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("animated-explainer");
    const explainerSkillsDir = path.join(bundledPipelineSkillsDir, "explainer");
    const directorFiles = [
      "idea-director.md",
      "proposal-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "animated-explainer",
      status: "production",
      master_clock: "voiceover",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/explainer/executive-producer.md",
        budget_default_usd: 2,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 20,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "proposal",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(explainerSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(explainerSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(explainerSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the cinematic manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("cinematic");
    const cinematicSkillsDir = path.join(bundledPipelineSkillsDir, "cinematic");
    const directorFiles = [
      "idea-director.md",
      "proposal-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "cinematic",
      status: "production",
      master_clock: "voiceover",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/cinematic/executive-producer.md",
        budget_default_usd: 2,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 20,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "proposal",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "proposal")?.success_criteria).toContain(
      "production_plan.audio_architecture is one of single_narrator, character_dialogue, narrator_plus_characters",
    );
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toEqual([
      "image_selector",
      "video_selector",
      "tts_selector",
      "diagram_gen",
      "subtitle_gen",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "compose")?.required_tools).toEqual([
      "video_compose",
      "audio_mixer",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(cinematicSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(cinematicSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(cinematicSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the animation manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("animation");
    const animationSkillsDir = path.join(bundledPipelineSkillsDir, "animation");
    const directorFiles = [
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "runtime-selector-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "animation",
      status: "production",
      master_clock: "voiceover",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/animation/executive-producer.md",
        budget_default_usd: 2,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 20,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "script",
      "scene_plan",
      "runtime_selection",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.required_skills).toContain("meta/animation-runtime-selector");

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(animationSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(animationSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(animationSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the localization-dub manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("localization-dub");
    const localizationSkillsDir = path.join(bundledPipelineSkillsDir, "localization-dub");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "localization-dub",
      status: "beta",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/localization-dub/executive-producer.md",
        budget_default_usd: 3,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 15,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toContain("heygen_video");

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(localizationSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(localizationSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(localizationSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the talking-head manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("talking-head");
    const talkingHeadSkillsDir = path.join(bundledPipelineSkillsDir, "talking-head");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "talking-head",
      status: "production",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/talking-head/executive-producer.md",
        budget_default_usd: 1.5,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 15,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "script")?.required_artifacts_in).toEqual([
      "brief",
      "source_media_review",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "edit")?.review_focus).toContain(
      "subtitle sync tolerance ±0.3s",
    );
    expect(manifest.stages.find((stage) => stage.slug === "edit")?.review_focus).toContain(
      "silent runtime swap is a CRITICAL governance violation",
    );

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(talkingHeadSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(talkingHeadSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(talkingHeadSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the avatar-spokesperson manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("avatar-spokesperson");
    const avatarSkillsDir = path.join(bundledPipelineSkillsDir, "avatar-spokesperson");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];
    const g1GovernancePhrase =
      "The pivot decision happens at G1 (after IDEA). Do not wait until the ASSETS stage to discover the tool is missing.";

    expect(manifest).toMatchObject({
      slug: "avatar-spokesperson",
      status: "beta",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/avatar-spokesperson/executive-producer.md",
        budget_default_usd: 3,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 18,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "idea")?.tools_available).toEqual([
      "talking_head",
      "lip_sync",
      "heygen_video",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toContain("heygen_video");

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(avatarSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(avatarSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(avatarSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
    await expect(readFile(path.join(avatarSkillsDir, "idea-director.md"), "utf8")).resolves.toContain(
      g1GovernancePhrase,
    );
  });

  it("ships the clip-factory manifest with seven directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("clip-factory");
    const clipFactorySkillsDir = path.join(bundledPipelineSkillsDir, "clip-factory");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "clip-factory",
      status: "production",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/clip-factory/executive-producer.md",
        budget_default_usd: 1.5,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 12,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toEqual([
      "scene_detect",
      "auto_reframe",
      "subtitle_gen",
      "video_selector",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toContain("scene_detect");
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toContain("auto_reframe");

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(clipFactorySkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(clipFactorySkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(clipFactorySkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the podcast-repurpose manifest with seven directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("podcast-repurpose");
    const podcastSkillsDir = path.join(bundledPipelineSkillsDir, "podcast-repurpose");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "podcast-repurpose",
      status: "production",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/podcast-repurpose/executive-producer.md",
        budget_default_usd: 1.5,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 15,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "source_review",
      "idea",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "scene_plan")?.review_focus).toContain(
      "chapter-based segmentation is used for clip windows",
    );
    expect(manifest.stages.find((stage) => stage.slug === "source_review")?.tools_available).toEqual([
      "source_media_review",
      "scene_detect",
      "frame_sampler",
      "transcriber",
      "video_understand",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(podcastSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(podcastSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(podcastSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
    await expect(readFile(path.join(podcastSkillsDir, "scene-director.md"), "utf8")).resolves.toContain(
      "## Chapter-Based Segmentation",
    );
  });

  it("ships the documentary-montage manifest with five directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("documentary-montage");
    const documentarySkillsDir = path.join(bundledPipelineSkillsDir, "documentary-montage");
    const directorFiles = [
      "idea-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "documentary-montage",
      status: "beta",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/documentary-montage/executive-producer.md",
        budget_default_usd: 2,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 18,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "scene_plan",
      "assets",
      "edit",
      "compose",
    ]);
    expect(manifest.stages.map((stage) => stage.slug)).not.toContain("proposal");
    expect(manifest.stages.map((stage) => stage.slug)).not.toContain("script");
    expect(manifest.stages.find((stage) => stage.slug === "scene_plan")?.produces_artifacts).toContain(
      "end_tag_plan",
    );
    expect(manifest.stages.find((stage) => stage.slug === "scene_plan")?.review_focus).toContain(
      "Missing end_tag_plan artifact is critical",
    );
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.tools_available).toEqual([
      "stock_cross_search",
      "stock_video",
      "stock_image",
      "clip_search",
      "clip_embedder",
      "clip_cache",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(documentarySkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(documentarySkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(documentarySkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the character-animation manifest with ten directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("character-animation");
    const characterSkillsDir = path.join(bundledPipelineSkillsDir, "character-animation");
    const directorFiles = [
      "research-director.md",
      "proposal-director.md",
      "script-director.md",
      "character-design-director.md",
      "rig-plan-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "character-animation",
      status: "beta",
      master_clock: "action_timeline",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/character-animation/executive-producer.md",
        budget_default_usd: 3,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 24,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "research",
      "proposal",
      "script",
      "character_design",
      "rig_plan",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "character_design")?.produces_artifacts).toContain(
      "character_design",
    );
    expect(manifest.stages.find((stage) => stage.slug === "rig_plan")?.produces_artifacts).toContain("rig_plan");
    expect(manifest.stages.find((stage) => stage.slug === "scene_plan")?.produces_artifacts).toContain(
      "action_timeline",
    );
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.produces_artifacts).toContain("pose_library");
    expect(manifest.stages.find((stage) => stage.slug === "compose")?.review_focus).toContain(
      "Compose used a runtime not approved in proposal.",
    );

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(characterSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(characterSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(characterSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the music-video manifest with eight directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("music-video");
    const musicVideoSkillsDir = path.join(bundledPipelineSkillsDir, "music-video");
    const directorFiles = [
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "music-video",
      status: "production",
      master_clock: "audio",
      stage_order: "manifest",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/music-video/executive-producer.md",
        budget_default_usd: 5,
        max_revisions_per_stage: 2,
        max_send_backs: 1,
        max_wall_time_minutes: 30,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "cuesheet",
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
    ]);
    expect(manifest.required_skills).toEqual(
      expect.arrayContaining([
        "pipelines/music-video/executive-producer.md",
        "pipelines/_shared/cuesheet-director.md",
        "pipelines/music-video/source-review-director.md",
        "pipelines/music-video/idea-director.md",
        "pipelines/music-video/script-director.md",
        "pipelines/music-video/scene-director.md",
        "pipelines/music-video/asset-director.md",
        "pipelines/music-video/edit-director.md",
        "pipelines/music-video/compose-director.md",
        "meta/announce-and-escalate",
        "core/hyperframes",
        "agents/higgsfield-generate",
      ]),
    );
    expect(manifest.sample).toMatchObject({ duration_s_min: 15, duration_s_max: 20 });
    expect(manifest.stages.find((stage) => stage.slug === "cuesheet")?.audio_sync).toBe("build");
    expect(manifest.stages.find((stage) => stage.slug === "scene_plan")?.audio_sync).toBe("required");

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(musicVideoSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(musicVideoSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(musicVideoSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the news-song manifest with nine directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("news-song");
    const newsSongSkillsDir = path.join(bundledPipelineSkillsDir, "news-song");
    const directorFiles = [
      "cuesheet-director.md",
      "source-review-director.md",
      "idea-director.md",
      "script-director.md",
      "scene-director.md",
      "capture-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "news-song",
      status: "production",
      master_clock: "audio",
      stage_order: "manifest",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/news-song/executive-producer.md",
        budget_default_usd: 5,
        max_revisions_per_stage: 3,
        max_send_backs: 3,
        max_wall_time_minutes: 45,
      },
      sample: {
        duration_s_min: 15,
        duration_s_max: 20,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "cuesheet",
      "source_review",
      "idea",
      "script",
      "scene_plan",
      "capture",
      "assets",
      "edit",
      "compose",
    ]);
    expect(manifest.required_skills).toEqual(
      expect.arrayContaining([
        "pipelines/news-song/executive-producer.md",
        "pipelines/news-song/cuesheet-director.md",
        "pipelines/news-song/capture-director.md",
        "meta/sample-first",
        "core/hyperframes",
        "agents/higgsfield-generate",
        "agents/playwright-recording",
      ]),
    );
    expect(manifest.compatible_playbooks?.recommended).toContain("news-song");
    expect(manifest.compatible_playbooks?.also_works).toEqual(
      expect.arrayContaining(["news-song-protest", "thechaosfm-gta-political"]),
    );
    expect(manifest.metadata).toMatchObject({
      content_modes: {
        "sourced-political-news-song": { requires_sources: true },
        "source-free-protest-music-video": { requires_sources: false },
      },
      reviewer_type_separation_rule:
        "scene_kind: news-screenshot MUST reference assets with provider = playwright_recording; scene_kind: lyric-art MUST reference image-gen tool assets. Mismatch is a critical violation (fake-news protection).",
    });
    expect(manifest.stages.find((stage) => stage.slug === "capture")?.tools_available).toEqual([
      "playwright_recording",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "assets")?.review_focus).toContain(
      "scene_kind: news-screenshot MUST reference assets with provider = playwright_recording; scene_kind: lyric-art MUST reference image-gen tool assets. Mismatch is a critical violation (fake-news protection).",
    );
    expect(manifest.stages.find((stage) => stage.slug === "compose")?.review_focus).toContain(
      "15-20 sec no-caption PS2 sample renders without lyric captions",
    );

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(newsSongSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(newsSongSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(newsSongSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the daily-news manifest with nine directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("daily-news");
    const dailyNewsSkillsDir = path.join(bundledPipelineSkillsDir, "daily-news");
    const directorFiles = [
      "research-director.md",
      "idea-director.md",
      "script-director.md",
      "capture-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];

    expect(manifest).toMatchObject({
      slug: "daily-news",
      status: "beta",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/daily-news/executive-producer.md",
        budget_default_usd: 1.5,
        max_revisions_per_stage: 2,
        max_send_backs: 1,
        max_wall_time_minutes: 20,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "research",
      "capture",
      "script",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "capture")?.tools_available).toEqual([
      "playwright_recording",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "edit")?.review_focus).toContain(
      "silent runtime swap is a CRITICAL governance violation",
    );

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(dailyNewsSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(dailyNewsSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(dailyNewsSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
  });

  it("ships the screen-demo manifest with seven directors plus an executive producer", async () => {
    const manifest = await loadBundledManifest("screen-demo");
    const screenDemoSkillsDir = path.join(bundledPipelineSkillsDir, "screen-demo");
    const directorFiles = [
      "idea-director.md",
      "capture-director.md",
      "scene-director.md",
      "asset-director.md",
      "edit-director.md",
      "compose-director.md",
      "publish-director.md",
    ];
    const modeSelectionRule =
      "Use synthetic_terminal when the demo is a CLI / install flow / terminal workflow. Use real_capture when the demo is a real app UI or requires unpredictable live behavior.";

    expect(manifest).toMatchObject({
      slug: "screen-demo",
      status: "production",
      master_clock: "none",
      orchestration: {
        mode: "executive-producer",
        skill: "pipelines/screen-demo/executive-producer.md",
        budget_default_usd: 1.5,
        max_revisions_per_stage: 3,
        max_send_backs: 2,
        max_wall_time_minutes: 15,
      },
    });
    expect(manifest.stages.map((stage) => stage.slug)).toEqual([
      "idea",
      "capture",
      "scene_plan",
      "assets",
      "edit",
      "compose",
      "publish",
    ]);
    expect(manifest.stages.find((stage) => stage.slug === "capture")?.tools_available).toEqual([
      "playwright_recording",
    ]);

    for (const fileName of directorFiles) {
      expect(existsSync(path.join(screenDemoSkillsDir, fileName)), `${fileName} should exist`).toBe(true);
    }
    expect(existsSync(path.join(screenDemoSkillsDir, "executive-producer.md"))).toBe(true);
    expect(existsSync(path.join(screenDemoSkillsDir, "__fixtures__", "required-strings.yaml"))).toBe(true);
    await expect(readFile(path.join(screenDemoSkillsDir, "idea-director.md"), "utf8")).resolves.toContain(
      modeSelectionRule,
    );
    await expect(readFile(path.join(screenDemoSkillsDir, "scene-director.md"), "utf8")).resolves.toContain(
      "terminal_scene",
    );
  });

  it("resolves every declared pipeline director and executive-producer skill", async () => {
    const manifests = await loadAllBundledManifests();
    const missing: string[] = [];

    for (const manifest of manifests) {
      if (manifest.orchestration.skill) {
        const skillPath = resolvePipelineSkill(manifest.orchestration.skill);
        if (!existsSync(skillPath)) {
          missing.push(`${manifest.slug}.orchestration.skill -> ${manifest.orchestration.skill}`);
        }
      }

      for (const stage of manifest.stages) {
        const skillPath = resolvePipelineSkill(stage.skill);
        if (!existsSync(skillPath)) {
          missing.push(`${manifest.slug}.${stage.slug}.skill -> ${stage.skill}`);
        }
      }

      for (const requiredSkill of manifest.required_skills ?? []) {
        if (!requiredSkill.startsWith("pipelines/")) {
          continue;
        }

        const skillPath = resolvePipelineSkill(requiredSkill);
        if (!existsSync(skillPath)) {
          missing.push(`${manifest.slug}.required_skills -> ${requiredSkill}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("resolves every declared skill from a freshly initialized user project", async () => {
    const projectRoot = await freshInitializedProject();
    const manifests = await loadAllBundledManifests();
    const missing: string[] = [];

    for (const manifest of manifests) {
      for (const skillPath of declaredSkillPaths(manifest)) {
        const resolved = resolveProjectSkill(projectRoot, skillPath);
        if (!existsSync(resolved)) {
          missing.push(`${manifest.slug}: ${skillPath} -> ${resolved}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it("declares complete audit metadata on every bundled stage", async () => {
    const files = await readdir(bundledPipelinesDir);
    const missing: string[] = [];

    for (const file of files.filter((candidate) => candidate.endsWith(".yaml"))) {
      const rawManifest = parseYaml(await readFile(path.join(bundledPipelinesDir, file), "utf8")) as unknown;
      if (!isRecord(rawManifest) || !Array.isArray(rawManifest.stages)) {
        missing.push(`${file}: stages must be an array`);
        continue;
      }

      rawManifest.stages.forEach((stage, index) => {
        if (!isRecord(stage)) {
          missing.push(`${file}: stages[${index}] must be an object`);
          return;
        }

        const stageName = typeof stage.slug === "string" ? stage.slug : `stages[${index}]`;
        for (const field of ["required_artifacts_in", "produces", "review_focus", "success_criteria", "estimated_cost", "human_approval"]) {
          if (!(field in stage)) {
            missing.push(`${file}.${stageName}: missing ${field}`);
          }
        }

        if (!Array.isArray(stage.required_artifacts_in)) {
          missing.push(`${file}.${stageName}: required_artifacts_in must be explicit array`);
        }
        if (typeof stage.produces !== "string" || stage.produces.length === 0) {
          missing.push(`${file}.${stageName}: produces must be non-empty`);
        }
        if (!Array.isArray(stage.review_focus) || stage.review_focus.length === 0) {
          missing.push(`${file}.${stageName}: review_focus must be non-empty`);
        }
        if (!Array.isArray(stage.success_criteria) || stage.success_criteria.length === 0) {
          missing.push(`${file}.${stageName}: success_criteria must be non-empty`);
        }
        if (!hasEstimatedCost(stage.estimated_cost)) {
          missing.push(`${file}.${stageName}: estimated_cost must include sample.usd and full.usd`);
        }
        if (!["required", "optional", "never"].includes(String(stage.human_approval))) {
          missing.push(`${file}.${stageName}: human_approval must be explicit`);
        }
      });
    }

    expect(missing).toEqual([]);
  });

  it("ships a required-string fixture for every pipeline skill set", async () => {
    const missing: string[] = [];

    for (const slug of BUNDLED_MANIFEST_INVENTORY_SLUGS) {
      const fixturePath = path.join(bundledPipelineSkillsDir, slug, "__fixtures__", "required-strings.yaml");
      if (!existsSync(fixturePath)) {
        missing.push(`${slug}: ${fixturePath}`);
      }
    }

    expect(missing).toEqual([]);
  });

  it("keeps bundled pipeline directors predit-native", async () => {
    const files = await markdownFiles(bundledPipelineSkillsDir);
    const banned = [
      { label: ".migration", pattern: /\.migration/u },
      { label: "OpenMontage", pattern: /openmontage/iu },
      { label: "predit-showcase", pattern: /predit-showcase/u },
      { label: "harness worktree path", pattern: /\.worktrees\/issue-\d+/u },
      { label: "absolute harness path", pattern: /\/Users\/bradtaylor\/Documents\/GitHub\/predit/u },
    ];
    const violations: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      for (const { label, pattern } of banned) {
        if (pattern.test(content)) {
          violations.push(`${path.relative(bundledRootDir, file)} contains ${label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("resolves every declared tool name through the registry after alias resolution", async () => {
    const manifests = await loadAllBundledManifests();
    const registry = new Registry();
    await registry.discover();
    const unresolved: string[] = [];

    for (const manifest of manifests) {
      for (const stage of manifest.stages) {
        const toolFields = {
          required_tools: stage.required_tools,
          optional_tools: stage.optional_tools,
          tools_available: stage.tools_available,
        };

        for (const [field, toolNames] of Object.entries(toolFields)) {
          for (const toolName of toolNames) {
            if (!registry.get(toolName)) {
              unresolved.push(`${manifest.slug}.${stage.slug}.${field}: ${toolName}`);
            }
          }
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("ships JSON schemas for every artifact produced by bundled pipeline manifests", async () => {
    const manifests = await loadAllBundledManifests();
    const missing: string[] = [];

    for (const manifest of manifests) {
      for (const stage of manifest.stages) {
        const artifacts = new Set([stage.produces, ...stage.produces_artifacts]);

        for (const artifact of artifacts) {
          if (!existsSync(path.join(bundledArtifactSchemasDir, `${artifact}.schema.json`))) {
            missing.push(`${manifest.slug}.${stage.slug}: ${artifact}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });
});

async function loadBundledManifest(slug: string) {
  const raw = await readFile(path.join(bundledPipelinesDir, `${slug}.yaml`), "utf8");
  return PipelineManifestSchema.parse(parseYaml(raw));
}

async function loadAllBundledManifests() {
  const files = await readdir(bundledPipelinesDir);
  return Promise.all(
    files
      .filter((file) => file.endsWith(".yaml"))
      .sort((left, right) => left.localeCompare(right))
      .map((file) => loadBundledManifest(path.basename(file, ".yaml"))),
  );
}

function resolvePipelineSkill(skillPath: string): string {
  const normalized = skillPath.endsWith(".md") ? skillPath : `${skillPath}.md`;
  const relative = normalized.startsWith("pipelines/") ? normalized.slice("pipelines/".length) : normalized;
  return path.join(bundledPipelineSkillsDir, relative);
}

function declaredSkillPaths(manifest: PipelineManifest): string[] {
  return [
    ...(manifest.orchestration.skill ? [manifest.orchestration.skill] : []),
    ...manifest.stages.map((stage) => stage.skill),
    ...(manifest.required_skills ?? []),
  ];
}

function resolveProjectSkill(projectRoot: string, skillPath: string): string {
  const normalized = skillPath.endsWith(".md") ? skillPath : `${skillPath}.md`;

  if (normalized.startsWith("pipelines/")) {
    return path.join(projectRoot, ".predit", "skills", normalized);
  }

  if (normalized.startsWith("meta/")) {
    return path.join(projectRoot, ".predit", "skills", normalized);
  }

  return path.join(projectRoot, ".predit", "skills", normalized);
}

async function freshInitializedProject(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "predit-bundled-pipelines-"));
  scratchDirs.push(projectRoot);
  const io = {
    stdout: { write: () => true },
    stderr: { write: () => true },
  };

  await createInitHandler(io, {
    bundledRoot: () => bundledRootDir,
    copyBundledInto: (target) => copyBundledInto(target, bundledRootDir),
    computeBundledChecksum: () => computeBundledChecksum(bundledRootDir),
    cwd: () => projectRoot,
    now: () => new Date("2026-05-14T12:00:00.000Z"),
    setupRuntimes: async () => undefined,
  })(command({ setupRuntimes: false }));

  return projectRoot;
}

function command(options: Record<string, unknown>): Command {
  return {
    optsWithGlobals: () => options,
  } as unknown as Command;
}

function hasEstimatedCost(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.sample) || !isRecord(value.full)) {
    return false;
  }

  return typeof value.sample.usd === "number" && typeof value.full.usd === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        return entry.name === "__fixtures__" ? [] : markdownFiles(entryPath);
      }

      return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
    }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}
