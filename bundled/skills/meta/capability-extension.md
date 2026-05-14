---
name: capability-extension
description: Govern project-scoped capability extensions without mutating bundled tools.
applies_to: meta
cross_refs:
  - specs/14-decision-log.md
---
# Capability Extension Protocol

Use this when a production need is not covered by the existing registry, bundled skills, playbooks, or pipeline manifests. Extension is allowed, but it must be narrow, reversible, and logged.

## Gap-Type Table

| Gap type | Example | Allowed action |
|---|---|---|
| One-off transform | Crop, normalize, rename, convert, small data cleanup | Project-scoped script that produces a file artifact |
| Recurring visual need | New look, chart treatment, motion grammar | Project-local playbook or reusable Remotion/HyperFrames component |
| Missing provider | User needs a provider not in the registry | Minimal project-scoped wrapper only with explicit approval |
| Missing knowledge | Prompting or parameter technique is unknown | Research, then document a project-local Layer 3 skill |

## Six Hard Conditions

All six must be true before creating an extension:

1. No existing tool, skill, playbook, or pipeline covers the need.
2. The extension is project-scoped, not a mutation of bundled harness files.
3. The extension is idempotent and safe to re-run.
4. The extension writes a concrete artifact in the project workspace.
5. The extension is logged with `category: "capability_extension"` in the decision log.
6. The user is informed before the extension is used for paid or externally visible work.

## Scripts

Scripts go under the active user project workspace, usually:

```text
projects/<show>/<episode>/scripts/<name>.<ext>
```

Scripts must not send messages, delete unrelated files, push to remotes, call paid APIs without approval, or bypass the pipeline.

## Custom Playbooks

When bundled playbooks do not match the brief:

1. Use `src/playbooks/generator.ts` behavior as the model: infer palette, typography, motion rules, audio mood, asset preferences, and quality rules from the brief or VideoAnalysisBrief.
2. Save project-local overrides under `<project>/playbooks/`.
3. Validate against `bundled/schemas/styles/playbook.schema.json`.
4. Log `playbook_selection` and, when generated mid-run, `capability_extension`.

## New Skills

When research produces reusable provider or technique knowledge:

1. Write a project-local skill under `<project>/skills/agents/<name>.md` for vendor knowledge or `<project>/skills/meta/<name>.md` for workflow knowledge.
2. Include trigger, prerequisites, workflow, quality bar, anti-patterns, and source links.
3. Read the skill before using the technique.
4. Suggest upstreaming only after it proves generally useful.

## Tool Wrappers

Project-scoped wrappers are a last resort. Prefer adding a proper `src/tools/` integration in the harness when the provider should be reusable.

If a wrapper is unavoidable for a single user project:

- It must not modify existing tools.
- It must use the same input/output contract shape as registry tools.
- It must require explicit approval before the first paid call.
- It must produce artifacts that downstream stages can validate.

## Forbidden

- Modifying existing tools to satisfy one production.
- Calling external APIs without user knowledge.
- Bypassing the registry for normal production work.
- Skipping decision-log entries.
- Writing scripts with side effects beyond their declared output file.
- Treating a capability extension as permission to degrade quality silently.

## Decision Log Entry Format

```json
{
  "id": "capability_extension_custom_chart",
  "stage": "assets",
  "category": "capability_extension",
  "options_considered": [
    {
      "label": "existing Remotion chart scenes",
      "rejected_because": "none can show the required three-axis comparison clearly",
      "notes": null
    },
    {
      "label": "project-local chart component",
      "rejected_because": null,
      "notes": "Reusable for this episode family"
    }
  ],
  "picked": "project-local chart component",
  "reason": "The brief needs a repeated visual grammar that current chart scenes do not express.",
  "confidence": 0.78,
  "user_visible": true,
  "supersedes": null
}
```
