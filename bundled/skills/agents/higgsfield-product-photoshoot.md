---
name: "higgsfield-product-photoshoot"
description: "Generate brand/product visuals, hero banners, lifestyle shots, and virtual try-on style imagery through Higgsfield-oriented defaults."
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

# Higgsfield Product Photoshoot

This companion skill is distilled from the mirrored Higgsfield generation skill and its reference material. Read it alongside `higgsfield-generate`; that full skill remains the source for CLI bootstrap, model discovery, media roles, waiting, result delivery, and troubleshooting.

## Workflow

- Use this instead of generic `higgsfield-generate` for brand product visuals, Pinterest pins, lifestyle product scenes, hero banners, ad packs, virtual try-on, restyles, or product-focused marketing images.
- Source model catalog guidance routes these visuals through a product-photoshoot prompt enhancer on top of GPT Image 2. Keep brand/product identity, label text, dimensions, material, and camera framing explicit.
- For Marketing Studio product entities, first import or create the product with `higgsfield marketing-studio products fetch --url ... --wait` or `higgsfield marketing-studio products create --title ... --image ...`.
- Do not send a bare product photo to a generic image model when a product entity, brand kit, or product-specific workflow is available.

## Required Cross-Reads

- `bundled/.predit/skills/agents/higgsfield-generate.md`
- `bundled/.predit/skills/agents/higgsfield-generate/references/model-catalog.md`
- `bundled/.predit/skills/agents/higgsfield-generate/references/media-inputs.md`
- `bundled/.predit/skills/agents/higgsfield-generate/references/prompt-engineering.md`
