---
name: "higgsfield-character-train"
description: "Prepare and validate identity-training or character-reference workflows for Higgsfield."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 81
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.

# Higgsfield Character Training

This companion skill is distilled from the mirrored Higgsfield generation skill and its reference material. Read it alongside `higgsfield-generate`; that full skill remains the source for CLI bootstrap, model discovery, media roles, waiting, result delivery, and troubleshooting.

## Workflow

- Use this when the user asks to train, register, or reuse a character identity before generation.
- Collect a rights-cleared reference set with consistent identity, clean lighting, and enough variation in expression and angle. Avoid celebrities, copyrighted characters, or ambiguous consent.
- Inspect the live Higgsfield CLI/model schema before submitting. The source skill explicitly routes generic generation away from character training and toward a dedicated Soul/identity flow, so the agent must validate the current command surface rather than guessing.
- After a reference id is created, switch to `higgsfield-soul-id` or `higgsfield-generate` for production prompts and log the identity reference used.

## Required Cross-Reads

- `bundled/.show-sidekick/skills/agents/higgsfield-generate.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/model-catalog.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/media-inputs.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/prompt-engineering.md`
