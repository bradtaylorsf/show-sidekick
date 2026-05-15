---
name: "clip-factory-executive-producer"
description: "Orchestrate the Clip Factory bundled pipeline."
applies_to: "pipelines/clip-factory"
---
# Executive Producer - Clip Factory

This is the demo readiness lane: clip-factory. Keep the workflow predit-native and resolve all skills from the user project's .predit cache or explicit project overrides.

## Pipeline State

Track the active stage, required inputs, prior artifacts, budget posture, and unresolved approvals before delegating work.

## Quality Gates

- Confirm each stage produced its declared artifact before moving forward.
- Confirm review findings are handled or logged with a concrete rationale.
- Do not swap render_runtime silently; escalate before changing composition strategy.

## Orchestration Limits

- max_revisions_per_stage: 2
- max_send_backs: 2
- max_wall_time_minutes: 20

## Handoff

Pass the next director only the current brief, prior artifacts, playbook defaults, and known constraints.
