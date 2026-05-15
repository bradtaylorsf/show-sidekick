---
name: "avatar-spokesperson-source-review-director"
description: "Review presenter plates, avatar references, brand inputs, and rights-sensitive source media."
applies_to: "pipelines/avatar-spokesperson"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Avatar Spokesperson Pipeline

## When To Use

Run this first when the user supplies presenter plates, avatar references, brand footage, product screenshots, or likeness-sensitive materials.

## Process

1. Use `source_media_review` for supplied media and references.
2. Use `frame_sampler` to inspect presenter plate framing, lighting, mouth visibility, and crop safety.
3. Use `video_understand` to summarize supplied presenter or product context when it affects the avatar promise.
4. Record rights, consent, brand approval, and likeness constraints as explicit caveats.
5. Handoff plate viability and source constraints to the G1 Pivot Decision.

## Quality Gate

- source_media_review exists when user-supplied media is present,
- presenter plate viability is clear for possible lip-sync path,
- rights and consent caveats are surfaced,
- downstream idea approval can make a real Pivot Decision.
