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
  });
});
