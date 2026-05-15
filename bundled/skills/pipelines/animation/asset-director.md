---
name: "animation-asset-director"
description: "Build runtime-compatible animation assets and sample motion systems."
applies_to: "pipelines/animation"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Animation Pipeline

## When To Use

Use this stage after runtime selection. Build source animation assets, generated visuals, VO, captions, and reusable components.

## Required Layer 3 References

Read `bundled/skills/agents/gsap-timeline.md`, `bundled/skills/agents/gsap-plugins.md`, `bundled/skills/agents/framer-motion.md`, and `bundled/skills/agents/lottie-bodymovin.md` before building animation assets. When using GSAP plugins, explicitly name SplitText, MorphSVG, MotionPath, DrawSVG, Flip, CustomEase in the asset notes and load only the plugins the selected scenes need.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` for generated shots and `bundled/skills/_shared/shot-prompt-builder.md` for prompt composition.

## Process

1. Build one sample motion system before batching scenes.
2. Prefer runtime-native primitives unless a Layer 3 skill justifies a plugin.
3. Keep source files editable: TSX, SVG, Lottie JSON, GSAP timelines, or HyperFrames components should remain in the handoff package.
4. Store plugin names, runtime, prompt metadata, source file paths, and approval state in the asset manifest.

## Output Contract

Produce a schema-valid `asset_manifest` with source animation files, generated assets, provider notes, plugin notes, costs, and sample approvals.
