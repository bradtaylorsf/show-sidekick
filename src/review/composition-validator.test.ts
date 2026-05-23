import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-validator.js";

describe("validateComposition", () => {
  it("flags leading gaps, interior gaps, and missing tail coverage", () => {
    const findings = validateComposition(
      {
        cuts: [
          { start_s: 1, end_s: 3, asset_id: "a" },
          { start_s: 4, end_s: 7, asset_id: "b" },
        ],
      },
      10,
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition has a leading gap",
        patch: expect.objectContaining({ artifact_path: "cuts[0].start_s", new_value: 0 }),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition has a gap between cuts",
        patch: expect.objectContaining({ artifact_path: "cuts[0].end_s", new_value: 4 }),
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Composition does not cover full planned duration",
        patch: expect.objectContaining({ artifact_path: "cuts[1].end_s", new_value: 10 }),
      }),
    );
  });

  it("flags overlapping cuts as suggestions", () => {
    const findings = validateComposition(
      {
        cuts: [
          { start_s: 0, end_s: 4, asset_id: "a" },
          { start_s: 3.5, end_s: 8, asset_id: "b" },
        ],
      },
      8,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        severity: "suggestion",
        title: "Composition has overlapping cuts",
      }),
    ]);
  });

  it("requires narrated presentation-demo sections to map to deck slides", () => {
    const findings = validateComposition(
      {
        cuts: [{ start_s: 0, end_s: 4, asset_id: "support-card" }],
      },
      4,
      {
        pipelineSlug: "presentation-demo",
        deckManifest: deckManifest(),
        script: {
          sections: [{ slug: "intro", start_s: 0, end_s: 4, narration: "Explain the opening slide." }],
        },
      },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Narrated section is not mapped to a slide",
      }),
    );
  });

  it("passes presentation-demo slide mapping, narration audio, and caption checks when artifacts are present", () => {
    const findings = validateComposition(
      {
        cuts: [{ start_s: 0, end_s: 4, asset_id: "slide-1", slide_id: "slide-1" }],
        subtitles: { enabled: true, source: "captions/words.json" },
      },
      4,
      {
        pipelineSlug: "presentation-demo",
        deckManifest: deckManifest(),
        script: {
          sections: [{ slug: "intro", start_s: 0, end_s: 4, narration: "Explain the opening slide." }],
        },
        cuesheet: {
          audio: { path: "audio/narration.wav", duration_s: 4, sample_rate: 48_000, channels: 1 },
          master_clock: "voiceover",
          words: [{ text: "Explain", start_s: 0, end_s: 0.3, confidence: 1 }],
          segments: [{ start_s: 0, end_s: 4, text: "Explain", words: [{ text: "Explain", start_s: 0, end_s: 0.3, confidence: 1 }] }],
          sections: [{ label: "voiceover", start_s: 0, end_s: 4, kind: "vocal", energy: 0.8 }],
          beats: [],
          climax: [],
          scene_anchors: [],
        },
        requireCaptions: true,
        requireNarrationAudio: true,
      },
    );

    expect(findings).toEqual([]);
  });
});

function deckManifest() {
  return {
    source: { kind: "pdf" as const, path: "inputs/deck.pdf" },
    slide_count: 1,
    slides: [{ id: "slide-1", index: 0, screenshot_path: "slides/slide-1.png" }],
    notes: [],
  };
}
