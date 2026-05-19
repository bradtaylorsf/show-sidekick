---
name: "music-video-executive-producer"
description: "Orchestrate RAG Shelf Sprint style music-video production with locked audio timing, sample-first governance, and reference-aware visual patterns."
applies_to: "pipelines/music-video"
role: "executive-producer"
---
# Executive Producer - Music Video Pipeline

## When To Use

You are the EP for audio-led vertical music videos, especially Brad's RAG Shelf Sprint style: beat-driven, concept-tagged, lyric-timed, visually benchmarked, and governed by sample-first cost control.

## Pipeline state machine

```yaml
state:
  pipeline: music-video
  skill_directory: music-video
  master_clock: audio
  canvas: "1080×1920 vertical (9:16)"
  max_scene_duration: "5.0 seconds"
  locked_decisions:
    track: null
    lyrics: null
    whisper_model: "medium.en"
    whisper_retry_model: "large-v3"
    visual_benchmark: "Brad's reference music-video"
    runtime: hyperframes
    sample_first: null
    section_accent_colors: {}
  stages:
    cuesheet: pending
    source_review: pending
    idea: pending
    script: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
```

## Mandatory locked decisions

- Canvas is `1080×1920 vertical (9:16)`.
- Maximum scene duration is `5.0 seconds`.
- Whisper default is `medium.en`; retry with `large-v3` when timing confidence is too low for caption sync.
- Sample-first is not optional for any production estimated > $0.50 or > 15 min.
- Kling cost assumptions are `$0.30/clip`.
- White-flash transition timing is `0.06s in / 0.18s out` at `0.65 opacity`.
- Bottom mask dimensions are `220px solid + 180px gradient`.
- Top mask dimensions are `110px solid + 90px gradient`.
- Beat-drop hype tag placement is `1.5-2 sec` before first vocal.
- Runtime changes require approval; silent runtime swap is a CRITICAL governance violation.

## Validated patterns from named productions

These are validated RAG Shelf Sprint patterns and should be treated as defaults unless the user explicitly changes the visual benchmark.

### Per-section accent color

Per-section accent color — one color per character/concept.

### Beat-drop hype tags between sections — name them after the actual concept (RAG, AGENTIC SEARCH, GRAPH DB), NOT generic VERSE 1/2/3

Beat-drop hype tags between sections — name them after the actual concept (RAG, AGENTIC SEARCH, GRAPH DB), NOT generic VERSE 1/2/3.

### White-flash transitions at major beat drops

White-flash transitions at major beat drops. Use `0.06s in / 0.18s out` and `0.65 opacity` as the default unless the beat grid demands a documented adjustment.

### Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale

Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale.

### Bottom mask + top mask to hide Imagen text-rendering artifacts

Bottom mask + top mask to hide Imagen text-rendering artifacts. Use `220px solid + 180px gradient` at the bottom and `110px solid + 90px gradient` at the top.

### HyperFrames intro animation > Higgsfield text-to-video for opening title cards

HyperFrames intro animation > Higgsfield text-to-video for opening title cards.

### Higgsfield image-to-video for hero scene animations only

Higgsfield image-to-video for hero scene animations only. Use generated image plates first, then animate only the scenes whose motion materially improves the beat.

## When to stop and check with the human

Stop when:

- Any paid or time-heavy production is estimated above `$0.50` or `15 min`; Sample-first is not optional for any production estimated > $0.50 or > 15 min.
- Transcription confidence makes lyric timing unreliable after `medium.en`; retry with `large-v3` before scene or caption timing.
- A runtime, provider, model, canvas, scene duration cap, or visual benchmark would change.
- A title card would require Higgsfield text-to-video instead of HyperFrames intro animation.
- Caption timing would be guessed from lyric structure. NEVER guess timing from lyric structure alone — the whisper word timestamps drive caption timing.
- The render path changes without logged approval; silent runtime swap is a CRITICAL governance violation.

## Reference materials

- `.show-sidekick/skills/meta/announce-and-escalate.md`
- `.show-sidekick/skills/meta/reviewer.md`
- `.show-sidekick/skills/core/hyperframes.md`
- `.show-sidekick/skills/agents/higgsfield-generate.md`

## Output Contract

Maintain a decision log with track, lyrics, whisper model, retry model, sample-first decision, visual benchmark, per-section accent colors, provider/model choices, Kling cost assumptions, runtime lock, white-flash timing, mask dimensions, hype-tag timing, and any human-approved changes.
