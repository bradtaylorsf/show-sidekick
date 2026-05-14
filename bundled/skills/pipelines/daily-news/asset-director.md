---
name: "daily-news-asset-director"
description: "Generate consistent TTS narration and optional newsroom audio beds."
applies_to: "pipelines/daily-news"
stage: "assets"
produces: "asset_manifest"
---
# Daily-News — Asset Director

Generate the TTS narration. That's it — screenshots already exist from the
capture stage; no Imagen / Kling / music gen for this pipeline.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Prior artifacts | `priorArtifacts.script`, `priorArtifacts.scene_plan`, `priorArtifacts.capture` | Narration text, timing plan, and real screenshots |
| Tools | `tts_selector`, `audio_enhance`, `audio_mixer` | Narration generation, loudness normalization, and optional bed mix |

## Per script block, generate one TTS audio file

For `script.intro`, each `script.stories[i].narration`, and `script.outro`:

1. Call `tts_selector` with:
   ```python
   {
     "text": <narration_text>,
     "voice_id": brief.tts_voice_id,
     "preferred_provider": "elevenlabs",      # newsreader cadence quality
     "voice_settings": {
       "stability": 0.65,                     # mid-high — consistent newsreader feel
       "similarity_boost": 0.5,               # mid — natural variation
       "style": 0.0,                          # flat affect — no overemoting
       "use_speaker_boost": True
     },
     "output_path": "projects/daily-news/<date>/assets/audio/narration-<id>.mp3"
   }
   ```
2. Verify the audio duration with `ffprobe` or the audio metadata returned by
   the TTS/audio tool — check actual duration matches
   estimated_duration within 20% (TTS pacing varies). Adjust scene_plan
   timings if duration drifted significantly.
3. Normalize all narration tracks to broadcast loudness via `audio_enhance`
   (`-16 LUFS` integrated, true-peak `-1 dBTP`).

## Music bed (optional)

If `brief.include_music_bed: true`, find or generate a low-volume newsroom
bed:
- Check `music_library/news-bed/` for an existing track
- If none, optionally use `music_gen` with prompt "subtle newsroom electronic
  pad, low-key ticking pulse, no melody, ambient bed for newsreader to talk
  over, 5 minutes"
- Loop or trim to episode duration

## asset_manifest artifact

```yaml
audio:
  intro: assets/audio/narration-intro.mp3
  stories:
    - story_id: hl-001
      narration_path: assets/audio/narration-001.mp3
      duration_seconds: 32.5
      voice_id: <elevenlabs voice id>
      tts_provider: elevenlabs
      cost_usd: 0.18
    ...
  outro: assets/audio/narration-outro.mp3
  music_bed: assets/audio/news-bed.mp3        # or null
total_cost_usd: <sum>
```

## Cost expectation

ElevenLabs pricing is roughly $0.18/min of generated audio. A 5-min episode
with ~3-4 min of total narration runs ~$0.55-0.75. Plus a music bed if
generated (ElevenLabs Music: $0.50-1.00/track) but cheaper if reused from
library ($0).

Auto-proceeds; no checkpoint.
