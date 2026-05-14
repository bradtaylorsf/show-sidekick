---
name: "daily-news-edit-director"
description: "Lock lower-third timing, audio ducking, and render runtime for the roundup."
applies_to: "pipelines/daily-news"
stage: "edit"
produces: "edit_decisions"
---
# Daily-News — Edit Director

Translate scene_plan + asset_manifest into a composition spec.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Prior artifacts | `priorArtifacts.idea`, `priorArtifacts.scene_plan`, `priorArtifacts.assets`, `priorArtifacts.capture` | Locked runtime, timeline, audio, and screenshots |
| Runtime contract | `specs/15-announce-and-escalate.md` | Escalation path for blocked runtime |

## Recommended runtime: Remotion

For news-broadcast pipeline, **Remotion is the recommended runtime** because:

- The lower-third banner / title-card / chrome stack maps cleanly to React
  components
- Word-level captions aren't needed (this is narration-led, not lyric-led)
- Audio ducking + multi-track audio is well-supported
- The `text_card`, `stat_card`, and other primitives in `remotion-composer/`
  cover the chrome elements out of the box

HyperFrames also works, but offers no advantage here. Use the `render_runtime`
already locked in the brief. silent runtime swap is a CRITICAL governance violation.
If the locked runtime is unavailable, stop and escalate instead of quietly
substituting another renderer.

## Per-scene cuts

Hard cuts between stories — no soft transitions in news-broadcast style.

## Lower-third timing

For each story scene:
- Scene cut at T
- Lower-third slides up: T + 0.3 (so the cut feels like the trigger)
- Lower-third fully visible by: T + 0.6
- Stays visible until: scene_end - 0.5
- Slides down by: scene_end - 0.2 (before the next cut)

## Audio mixing

```yaml
audio_tracks:
  - id: narration
    layers:
      - {start: 0, end: 5, src: intro.mp3, volume: 1.0}
      - {start: 6.5, end: 38.5, src: narration-001.mp3, volume: 1.0}
      - {start: 50.5, end: 82.5, src: narration-002.mp3, volume: 1.0}
      ...
  - id: music_bed
    src: news-bed.mp3
    volume: 0.05                    # full bed volume per playbook
    ducking:
      threshold_db: -8
      target_track: narration       # any audio in narration track triggers duck
      attack_ms: 200
      release_ms: 400
```

## edit_decisions artifact

```yaml
render_runtime: remotion
canvas:
  width: 1080
  height: 1920
  fps: 30
  duration_seconds: <total>

scenes: [...]                       # from scene_plan, lifted as-is
audio_tracks: [...]                 # as above
chrome:
  show_logo: true
  show_clock: true
  clock_time_str: "<captured_at formatted>"
```

Auto-proceeds; agent self-reviews before composing.
