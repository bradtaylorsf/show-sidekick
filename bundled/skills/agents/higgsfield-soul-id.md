---
name: "higgsfield-soul-id"
description: "Use Soul Character references and Soul-family Higgsfield models for identity-consistent characters."
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

# Higgsfield Soul ID

This companion skill is distilled from the mirrored Higgsfield generation skill and its reference material. Read it alongside `higgsfield-generate`; that full skill remains the source for CLI bootstrap, model discovery, media roles, waiting, result delivery, and troubleshooting.

## Workflow

- Use this when a production needs the same face or persona across images, cinematic stills, or follow-on video references.
- Source model catalog guidance: Soul 2.0 is for aesthetic UGC, fashion editorial, and character generation; Soul Cinema is for cinematic stills; Soul Cast is text-only for distinctive personas; Soul Location is prompt-only for places.
- When a Soul Character reference id already exists, pass it to Soul-aware models with `--soul-id <soul_ref_id>` and prefer `text2image_soul_v2` for stills or Soul Cinema for cinematic frames.
- Do not invent a training command. Discover the current Higgsfield CLI surface first, then use the existing `higgsfield-generate` skill and model schema to validate the exact job set and flags before submitting.

## Required Cross-Reads

- `bundled/.show-sidekick/skills/agents/higgsfield-generate.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/model-catalog.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/media-inputs.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/prompt-engineering.md`
