---
name: "animation-publish-director"
description: "Package rendered animation outputs and editable source files."
applies_to: "pipelines/animation"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Animation Pipeline

## When To Use

Use this stage after compose passes validation and final review.

## Shared Visual Contract

Reference `bundled/skills/_shared/video-prompting.md` when documenting generated shot prompts or visual caveats.

## Process

1. Package final renders, captions, audio, editable animation source, and plugin notes.
2. Name files by platform, aspect ratio, runtime, and version.
3. Include runtime validation logs and known caveats.
4. Confirm the handoff package can be opened or inspected without hidden local dependencies.

## Output Contract

Produce a schema-valid `publish_log` with render outputs, source package paths, runtime notes, and editor handoff metadata.
