# 12 — Checkpoint Protocol

## When to checkpoint

After a stage produces its canonical artifact AND passes review. Checkpoints are the save points of a pipeline — they enable resume-from-failure, human oversight, audit trails, and cost accounting.

## Where checkpoints live

```
projects/<show>/<episode>/
├── state.json                       # current pipeline state (current stage, cost, last decision)
├── checkpoints/
│   ├── idea.json                    # one checkpoint per completed stage
│   ├── script.json
│   ├── cuesheet.json
│   ├── scene_plan.json
│   └── ...
├── decisions.json                   # cumulative decision log
├── cuesheet.json                    # audio subsystem artifact (for audio-led pipelines)
└── assets/, renders/                # generated media
```

## Checkpoint statuses

| Status | Meaning |
|---|---|
| `in_progress` | The stage is currently running. Used to detect crashes and orphaned runs. |
| `completed` | Stage finished, artifact produced, review passed, no human approval needed (or already granted). |
| `awaiting_human` | Stage finished, artifact produced, review passed, but `human_approval: required` is gating the next stage. |
| `failed` | Stage could not produce a valid artifact after two review rounds. The pipeline halts here. |

## Checkpoint contents

Every completed or awaiting-human checkpoint contains:

```json
{
  "stage": "scene_plan",
  "status": "awaiting_human",
  "timestamp": "2026-05-12T15:42:00Z",
  "artifact": { /* the canonical artifact, validated against schemas/artifacts/<name>.schema.json */ },
  "review_summary": {
    "decision": "pass",
    "rounds": 1,
    "critical": 0,
    "suggestions": 2,
    "nitpicks": 1,
    "findings": [ /* full findings list */ ]
  },
  "cost_snapshot": {
    "stage_cost_usd": 0.42,
    "total_so_far_usd": 1.18,
    "budget_remaining_usd": 3.82
  },
  "tool_invocations": [ /* what was called, with seeds/model versions for reproducibility */ ]
}
```

## Resume protocol

At the start of any `predit build` or `predit resume` invocation, the harness:

1. Loads `projects/<show>/<episode>/state.json` if present.
2. Scans `projects/<show>/<episode>/checkpoints/` to determine the highest-completed stage.
3. Determines the next stage to run:
   - If the latest checkpoint is `completed`, advance to the next stage in the pipeline manifest.
   - If `awaiting_human`, surface the awaiting approval and prompt (interactive) or exit with that status (non-interactive).
   - If `failed`, prompt the user to revise or abort.
   - If `in_progress` but no process is running, treat as crashed — surface to the user and let them resume or revise.
4. Loads prior artifacts from preceding checkpoints into the agent's context for downstream stages.

## Human approval presentation

When a stage's `human_approval` is `required` (or `optional` in interactive mode), the harness prepares a presentation block and either prompts inline (interactive) or exits awaiting `predit approve` / `predit revise` (non-interactive).

```
## Stage complete: scene_plan

### Artifact summary
- 18 scenes spanning 3:14
- All scenes anchored to musical structure (3 sections, climax at 2:08)
- Cast: rag, agent, graph
- Hero shot: scene 11 "AGENT INTERVENES" → snapped to downbeat at 2:08.04

### Review findings
- Critical: 0
- Suggestions: 2 (note: shot variety in section 2 could be tighter; consider tighter cut)
- Nitpicks: 1

### Cost so far
$1.18 of $5.00 budget. Next stage (assets) estimates $2.40 full / $0.40 sample.

### Action
Approve to continue, revise with notes, or abort.
```

The agent's job is to make the presentation **honest**: include the findings the reviewer flagged (not just the wins), include the cost (so the human can refuse expensive downstream stages), and include the projected cost for what's next.

## Sample sub-checkpoint

For productions running in `--sample` mode, the harness writes a sample checkpoint after compose but before the user is asked to commit to the full run:

```
projects/<show>/<episode>/checkpoints/sample_v1.json
projects/<show>/<episode>/checkpoints/sample_v2.json
...
```

The sample checkpoint:

- References the rendered sample clip path.
- Records sample cost and projected full cost.
- Status is always `awaiting_human` — the user must approve before the full run begins.
- Is versioned so `predit revise <show>/<episode> "<note>"` can preserve each human revision request as its own sub-checkpoint.

The latest sample version is tracked in `projects/<show>/<episode>/state.json`:

```json
{
  "sample": {
    "latest_version": 2
  }
}
```

The runner uses `sample.latest_version` instead of scanning the checkpoint directory to find the newest sample.

## Key principles

1. **Always checkpoint completed work.** Even stages with `human_approval: never` produce a checkpoint, so resume works after a crash. The cost of an extra JSON file is zero; the cost of redoing work is high.
2. **Never skip approval on creative stages.** The pipeline manifest declares which stages are creative (`human_approval: required`); the harness enforces it. Idea, script, and scene-plan are typically required.
3. **Include cost snapshots on every checkpoint.** Approval is meaningless without the cost picture.
4. **Resume is the whole point.** If compose crashes, the user restarts and picks up at compose — not at idea. Designing for resume from day one keeps the harness honest about state.
5. **Be transparent in approval requests.** Don't bury the findings. The reviewer's job is to be the agent's adversarial conscience; the presentation's job is to surface that conscience to the human.
