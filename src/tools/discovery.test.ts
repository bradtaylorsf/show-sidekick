import { describe, expect, it } from "vitest";
import { Registry } from "../registry/index.js";

describe("tool discovery", () => {
  it("discovers analysis probe and sampler tools", async () => {
    const registry = new Registry();

    await registry.discover();

    expect(registry.get("audio_energy")?.capability).toBe("audio_energy");
    expect(registry.get("frame_sampler")?.capability).toBe("frame_sampling");
    expect(registry.get("scene_detector")?.capability).toBe("scene_detection");
    expect(registry.get("face_tracker")?.capability).toBe("face_tracking");
    expect(registry.get("transcriber")?.capability).toBe("transcriber");
    expect(registry.get("transcript_fetcher")?.capability).toBe("transcript_fetch");
    expect(registry.get("clip_embedder")?.capability).toBe("clip_embedding");
    expect(registry.get("corpus_builder")?.capability).toBe("corpus_index");
    expect(registry.get("video_analyzer")?.capability).toBe("video_analysis");
    expect(registry.get("video_understand")?.capability).toBe("video_understanding");
    expect(registry.get("video_downloader")?.capability).toBe("video_download");
    expect(registry.get("source_media_review")?.capability).toBe("source_media_review");
    expect(registry.get("visual_qa")?.capability).toBe("visual_qa");
    expect(registry.get("composition_validator")?.capability).toBe("composition_validation");
    expect(registry.get("lip_sync")?.capability).toBe("lip_sync");
    expect(registry.get("talking_head")?.capability).toBe("talking_head");
    expect(registry.get("heygen_video")?.capability).toBe("avatar_video");
    expect(registry.get("bg_remove")?.capability).toBe("bg_remove");
    expect(registry.get("color_grade")?.capability).toBe("color_grade");
    expect(registry.get("eye_enhance")?.capability).toBe("eye_enhance");
    expect(registry.get("face_enhance")?.capability).toBe("face_enhance");
    expect(registry.get("face_restore")?.capability).toBe("face_restore");
    expect(registry.get("upscale")?.capability).toBe("upscale");
    expect(registry.get("character_animation")?.capability).toBe("character_animation");
  });
});
