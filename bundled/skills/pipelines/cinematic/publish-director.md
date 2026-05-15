---
name: "cinematic-publish-director"
description: "Package cinematic deliverables, metadata, generated-asset notes, and editor handoff files."
applies_to: "pipelines/cinematic"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Cinematic Pipeline

## When To Use

Use this stage after the render and final review are complete. Package the rough cut for human editing, review, or publishing.

## Process

1. Name deliverables by platform, aspect ratio, runtime, and version.
2. Include rendered video, captions, audio stems, generated motion clips, prompt metadata, color notes, and NLE handoff files.
3. Include the approved proposal packet and final review notes.
4. Record known caveats: provider artifacts, identity drift, caption risks, or editorial decisions that need a human pass.
5. Keep `bundled/skills/_shared/video-prompting.md` references attached when prompts are part of the handoff.

## Quality Gate

- every deliverable has a clear filename and destination,
- generated assets remain traceable to prompts and providers,
- caveats are surfaced rather than hidden,
- the package is usable by an editor without reading the whole project history.
