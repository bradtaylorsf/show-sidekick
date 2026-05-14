---
name: agents-readme
applies_to: agents
agent_skill: false
---

# Layer 3 Agent Skills

Layer 3 skills are provider and craft instructions for generation, capture, rendering, transcription, animation, and post-production tools. Tool definitions stay terse; these Markdown skills carry model identity, prompt structure, parameter defaults, quality keywords, anti-patterns, and provider-specific workflow knowledge.

## Contract

Read the relevant Layer 3 skill before calling any tool that lists it in `agent_skills`. Do not treat these files as optional background reading: they are the quality layer that keeps prompts, parameters, provider routing, and review expectations from collapsing into generic calls.

Layer 3 skills must:

- Use YAML frontmatter with `name`, `description`, `applies_to: agents`, `agent_skill: true`, and `critical`.
- Explain when to use the provider or technique.
- Preserve model names, parameter values, flags, defaults, and quality gates from the source skill.
- State provider-specific anti-patterns when the skill controls paid, slow, or quality-sensitive generation.
- Link to mirrored reference material when the original skill depended on supporting Markdown.
- Avoid private source paths, local machine paths, credentials, or reference-repo names.

Start new skills from `bundled/skills/agents/TEMPLATE.md`.

## Critical Subset

These 12 skills are mandatory quality gates for Epic 8 and must contain the section headers `Model Identity`, `Prompt Structure`, `Parameter Defaults`, `Quality Keywords`, and `Anti-Patterns`:

- `flux-best-practices`
- `seedance-2-0`
- `ai-video-gen`
- `elevenlabs`
- `google-tts`
- `music`
- `higgsfield-generate`
- `remotion`
- `gsap-timeline`
- `gsap-plugins`
- `acestep`
- `whisperx`

When editing one of these files, preserve those headings and keep the original provider guidance below the predit usage contract unless the source itself is wrong or stale.

## Resource Layout

The runtime resolver reads `bundled/skills/agents/<name>.md`. When a source skill had reference files, they are mirrored under `bundled/skills/agents/<name>/...` and the flattened skill entrypoint links into that folder.

Project users may override any bundled agent skill by placing a same-named file under `<project>/skills/agents/<name>.md`.
