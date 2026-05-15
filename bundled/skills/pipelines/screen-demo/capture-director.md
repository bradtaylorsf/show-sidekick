---
name: "screen-demo-capture-director"
description: "Produce real capture metadata or synthetic terminal props for approved demo steps."
applies_to: "pipelines/screen-demo"
stage: "capture"
produces: "capture_manifest"
---
# Capture Director - Screen Demo Pipeline

## When To Use

Use this stage after the idea checkpoint locks `capture_mode`. The output is a capture_manifest for either real capture files or synthetic terminal scene props.

## Capture Tools

For `real_capture`, use `playwright_recording` and follow `bundled/skills/agents/playwright-recording.md`. For `synthetic_terminal`, follow `bundled/skills/agents/synthetic-screen-recording.md` and prepare deterministic terminal commands, output text, timing, and prompt style for `terminal_scene`.

## Process

1. Read the locked capture mode and demo steps from the brief.
2. For `real_capture`, run or plan `playwright_recording` with viewport, URL, steps, wait rules, and output paths.
3. For `synthetic_terminal`, create terminal scene props with commands, outputs, prompt labels, typing cadence, and hold frames.
4. Record failures, retries, skipped steps, credentials needed, and private-data redactions.
5. Save all capture outputs or props under the episode asset folder.

## Quality Gate

- capture_manifest records `capture_mode`,
- every demo step has a real capture asset or synthetic terminal props,
- failed or flaky capture steps are explicit,
- outputs match the approved aspect ratio or include a correction plan.
