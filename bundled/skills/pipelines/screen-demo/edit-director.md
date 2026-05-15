---
name: "screen-demo-edit-director"
description: "Build edit decisions for screen-demo timing, callouts, captions, and variants."
applies_to: "pipelines/screen-demo"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Screen Demo Pipeline

## When To Use

Use this stage after screen-demo assets exist. Build the edit instructions that make each step readable, ordered, and paced.

## Runtime Lock

Preserve the approved runtime in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Keep demo steps in the approved order unless a revision changes the flow.
2. Add pauses after important commands, clicks, UI state changes, and results.
3. Time zooms, callouts, cursor emphasis, and captions to support comprehension.
4. Drop or compress waits that do not teach the viewer anything.
5. Record per-platform crop, text-size, and callout-placement decisions.

## Quality Gate

- demo steps remain understandable,
- screen text is readable,
- runtime is unchanged,
- edit decisions cover every planned output variant.
