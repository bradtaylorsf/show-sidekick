---
name: "animated-explainer-publish-director"
description: "Package the rendered explainer, captions, and handoff metadata."
applies_to: "pipelines/animated-explainer"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Animated Explainer Pipeline

## When To Use

Use this stage after compose has produced a validated render and final review.

## Shared Visual Contract

Reference `bundled/skills/_shared/video-prompting.md` when summarizing generated visual methods, sample approvals, or prompt caveats for handoff.

## Process

1. Package rendered video, captions, VO, reusable graphics, and edit metadata.
2. Name outputs by platform, aspect ratio, and version.
3. Include notes for any generated visuals, provider caveats, or manual editor follow-up.
4. Confirm that the published package matches the approved delivery promise.

## Output Contract

Produce a schema-valid `publish_log` with output list, handoff package path, metadata, and remaining caveats.
