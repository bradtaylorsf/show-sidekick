---
name: "localization-dub-script-director"
description: "Create transcript-backed, reviewable target-language scripts before dubbing."
applies_to: "pipelines/localization-dub"
stage: "script"
produces: "script"
---
# Script Director - Localization Dub Pipeline

## When To Use

Turn the approved localization brief into a transcript-backed, reviewable script package for every target language. This stage should create text truth before any dubbing audio is generated.

## Reference Inputs

- `bundled/skills/agents/video-translate.md`
- `bundled/skills/agents/heygen.md`
- `bundled/skills/core/subtitle-sync.md`
- `bundled/skills/meta/creative-intake.md`

## Process

### 1. Build Source Transcript Truth

Start with the source transcript and fix obvious errors in:

- names,
- terminology,
- speaker allocation,
- numbers,
- CTA phrasing.

### 2. Produce Reviewable Target Copy

For each target language, generate text that can be reviewed before synthesis. Record where terms should remain unchanged.

### 2b. Translation Workflow And Provider Handoff

Use this translation workflow for every locale: source transcript truth -> protected glossary -> target-language copy -> human or owner review -> target-language voice casting -> locale-aware subtitle rendering plan -> synthesis or HeyGen handoff.

Use HeyGen video-translate through `bundled/skills/agents/video-translate.md` and the registry-backed `heygen_video` tool with `mode: "video_translate"` when the deliverable is a translated or lip-synced source video. For subtitle-only or rebuilt-audio deliveries, keep the target copy and timing package ready for `subtitle_gen`, `tts_selector`, and `audio_mixer`.

target-language voice casting must be explicit for each locale: record `voice_id` when known, provider, accent or regional variant, vocal age/energy, pronunciation notes, and rejected options. Do not let the asset stage guess the voice.

locale-aware subtitle rendering must be planned in the script package: include locale code, reading direction, line-length and line-break constraints, punctuation conventions, expansion risk, and whether subtitles are burned in or exported as sidecar files.

### 3. Preserve Structure Where Practical

Keep section timing and sequence aligned to the source unless the translation clearly needs a different pacing strategy.

### 4. Use Metadata For Localization Control

Recommended metadata keys:

- `source_transcript_status`
- `target_language_sections`
- `glossary_terms`
- `protected_terms`
- `pronunciation_notes`
- `review_status_by_language`

### 5. Quality Gate

- the source transcript is strong enough to trust,
- target-language copy exists for every planned deliverable,
- glossary terms are preserved,
- the script package can be reviewed before audio generation.

### Mid-Production Fact Verification

If you encounter uncertainty during script writing:
- Use `web_search` to verify factual claims before committing them to the script
- Use `web_search` to find reference images for visual accuracy
- Log verification in the decision log: `category="visual_accuracy_check"`

Every factual claim in the script should be traceable to the `research_brief`.
If you make a claim that isn't in the research, do additional research and
add the source. Do not invent statistics, dates, or attributions.

## Common Pitfalls

- Generating audio from an unreviewed transcript.
- Letting product names drift across languages.
- Treating translation text as final timing without acknowledging length drift.
