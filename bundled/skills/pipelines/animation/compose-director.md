---
name: "animation-compose-director"
description: "Render animation with deterministic Remotion, HyperFrames, GSAP, or Lottie patterns."
applies_to: "pipelines/animation"
stage: "compose"
produces: "render_report"
---
# Compose Director - Animation Pipeline

## When To Use

Use this stage to build, validate, render, and self-review the animation.

## Shared Visual Contract

Check generated visuals against `bundled/skills/_shared/video-prompting.md` before final render.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## HyperFrames Gate

Read `bundled/skills/core/hyperframes.md` and `bundled/skills/agents/hyperframes-cli.md` before HyperFrames render work. HyperFrames renders MUST pass `hyperframes lint` and `hyperframes validate` before render.

## GSAP Inside Remotion

Use deterministic GSAP-inside-Remotion patterns only:

```ts
const tl = gsap.timeline({ paused: true });
tl.progress(frame / durationInFrames);
```

The approved pattern is a paused timeline with `tl.progress(frame / durationInFrames)`. The alternate pattern is GSAP as value calculator: parse an ease, derive a value from `frame / durationInFrames`, and pass that value into React/SVG props without running a live GSAP ticker.

## Process

1. Build the runtime workspace and copy all source animation assets.
2. Run runtime-specific lint and validation.
3. Render the sample or full episode.
4. Spot-check frames for motion timing, text readability, and plugin artifacts.
5. Write final review notes with any runtime limitations.

## Output Contract

Produce a schema-valid `render_report` and `final_review` with runtime, output path, validation commands, duration, resolution, and review findings.
