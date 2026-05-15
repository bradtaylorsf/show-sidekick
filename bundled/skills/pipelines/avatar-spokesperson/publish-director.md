---
name: "avatar-spokesperson-publish-director"
description: "Package avatar-spokesperson deliverables with pivot, rights, script, and provider metadata."
applies_to: "pipelines/avatar-spokesperson"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Avatar Spokesperson Pipeline

## When To Use

Use this stage after the avatar-spokesperson render passes final review.

## Process

1. Group deliverables by pivot path, platform, aspect ratio, and language or voice variant when relevant.
2. Include rendered video, script, captions, asset_manifest, edit_decisions, render_report, provider metadata, and NLE handoff files.
3. Surface caveats: blocked avatar path, lip-sync plate limitations, rights/consent notes, voice or provider retries, and caption issues.
4. Keep the `Pivot Decision` visible so future editors understand why the output took its path.
5. Record publish destinations and platform-specific metadata.

## Quality Gate

- deliverables are complete,
- Pivot Decision and rights notes are packaged,
- provider and asset caveats are visible,
- the package is ready for a human editor or platform upload.
