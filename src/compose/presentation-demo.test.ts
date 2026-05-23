import { describe, expect, it } from "vitest";
import { buildPresentationDemoComposition } from "./presentation-demo.js";

describe("buildPresentationDemoComposition", () => {
  it("maps deck slides, narration, captions, callouts, highlights, and timing into runtime props", () => {
    const composition = buildPresentationDemoComposition({
      runtime: "remotion",
      deck_manifest: deckManifest(),
      edit_decisions: {
        cuts: [
          {
            start_s: 0,
            end_s: 2,
            asset_id: "slide-1",
            slide_id: "slide-1",
            timing_anchor: "intro",
            treatment: {
              scene_type: "slide_image",
              motion: { kind: "zoom_pan", start_zoom: 1, end_zoom: 1.08, pan_x: -0.02, pan_y: 0 },
              highlights: [{ rect: { x: 0.48, y: 0.24, width: 0.3, height: 0.16 }, label: "Proof", tone: "success" }],
              callouts: [{ text: "Point the viewer at the proof metric.", position: "bottom-right" }],
            },
          },
          {
            start_s: 2,
            end_s: 4,
            asset_id: "slide-2",
            slide_id: "slide-2",
            timing_anchor: "demo",
            treatment: {
              scene_type: "support_visual",
              motion: { kind: "support_visual", start_zoom: 1, end_zoom: 1.04 },
              caption: { text: "Now show the motion-led demo path." },
              support_visuals: [{ kind: "diagram", label: "Rough cut package" }],
            },
          },
        ],
        overlays: [],
        subtitles: { enabled: true, source: "captions/words.json" },
        render_runtime: "remotion",
        renderer_family: "presentation-demo",
      },
      script: {
        sections: [
          { slug: "intro", start_s: 0, end_s: 2, narration: "Decks already contain the story." },
          { slug: "demo", start_s: 2, end_s: 4, narration: "Motion turns the deck into a demo." },
        ],
      },
      cuesheet: cuesheet(),
      fps: 30,
    });

    expect(composition).toMatchObject({
      runtime: "remotion",
      duration_s: 4,
      expected_duration_s: 4,
      fps: 30,
      audio: { path: "audio/narration.wav", duration_s: 4 },
      captions: { source: "captions/words.json" },
    });
    expect(composition.scenes).toEqual([
      expect.objectContaining({
        id: "intro",
        slide_id: "slide-1",
        image_path: "slides/slide-1.png",
        start_frame: 0,
        duration_frames: 60,
        narration: "Decks already contain the story.",
        motion: expect.objectContaining({ kind: "zoom_pan" }),
        highlights: [expect.objectContaining({ label: "Proof" })],
        callouts: [expect.objectContaining({ text: "Point the viewer at the proof metric." })],
      }),
      expect.objectContaining({
        id: "demo",
        scene_type: "support_visual",
        slide_id: "slide-2",
        support_visuals: [expect.objectContaining({ label: "Rough cut package" })],
        caption: expect.objectContaining({ text: "Now show the motion-led demo path." }),
      }),
    ]);
  });

  it("refuses silent runtime swaps", () => {
    expect(() =>
      buildPresentationDemoComposition({
        runtime: "hyperframes",
        deck_manifest: deckManifest(),
        edit_decisions: {
          cuts: [{ start_s: 0, end_s: 2, asset_id: "slide-1", slide_id: "slide-1" }],
          overlays: [],
          render_runtime: "remotion",
          renderer_family: "presentation-demo",
        },
      }),
    ).toThrow("would silently swap");
  });
});

function deckManifest() {
  return {
    source: { kind: "pdf" as const, path: "inputs/deck.pdf" },
    slide_count: 2,
    slides: [
      { id: "slide-1", index: 0, screenshot_path: "slides/slide-1.png", title: "Problem" },
      { id: "slide-2", index: 1, screenshot_path: "slides/slide-2.png", title: "Demo" },
    ],
  };
}

function cuesheet() {
  return {
    audio: {
      path: "audio/narration.wav",
      duration_s: 4,
      sample_rate: 48_000,
      channels: 1,
    },
    master_clock: "voiceover" as const,
    words: [{ text: "Decks", start_s: 0, end_s: 0.4, confidence: 1 }],
    segments: [{ start_s: 0, end_s: 4, text: "Decks", words: [{ text: "Decks", start_s: 0, end_s: 0.4, confidence: 1 }] }],
    sections: [{ label: "voiceover", start_s: 0, end_s: 4, kind: "vocal" as const, energy: 0.8 }],
    beats: [],
    climax: [],
    scene_anchors: [],
  };
}
