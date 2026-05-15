---
name: "documentary-montage-compose-director"
description: "Render documentary montage output with source labels, end tag, and final self-review."
applies_to: "pipelines/documentary-montage"
stage: "compose"
produces: "render_report"
---
# Compose Director - Documentary Montage Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the montage, source labels, captions if any, music bed if any, and the approved end tag.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## End Tag Rendering

Render `end_tag_plan` exactly:

- `overlay`: place the tag over the final approved source shot at `placement_seconds_from_end`.
- `concat`: append the tag as its own final card or clip.

If the render cannot support the approved mode, stop and log a runtime or fallback decision before changing it.

## No-generated-clips final check

Use retrieval; generation requires logged `fallback_decision` or `capability_extension`. In the final review, verify every generated-looking clip either maps to retrieval metadata or to one of those logs.

## Process

1. Render with `video_compose` using the approved runtime.
2. Add source labels, credits, and end tag without covering essential visual action.
3. Mix music or source audio without adding narration unless it was explicitly approved.
4. Validate duration, resolution, codec, audio, end tag timing, and source-label readability.
5. Write `render_report` and `final_review`, including any unresolved source or fallback caveats.

## Quality Gate

- output files exist and pass ffprobe validation,
- end tag appears in the approved mode and timing,
- source labels are readable,
- no narration was added without approval,
- no generated clips appear without logged fallback approval.
