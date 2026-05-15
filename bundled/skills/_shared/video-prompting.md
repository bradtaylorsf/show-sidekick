---
name: "shared-video-prompting"
description: "Canonical 5-aspect video specification framework for L2P pipelines and reference analysis."
applies_to: "shared"
---
# Shared Video Prompting Framework

Use this skill whenever a pipeline describes generated video, animated stills, or reference-video analysis. The five aspects are the common handoff shape between analysts, scene directors, asset directors, and prompt builders.

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

## How To Use

1. Fill every aspect in order: Subject, Subject Motion, Scene, Spatial Framing, Camera.
2. Keep overlays inside the Scene aspect as their own layer, then describe physical scene depth separately in Spatial Framing.
3. Preserve N/A lines in downstream artifacts. A pure typography shot still needs Subject and Subject Motion marked explicitly.
4. When converting to a generation prompt, pass the filled aspects to `src/prompts/shot-prompt-builder.ts` and append the active playbook style suffix.

## Schema Links

- Shared `research_brief` schema: `src/artifacts/research-brief.ts` and `bundled/schemas/artifacts/research_brief.schema.json`.
- Shared `script` schema: `src/artifacts/script.ts` and `bundled/schemas/artifacts/script.schema.json`.
