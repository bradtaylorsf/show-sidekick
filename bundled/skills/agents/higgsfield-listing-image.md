---
name: "higgsfield-listing-image"
description: "Create marketplace/listing-ready product images with clear offer, product, and brand constraints."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 81
---

## predit Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.

# Higgsfield Listing Image

This companion skill is distilled from the mirrored Higgsfield generation skill and its reference material. Read it alongside `higgsfield-generate`; that full skill remains the source for CLI bootstrap, model discovery, media roles, waiting, result delivery, and troubleshooting.

## Workflow

- Use this for marketplace listing cards, ecommerce thumbnails, App Store or web-product visuals, and direct-response product image variants.
- Choose a product entity or webproduct first. App Store URLs auto-route to webproducts; normal ecommerce URLs use `higgsfield marketing-studio products fetch --url ... --wait`.
- Keep prompt structure tight: product identity, target marketplace context, angle, background, claims or text, aspect ratio, and any required brand kit.
- Do not overload listing images with too many text claims; prioritize product legibility, recognizable brand elements, and a single visual promise.

## Required Cross-Reads

- `bundled/.predit/skills/agents/higgsfield-generate.md`
- `bundled/.predit/skills/agents/higgsfield-generate/references/model-catalog.md`
- `bundled/.predit/skills/agents/higgsfield-generate/references/media-inputs.md`
- `bundled/.predit/skills/agents/higgsfield-generate/references/prompt-engineering.md`
