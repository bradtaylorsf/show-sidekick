---
name: "cinematic-scene-director"
description: "Convert the script into timed cinematic scenes with complete five-aspect shot intent."
applies_to: "pipelines/cinematic"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Cinematic Pipeline

## When To Use

Use this stage to turn the approved script and proposal into a scene plan that can survive prompt generation and editing.

## Shared Visual Contract

Read `bundled/skills/_shared/video-prompting.md` before writing scene intent. Use `bundled/skills/_shared/shot-prompt-builder.md` when final prompt composition is needed.

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

## Process

1. Segment the script into scenes with durations and motion jobs.
2. Fill every 5-aspect field for generated or reference-inspired shots.
3. Plan shot-to-shot variation in subject scale, camera movement, and scene energy.
4. Reserve overlay and caption safety zones separately from the scene depth axis.
5. Mark one sample candidate that best tests motion, identity, and camera language.

## Quality Gate

- every generated shot has complete five-aspect intent,
- no aspect is silently omitted,
- motion is a hard requirement in each planned generated clip,
- scene order can be edited into a coherent cinematic arc.
