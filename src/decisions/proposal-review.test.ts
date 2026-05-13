import { describe, expect, it } from "vitest";
import type { DecisionLog } from "../artifacts/decision-log.js";
import { reviewProposalForMusicSource } from "./proposal-review.js";

function musicSourceDecision(id = "music-source-1"): DecisionLog[number] {
  return {
    id,
    stage: "proposal",
    timestamp: "2026-05-12T15:18:42Z",
    category: "music_source",
    options_considered: [
      { label: "music_library/theme.mp3", rejected_because: null, notes: null },
      { label: "pixabay_music", rejected_because: "not needed after user-provided track matched mood", notes: null },
    ],
    picked: "music_library/theme.mp3",
    reason: "User-provided theme matches the requested mood and gives the episode a licensed source.",
    confidence: 0.82,
    user_visible: true,
    supersedes: null,
  };
}

describe("reviewProposalForMusicSource", () => {
  it("flags audio master-clock proposals without music_source as critical", () => {
    expect(reviewProposalForMusicSource({ manifest: { master_clock: "audio" }, decisions: [] })).toEqual([
      expect.objectContaining({
        severity: "critical",
        title: "Missing music_source decision for audio-led pipeline",
        proposed_fix: expect.stringContaining("bundled/skills/meta/music-plan.md"),
      }),
    ]);
  });

  it("flags voiceover master-clock proposals without music_source as critical", () => {
    expect(reviewProposalForMusicSource({ manifest: { master_clock: "voiceover" }, decisions: [] })).toHaveLength(1);
  });

  it("passes audio master-clock proposals with an active music_source decision", () => {
    expect(reviewProposalForMusicSource({ manifest: { master_clock: "audio" }, decisions: [musicSourceDecision()] })).toEqual([]);
  });

  it("passes non-audio-led proposals without music_source", () => {
    expect(reviewProposalForMusicSource({ manifest: { master_clock: "none" }, decisions: [] })).toEqual([]);
  });

  it("treats superseded music_source decisions as missing", () => {
    const decisions: DecisionLog = [
      musicSourceDecision("old-music-source"),
      {
        id: "new-runtime",
        stage: "proposal",
        timestamp: "2026-05-12T15:20:42Z",
        category: "render_runtime_selection",
        options_considered: [
          { label: "remotion", rejected_because: null, notes: null },
          { label: "hyperframes", rejected_because: "not configured", notes: null },
        ],
        picked: "remotion",
        reason: "Remotion is configured and fits this proposal.",
        confidence: 0.7,
        user_visible: true,
        supersedes: "old-music-source",
      },
    ];

    expect(reviewProposalForMusicSource({ manifest: { master_clock: "audio" }, decisions })).toHaveLength(1);
  });
});
