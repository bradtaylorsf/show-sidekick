import { describe, expect, it } from "vitest";
import clipEmbedder, { CLIP_MODEL_ID, parseClipEmbeddingJson } from "./clip-embedder.js";

describe("clip_embedder", () => {
  it("registers the clip embedding capability", () => {
    expect(clipEmbedder.name).toBe("clip_embedder");
    expect(clipEmbedder.capability).toBe("clip_embedding");
    expect(clipEmbedder.integration).toMatchObject({ kind: "binary", binary: "python3" });
  });

  it("parses deterministic embedding JSON", () => {
    const parsed = parseClipEmbeddingJson(JSON.stringify({ dim: 3, vector: [0.1, 0.2, 0.3], model_id: CLIP_MODEL_ID }));

    expect(clipEmbedder.output.parse(parsed)).toEqual({
      dim: 3,
      vector: [0.1, 0.2, 0.3],
      model_id: CLIP_MODEL_ID,
    });
  });

  it("accepts text and frame embedding inputs", () => {
    expect(clipEmbedder.input.parse({ text: "quiet forest", modality: "text" }).modality).toBe("text");
    expect(clipEmbedder.input.parse({ path: "frame.png", modality: "frame" }).path).toBe("frame.png");
    expect(() => clipEmbedder.input.parse({ modality: "text" })).toThrow(/requires text/);
  });
});
