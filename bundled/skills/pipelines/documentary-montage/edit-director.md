---
name: "documentary-montage-edit-director"
description: "Build documentary montage edit decisions with source-preserving rhythm and end-tag placement."
applies_to: "pipelines/documentary-montage"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Documentary Montage Pipeline

## When To Use

Use this stage after retrieved assets and the required `end_tag_plan` exist. Build the rough-cut timing, overlays, source labels, transitions, and end tag instructions.

## Runtime Lock

Preserve the approved runtime in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Documentary Rhythm

Cut for visual argument, not decoration. Each source clip should either establish context, show contrast, reveal consequence, create temporal progression, or land the final claim.

No narration unless the user explicitly asks. Adding voice is a MAJOR change and requires user approval per the Decision Communication Contract.

## Process

1. Map every scene to retrieved asset ids, start/end times, overlays, and source labels.
2. Keep cuts short enough to sustain montage rhythm while preserving source meaning.
3. Add lower thirds or source cards only when they clarify the footage.
4. Place the end tag according to `end_tag_plan.mode` and `placement_seconds_from_end`.
5. Preserve any source audio only when it supports the documentary promise; otherwise use music or silence without inventing narration.

## Quality Gate

- every cut maps to approved retrieval assets,
- source meaning is preserved,
- end tag placement follows `end_tag_plan`,
- runtime remains unchanged,
- generated clips remain traceable to `fallback_decision` or `capability_extension` when present.
