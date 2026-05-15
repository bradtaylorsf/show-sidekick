---
name: "screen-demo-idea-director"
description: "Define demo promise, capture mode, target platform, and runtime constraints."
applies_to: "pipelines/screen-demo"
stage: "idea"
produces: "brief"
---
# Idea Director - Screen Demo Pipeline

## When To Use

Use this stage when the user wants a product or workflow demonstrated through screen material. Lock the demo surface and capture mode before any capture or scene work starts.

## Capture Mode Selection

"Use synthetic_terminal when the demo is a CLI / install flow / terminal workflow. Use real_capture when the demo is a real app UI or requires unpredictable live behavior."

Cross-reference `synthetic-screen-recording` for generated terminal scenes and `playwright-recording` for real browser or app capture tools. Record the rejected mode and reason in the decision_log.

## Process

1. Classify the demo surface: CLI, install flow, terminal workflow, web app, desktop app, docs flow, or mixed.
2. Pick `capture_mode: synthetic_terminal` only when commands, prompts, output, and timing can be represented truthfully.
3. Pick `capture_mode: real_capture` when real UI state, browser interaction, animation, authentication, or unpredictable behavior matters.
4. Lock target platform, aspect ratio, runtime, narration style, and success path.
5. Record risky steps such as credentials, network calls, flaky app states, long waits, or private data.

## Quality Gate

- capture mode is locked at idea,
- selected mode follows the required rule,
- target aspect and runtime are explicit,
- capture risks are visible before capture starts.
