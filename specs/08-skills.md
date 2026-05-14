# 08 — Skills

## What a skill is

A Markdown file that tells the agent *how* to do something. Skills are the instruction layer — `predit` is intentionally instruction-driven, so an agent can be retargeted at new pipelines or vendors by editing prose, not code.

## Skill types

| Type | Path | Purpose |
|---|---|---|
| **Stage director** | `skills/pipelines/<pipeline>/<stage>-director.md` | How to execute a specific pipeline stage |
| **Meta** | `skills/meta/<name>.md` | Cross-cutting agent skills (reviewer, checkpoint protocol, onboarding, etc.) |
| **Vendor (Layer 3)** | `skills/agents/<name>.md` | Provider-specific prompt engineering, parameter tuning, quality techniques |

## Skill format

A skill is plain Markdown with optional YAML frontmatter for metadata:

```markdown
---
name: scene-director
applies_to: pipelines/music-video
produces: scene_plan
requires_context: [brief, lyric_treatment, cuesheet]
---

# Scene Director — Music Video

## Goal

Produce a scene plan that anchors every scene to musical structure...

## Inputs
...

## Workflow
...

## Quality bar
...

## What to avoid
...
```

Frontmatter is optional — short skills can omit it. When present, the harness uses it to validate context completeness before invoking the agent for a stage.

## Scoping — bundled, project-local, show-specific, and shared

Four resolution tiers, checked in order (first match wins):

```
shows/<show>/skills/<stage>-director.md                          # show-specific override (highest priority)
skills/pipelines/<pipeline>/<stage>-director.md                  # project-local override
.predit/skills/pipelines/<pipeline>/<stage>-director.md          # bundled per-pipeline default
.predit/skills/pipelines/_shared/<stage>-director.md             # bundled shared default (lowest)
```

The harness reads at most one director skill per stage.

```
.predit/skills/                       # bundled, refreshed by `predit update`
├── pipelines/
│   ├── <pipeline>/<stage>-director.md
│   └── _shared/<stage>-director.md   # reusable across pipelines (cuesheet, etc.)
├── meta/<name>.md
├── core/<name>.md                    # cross-cutting craft skills (ffmpeg, remotion, ...)
└── agents/<vendor>.md

skills/                               # optional project-local overrides
├── pipelines/<pipeline>/<stage>-director.md
├── meta/<name>.md
└── agents/<vendor>.md

shows/<show>/skills/                  # show-specific overrides (apply to any pipeline this show runs)
└── <stage>-director.md
```

When resolving a director skill for a given stage:

1. Look for `shows/<show>/skills/<stage>-director.md`. If present, use it.
2. Otherwise, look for `skills/pipelines/<pipeline>/<stage>-director.md` (project-local override).
3. Otherwise, look for `.predit/skills/pipelines/<pipeline>/<stage>-director.md` (bundled per-pipeline default).
4. Otherwise, use `.predit/skills/pipelines/_shared/<stage>-director.md` (bundled shared default).

The `_shared/` tier lets reusable director skills — like the cuesheet stage's director, which is identical across music-video, news-song, trailer, etc. — live in one place. A pipeline-specific override at tier 3 wins when present.

Shows don't fork pipelines to tweak a single stage — they shadow the specific skill they want to change. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md) for cache layout.

## Layer 3 — vendor knowledge

Tools reference vendor skills via `agent_skills: ['higgsfield-generate', 'ai-video-gen']`. The agent reads these before crafting prompts for that tool. Layer 3 is where prompt structures, parameter sweet spots, camera-direction syntax, and quality keywords live. Hand-edit any time without a TypeScript rebuild.

Bundled Layer 3 skills live in `.predit/skills/agents/<name>.md` and should use frontmatter like:

```yaml
name: higgsfield-generate
description: Generate images/videos through the Higgsfield provider surface.
applies_to: agents
agent_skill: true
critical: true
```

Critical vendor skills must include explicit `Model Identity`, `Prompt Structure`, `Parameter Defaults`, `Quality Keywords`, and `Anti-Patterns` sections. These headings are intentionally repetitive: they let tests verify that model-specific instructions, prompt shape, named defaults, quality language, and failure modes survive future ports or edits.

## What skills are not

- They are not code. They have no executable directives, no templating language, no embedded scripts. The agent reads them as instructions, not configuration.
- They are not pipelines. A skill describes how to do one stage; a pipeline composes stages.
- They are not a knowledge base. Skills are operational — they tell the agent what to do in a specific situation, not what generally exists.
