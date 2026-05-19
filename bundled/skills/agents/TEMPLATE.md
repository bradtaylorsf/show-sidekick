---
name: example-provider
description: One-sentence trigger and purpose for the provider or craft technique.
applies_to: agents
agent_skill: true
critical: false
epic: 8
issue: 0
---

# Example Provider

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow.
- Announce paid or externally visible generation before running it.
- Log provider/model decisions when they affect output quality, cost, duration, or format.

## When To Use

State the exact user intent, stage, or tool capability that should trigger this skill.

## Model Identity

Name the provider, model family, versions, aliases, and gateway surfaces. For critical skills, this heading is required.

## Prompt Structure

Give the prompt grammar the agent should use. Include ordering, required fields, examples, and what to derive from the stage context.

## Parameter Defaults

List production defaults, accepted values, named flags, env vars, media roles, durations, aspect ratios, and fallback rules.

## Quality Keywords

List words, concepts, or prompt ingredients that reliably raise output quality for this provider or technique.

## Anti-Patterns

State common failure modes and disallowed shortcuts, especially silent provider swaps, unsupported parameters, generic prompts, and quality downgrades.

## Workflow

Describe the operational sequence: inspect context, choose model, build prompt, validate params, call the registry tool, inspect result, and checkpoint decisions.

## References

Link any mirrored source reference files or companion skills.
