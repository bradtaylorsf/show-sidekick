---
name: "cinematic-asset-director"
description: "Generate cinematic motion, speech, captions, and support assets with CHAI prompt review."
applies_to: "pipelines/cinematic"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Cinematic Pipeline

## When To Use

Use this stage after the scene plan is approved. Build only the assets required by the locked cinematic direction and sample-first plan.

## Required Layer 3 References

Read `bundled/skills/agents/seedance-2-0.md`, `bundled/skills/agents/ai-video-gen.md`, and `bundled/skills/core/remotion.md` before generation or composition planning. Use `video_selector` rather than directly calling a provider so availability, cost, and fallback are recorded.

## Canonical 5-Aspect Block

Use the block below verbatim when a stage needs structured video intent:

```text
Subject: type; key visual attributes; count; age; role; costume; distinguishing features; multiple-subject disambiguation; transitions across shots (revealing / disappearing / switching / complex-alternating); or N/A.
Subject Motion: actions in temporal order; subject-object interactions; subject-subject interactions; group action; group/interaction patterns (parallel / sequential / reactive); locomotion vs gesture vs facial motion; or N/A.
Scene: overlays listed separately; POV (drone / aerial / OTS / macro / top-down / dashcam / FPV / handheld / locked-off); setting; time of day; scene dynamics (weather / particles / crowd movement); or N/A.
Spatial Framing: shot size (ECU / CU / MS / WS / EWS); subject position in frame; depth (foreground / midground / background usage); camera-height-relative (above / at / below subject); how each of these changes across the shot; or N/A.
Camera: playback speed (real-time / slow-mo / time-lapse); lens distortion (anamorphic / fish-eye / tilt-shift / barrel); height (ground / eye / overhead / aerial); angle (high / low / Dutch / level); focus / DoF (rack focus / deep focus / shallow); steadiness (locked / handheld / gimbal); movement (push / pull / pan / tilt / dolly / truck / crane / orbit); or N/A.
```

## Governance Rules

"Mark any aspect explicitly as N/A if it doesn't apply (e.g., 'Subject: N/A — pure scenery shot,' or 'Scene overlays: N/A — no graphics'). Silent omission is the most common analyst failure and produces ambiguous downstream prompts."

"Overlays (text, lower thirds, graphics, watermark) are their own layer. Do not merge them into the depth axis of the Scene aspect — they live above the scene, not inside it."

## CHAI Three-Step Prompt Review

Use this exact review loop before every expensive video generation:

1. pre-caption: write the prompt's intended visible result as a literal caption before generation.
2. critique: compare the prompt against the five-aspect block and mark missing, vague, or confusable terms.
3. post-caption: after generation, caption the actual output and revise if it diverges from the pre-caption.

## Emotional-Adjective Ban

"Do not use emotional adjectives like beautiful, stunning, amazing, epic in shot prompts; they read as filler and weaken the cinematic spec."

## Confusable Terms

Disambiguate these before generation:

- close-up vs cutaway,
- dolly vs zoom,
- pan vs whip-pan,
- OTS vs POV,
- handheld shake vs intentional camera movement,
- rack focus vs shallow depth of field,
- slow motion vs time-lapse,
- subject reveal vs camera reveal,
- overlay vs foreground object,
- cinematic wide vs extra-wide establishing shot.

## Process

1. Generate one approved motion sample before batching.
2. Keep motion metadata linked to scene id, prompt, seed, provider, aspect ratio, cost, and approval state.
3. Generate speech according to the locked audio architecture; do not add narration or characters that the proposal did not approve.
4. Generate captions and support diagrams only when the scene plan calls for them.
5. Preserve color-grade and prompt notes for editor handoff.

motion is a hard requirement; still-image fallback is forbidden

## Quality Gate

- CHAI prompt review is complete for each generated clip,
- every generation reads from the five-aspect scene intent,
- rejected prompts and provider fallbacks are logged,
- all referenced files exist and include metadata.
