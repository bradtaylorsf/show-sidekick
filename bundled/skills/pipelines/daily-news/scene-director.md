---
name: "daily-news-scene-director"
description: "Map narration and real screenshots into a broadcast-style timeline."
applies_to: "pipelines/daily-news"
stage: "scene_plan"
produces: "scene_plan"
---
# Daily-News — Scene Director

Sequence the screenshots + narration into the episode timeline. This is mostly
a mechanical mapping — the variation came in the script + screenshots.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Prior artifacts | `priorArtifacts.script`, `priorArtifacts.capture`, `priorArtifacts.idea` | Narration, real screenshots, and show settings |
| Playbook | `bundled/playbooks/news-broadcast.yaml` | Lower-third, palette, and pacing defaults |

If `capture_manifest` contains paywall, cookie banner, geo-block, or page-error
flags, carry those flags into scene notes so compose can crop, disclose, or
route the story back before render.

## Episode structure

```
intro_card (5 sec)
  → episode date + topic scope + show title
story_1 (35-50 sec)
  → screenshot full-frame, lower-third banner slides up at 0.5s
story_2 (35-50 sec)
  → hard cut, same pattern
...
outro_card (5 sec)
  → "see you tomorrow" + clock + date
```

## Per-scene composition spec

```yaml
scenes:
  - id: intro
    type: title-card
    start: 0
    end: 5
    elements:
      - type: text
        text: "<formatted episode date>"
        position: top-third
      - type: text
        text: "<topic_scope>"
        position: middle
      - type: text
        text: "<show title>"
        position: bottom-third

  - id: story-001
    type: story
    start: 5
    end: 45
    elements:
      - type: screenshot
        src: assets/screenshots/hl-001.jpg
        fit: cover
        anchor: top              # show above-the-fold; crop bottom if needed
      - type: lower-third
        publisher: "TechCrunch"
        headline: "<short headline>"
        date: "May 8"
        slide_up_at: 5.5         # 0.5s after scene cut
        slide_down_at: 44.5      # 0.5s before next scene cut
      - type: narration-track
        audio: assets/audio/narration-001.mp3
        start: 6.5               # 1.5s after scene cut (let viewer read first)
        duck_music_to_db: -8

  - id: story-002
    ...

  - id: outro
    type: title-card
    start: <total - 5>
    end: <total>
    elements:
      - type: text
        text: "Same time tomorrow."
        position: middle
      - type: text
        text: "<show title>"
        position: bottom-third
```

## Lower-third banner spec

Identical across every story scene. From `news-broadcast.yaml` playbook:

- Slides up from bottom over 0.3 sec, ease-out
- Red `#D72831` source-attribution tab on the left (publisher name)
- Dark navy `#1A1F2E` headline panel right of the tab (headline + date)
- White `#FFFFFF` text, Inter font weights per playbook
- Stays visible for the entire scene minus 0.5s on each side (slides down
  before next cut)

## Logo + clock fixed elements

Top-right corner across the entire episode (excluding title cards):
- Show logo (use a simple text mark if no logo asset exists)
- Current time clock — display the captured-at time, NOT live-updating

## Music bed timing

If `brief.include_music_bed`:
- Music plays at full volume (which is already low — `music_volume: 0.05`
  per playbook = effectively background bed)
- Ducks to -8dB whenever a narration track is playing
- Returns to full volume in scene transitions and during silent screenshot
  reads

This is auto-proceed (no human checkpoint).
