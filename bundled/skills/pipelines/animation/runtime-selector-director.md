---
name: "animation-runtime-selector-director"
description: "Select the simplest runtime that can render the planned animation."
applies_to: "pipelines/animation"
stage: "runtime_selection"
produces: "render_runtime"
---
# Runtime Selector Director - Animation Pipeline

## When To Use

Use this stage after scene planning and before asset production.

## Required References

Read `bundled/skills/meta/animation-runtime-selector.md` and `bundled/skills/core/remotion.md` before selecting a runtime.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` when runtime choice depends on generated shot complexity.

## Process

1. Apply the "keep it simple" bias from the EP.
2. Choose Remotion when React components, captions, SVG, CSS transforms, and deterministic frame rendering are enough.
3. Choose HyperFrames when the scene is HTML/GSAP-native and its validation gate is realistic.
4. Choose Lottie/bodymovin when reusable vector animation assets already exist or should be designer-authored.
5. Record rejected options and the reason they were too complex or too weak.

## Output Contract

Produce a schema-valid `render_runtime` artifact and decision-log entry.
