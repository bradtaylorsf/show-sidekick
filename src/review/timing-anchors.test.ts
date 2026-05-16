import { describe, expect, it } from "vitest";
import { runReview } from "./runner.js";
import { checkTimingAnchors } from "./timing-anchors.js";

describe("checkTimingAnchors", () => {
  it("flags audio-led scenes missing timing anchors when lyric timing is available", () => {
    const findings = checkTimingAnchors(
      "scene_plan",
      { scenes: [{ slug: "scene-1", start_s: 0, end_s: 2 }] },
      {
        audioLed: true,
        lyricsAligned: {
          source: "transcript_words",
          lines: [{ id: "line-1", start_s: 0, end_s: 2 }],
        },
      },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Timing anchor missing",
        location: "scenes[0]",
      }),
    );
  });

  it("flags cut boundaries that fall inside a word span", () => {
    const findings = checkTimingAnchors(
      "edit",
      {
        cuts: [
          {
            start_s: 0,
            end_s: 0.25,
            timing_anchor: "line-1",
            timing_source: "lyric",
            asset_id: "hero",
          },
        ],
      },
      {
        audioLed: true,
        cuesheet: {
          words: [{ text: "Hello", start_s: 0, end_s: 0.5, confidence: 1 }],
          segments: [],
        },
      },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Cut falls inside word timing",
        location: "cuts[0].end_s",
      }),
    );
  });

  it("flags audio-led scenes that exceed the provider clip duration cap", () => {
    const findings = checkTimingAnchors(
      "scene_plan",
      {
        scenes: [
          {
            slug: "scene-1",
            start_s: 0,
            end_s: 5.5,
            timing_anchor: "line-1",
            timing_source: "lyric",
          },
        ],
      },
      {
        audioLed: true,
        maxSceneDurationS: 5,
        lyricsAligned: {
          source: "transcript_words",
          lines: [{ id: "line-1", start_s: 0, end_s: 5.5 }],
        },
      },
    );

    expect(findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Scene exceeds audio timing duration cap",
        location: "scenes[0].end_s",
      }),
    );
  });

  it("is wired into runReview for music-led scene plans", () => {
    const review = runReview(
      "scene_plan",
      { scenes: [{ slug: "scene-1", start_s: 0, end_s: 2 }] },
      {
        pipeline: {
          master_clock: "audio",
          stages: [
            {
              slug: "scene_plan",
              skill: "skills/pipelines/test/scene-director.md",
              produces: "scene_plan",
              review_focus: [],
              success_criteria: [],
              tools_available: [],
              human_approval: "optional",
            },
          ],
        },
        lyricsAligned: {
          source: "transcript_words",
          lines: [{ id: "line-1", start_s: 0, end_s: 2 }],
        },
      },
    );

    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Timing anchor missing",
        location: "scenes[0]",
      }),
    );
  });

  it("uses pipeline max_scene_duration_s when runReview checks music-led scene plans", () => {
    const review = runReview(
      "scene_plan",
      {
        scenes: [
          {
            slug: "scene-1",
            start_s: 0,
            end_s: 4,
            timing_anchor: "line-1",
            timing_source: "lyric",
          },
        ],
      },
      {
        pipeline: {
          master_clock: "audio",
          defaults: { max_scene_duration_s: 3 },
          stages: [
            {
              slug: "scene_plan",
              skill: "skills/pipelines/test/scene-director.md",
              produces: "scene_plan",
              review_focus: [],
              success_criteria: [],
              tools_available: [],
              human_approval: "optional",
            },
          ],
        },
        lyricsAligned: {
          source: "transcript_words",
          lines: [{ id: "line-1", start_s: 0, end_s: 4 }],
        },
      },
    );

    expect(review.findings).toContainEqual(
      expect.objectContaining({
        severity: "critical",
        title: "Scene exceeds audio timing duration cap",
        location: "scenes[0].end_s",
      }),
    );
  });
});
