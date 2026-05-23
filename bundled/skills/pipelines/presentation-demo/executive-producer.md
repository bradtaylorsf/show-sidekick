---
name: "presentation-demo-executive-producer"
description: "Orchestrate deck-led animated explainer demos with voiceover timing, source provenance, and approval gates."
applies_to: "pipelines/presentation-demo"
role: "executive-producer"
---
# Executive Producer - Presentation Demo Pipeline

## When To Use

Use this pipeline for PDF, PowerPoint, or direct-download deck sources that need to become an animated explainer/demo rough cut. The source deck is the content spine; voiceover is the master clock after the script is approved.

## Pipeline state machine

```yaml
state:
  pipeline: presentation-demo
  master_clock: voiceover
  locked_decisions:
    deck_source: null
    audience: null
    duration: null
    aspect: null
    voice_preference: null
    render_runtime: null
  stages:
    idea: pending
    capture: pending
    script: pending
    cuesheet: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
    publish: pending
```

## Mandatory locked decisions

- After `idea`: deck source, audience, target duration, aspect, operator direction, authenticated-link limitation, and voice preference.
- After `capture`: `deck_manifest` slide IDs, screenshot paths, source provenance, notes/text extraction warnings, and `capture_manifest` compatibility.
- After `script`: final narration text, `slide_ids` or slide ranges for every section, and `vo_source` priority evidence.
- After `cuesheet`: approved narration audio, provider/voice metadata, and voiceover timing anchors.
- After `scene_plan`: motion language, support visuals, slide mapping, and static-slideshow rejection.
- After `edit`: runtime, timing, captions, and slide anchors.

Do not let a downstream director silently reinterpret a locked decision. If a source deck cannot be downloaded, parsed, or rendered, stop and surface the blocker before any paid generation.

## Validated patterns

- Capture runs before script so narration is written from real slide IDs, text, notes, and extraction warnings.
- Voiceover is the master clock. Scenes, captions, cuts, and compose timing follow approved narration.
- The output is an animated explainer/demo, not a static slideshow or screen recording of slides.
- Speaker notes are treated as author intent; slide text and OCR are supporting evidence; operator notes clarify emphasis and constraints.
- Expensive generation is approval-gated and sample-first when a representative asset is risky.

## When to stop and check with the human

Stop and ask before proceeding when:

- The deck source is an authenticated Google Slides, Microsoft 365, SSO, or browser-only link rather than a direct download.
- The captured deck has missing slide images, duplicate slide IDs, missing speaker notes where expected, or major extraction warnings.
- The script would need to cut or reorder core slide meaning to fit duration.
- The user has not approved the script before TTS or paid generation.
- A renderer/runtime fallback would change the promised animated explainer/demo output.

## Output Contract

Maintain `decision_log` entries for source constraints, voice/provider selection, runtime selection, paid-generation approvals, rejected alternatives, and any fallback that changes quality or scope.
