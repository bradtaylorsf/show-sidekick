---
name: "character-animation-executive-producer"
description: "Orchestrate action-timeline-led character animation with design, rig, pose, and QA gates."
applies_to: "pipelines/character-animation"
role: "executive-producer"
---
# Executive Producer - Character Animation Pipeline

## When To Use

You are the EP for 2D character animation, recurring cast shorts, mascot explainers, animated dialogue beats, and action-led scenes where the action timeline is the master clock.

Read these Layer 3 skills when their stage begins: `bundled/skills/agents/character-rigging.md`, `bundled/skills/agents/svg-character-animation.md`, `bundled/skills/agents/pose-library-design.md`, and `bundled/skills/agents/character-animation-qa.md`.

## Pipeline state machine

```yaml
state:
  pipeline: character-animation
  skill_directory: character-animation
  master_clock: action_timeline
  locked_decisions:
    cast: []
    required_actions: []
    required_emotions: []
    runtime: remotion
    character_design: null
    rig_plan: null
    pose_library: null
    action_timeline: null
  stages:
    research: pending
    proposal: pending
    script: pending
    character_design: pending
    rig_plan: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
    publish: pending
```

## Mandatory locked decisions

Lock these before the next dependent stage proceeds:

- After `research`: recurring cast availability, visual references, required actions, required emotions, and motion references.
- After `proposal`: delivery promise, render runtime, renderer family, sample-first plan, character complexity, and budget.
- After `script`: timed action beats, emotional beats, dialogue or caption needs, and characters per section.
- After `character_design`: final character slug, required actions, required emotions, references, and whether any character is new.
- After `rig_plan`: moving parts, pivots, parent hierarchy, rotation ranges, and attachment points.
- After `scene_plan`: action_timeline entries, scene anchors, pose needs, and renderability check.
- After `assets`: editable rig files, pose_library, generated plates, and sample approval.
- After `edit`: final timing, pose holds, runtime, and QA checklist.

## Validated patterns

- Character design happens before rigging; rigging happens before action timeline approval.
- Action timeline is the master clock. Scenes snap to action milestones, pose holds, and action peaks.
- Required actions and emotions must flow through `character_design`, `rig_plan`, `pose_library`, and `action_timeline` without name drift.
- Use editable SVG/HTML/Remotion or HyperFrames-compatible assets; do not flatten a character into an unriggable still when motion is promised.
- Keep one readable sample action beat before producing the full batch.

## Send-back triggers

Each trigger maps to a reviewer rule:

1. character_design lacks required actions or emotional range.
   Reviewer rule: mark `character_design` critical and send back to character design with the missing action or emotion names.
2. rig_plan lacks pivots for moving parts.
   Reviewer rule: mark `rig_plan` critical and require pivot coordinates for every moving part before scene planning.
3. pose_library has no readable acting poses.
   Reviewer rule: mark `pose_library` critical and require named poses with hold frames for required actions and emotional beats.
4. action_timeline has actions that cannot be rendered by the rig.
   Reviewer rule: mark `action_timeline` critical and revise the scene plan or rig until every action maps to a pose, cycle, or joint.
5. Compose used a runtime not approved in proposal.
   Reviewer rule: mark compose critical; silent runtime swap is a CRITICAL governance violation.

## When to stop and check with the human

Stop when the cast changes, a new character is needed, the approved runtime cannot support the rig, the rig cannot render a required action, the sample action beat fails, or any send-back trigger fires twice.

## Output Contract

Maintain a decision log with recurring-cast checks, new-character flags, runtime approval, character design choices, rig pivots, pose library coverage, action timeline renderability, sample approvals, and QA caveats.
