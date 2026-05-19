---
name: "marketing-studio"
description: "Higgsfield Marketing Studio video/image ad workflow for avatars, products, hooks, settings, ad references, and brand kits."
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

# Marketing Studio

This companion skill is distilled from the mirrored Higgsfield generation skill and its reference material. Read it alongside `higgsfield-generate`; that full skill remains the source for CLI bootstrap, model discovery, media roles, waiting, result delivery, and troubleshooting.

## Workflow

- Use Marketing Studio for all advertising and commercial video: UGC, unboxing, product showcase, product review, TV spot, virtual try-on, DTC ad images, brand/product workflows, and click-to-ad from product URLs.
- Core entities: avatar, product/webproduct, hook, setting, ad reference, brand kit, and ad format. Browse existing entities before creating new ones.
- Default video mode is `ugc`; other source modes include `ugc_how_to`, `ugc_unboxing`, `product_showcase`, `product_review`, `tv_spot`, `wild_card`, `ugc_virtual_try_on`, and `virtual_try_on`.
- Hook/setting setup items are valid only for the UGC-family modes listed in the source references. For DTC ads, picking an ad format is mandatory; there is no auto-default.
- Read the mirrored references under `higgsfield-generate/references/marketing-*.md` before executing a Marketing Studio job.

## Required Cross-Reads

- `bundled/.show-sidekick/skills/agents/higgsfield-generate.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/model-catalog.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/media-inputs.md`
- `bundled/.show-sidekick/skills/agents/higgsfield-generate/references/prompt-engineering.md`
