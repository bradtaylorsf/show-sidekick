---
name: "svg-character-animation"
description: "Animate SVG character rigs with GSAP, CSS transforms, Remotion frame control, and HyperFrames-compatible browser previews."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 79
---

## predit Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for predit paths and terminology while preserving the original operational details.

# SVG Character Animation

Use this skill when animating character rigs made from SVG parts.

## Runtime Rules

- Animate transforms (`x`, `y`, `scale`, `rotation`) rather than layout.
- Use timelines for multi-part acting beats.
- For SVG elements, use stable pivots (`svgOrigin` or correctly scoped
  transform origins).
- In Remotion, do not let GSAP advance with `requestAnimationFrame`; drive a
  paused timeline from the current frame.

## Browser Pattern

```js
gsap.set("#arm_right", { svgOrigin: "390 310" });
const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });
tl.to("#head", { rotation: -8, duration: 0.2 })
  .to("#arm_right", { rotation: 35, duration: 0.4 }, "<");
```

## Remotion Pattern

```tsx
const frame = useCurrentFrame();
const progress = frame / durationInFrames;
timeline.progress(progress);
```

## HyperFrames Pattern

Use HTML/SVG/GSAP components with deterministic timelines and validate via the
HyperFrames CLI before final render.

## Quality Checklist

- Parts stay connected at pivots during motion.
- Blinks, gaze, and mouth shapes are separate enough to read.
- Pose holds are long enough to communicate emotion.
- Frame sampling shows meaningful deltas, not frozen animation.

## Sources

- GSAP core transform properties and SVG handling:
  https://gsap.com/docs/v3/GSAP/CorePlugins/CSS/
- GSAP timelines and sequencing:
  https://gsap.com/docs/v3/GSAP/Timeline/
- Remotion `useCurrentFrame`:
  https://www.remotion.dev/docs/use-current-frame
