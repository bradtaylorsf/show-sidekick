---
description: "Create slide-aware edit decisions for motion-led presentation-demo scenes."
stage: edit
produces: edit_decisions
---

# Presentation Demo Edit Director

## Edit Decision Shape

Each cut must include timing, `scene_type: slide_image`, `slide_id`, and a treatment with zoom/pan, highlight, callout, caption, or support visual data. Use normalized slide coordinates for highlights and anchor callouts away from important slide text.

## Runtime Governance

Copy the runtime locked in the approved proposal into `edit_decisions.render_runtime`. A silent runtime swap is a CRITICAL governance violation. Remotion is the default unless HyperFrames was explicitly approved.

## Slideshow Downgrade Check

Before compose, reject runs where slide scenes are static and lack callouts, highlights, captions, or support visuals. The accepted output must feel like an animated demo, not a deck recording.
