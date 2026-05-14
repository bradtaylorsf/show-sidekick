---
name: checkpoint-protocol
description: Write stage checkpoints, approval blocks, sample checkpoints, and resume state.
applies_to: meta
cross_refs:
  - specs/12-checkpoint-protocol.md
---
# Checkpoint Protocol

Use this after a stage produces its canonical artifact and passes review. Checkpoints are the pipeline save points: resume, human approval, audit trail, and cost accounting all depend on them.

## When To Checkpoint

Checkpoint every completed stage unless a manifest explicitly marks it as non-checkpointing. Creative stages with human approval become `awaiting_human`; non-creative stages normally become `completed`.

Valid statuses:

| Status | Meaning |
|---|---|
| `in_progress` | Stage is running; used to detect crashes |
| `completed` | Artifact passed review and can feed the next stage |
| `awaiting_human` | Artifact passed review but approval is required |
| `failed` | Artifact could not be made valid after the review cap |

## Where Checkpoints Live

```text
projects/<show>/<episode>/
  state.json
  decisions.json
  checkpoints/
    idea.json
    script.json
    scene_plan.json
    assets.json
```

## Protocol

### Step 1: Read Manifest Policy

Read the stage entry in the pipeline manifest:

- `produces`: canonical artifact name.
- `human_approval`: `required`, `optional`, or `never`.
- `review_focus` and `success_criteria`: pass into reviewer.

### Step 2: Review First

Before writing a successful checkpoint, run `bundled/skills/meta/reviewer.md`:

- Validate the artifact schema.
- Apply review focus, success criteria, playbook checks, and specialty passes.
- Revise up to two rounds when critical findings are fixable.

### Step 3: Prepare Checkpoint Data

Each completed or awaiting-human checkpoint includes:

- stage slug
- status
- timestamp
- canonical artifact
- review summary
- cost snapshot
- tool invocations with providers, models, seeds, and relevant params
- decision log reference

### Step 4: Write The Checkpoint

Use the harness checkpoint API or CLI path, not ad-hoc JSON writes. The file must validate against the checkpoint schema and the artifact schema declared by `produces`.

### Step 5: Present Approval Blocks

When approval is required, present:

```markdown
## Stage complete: <stage>

### Artifact summary
- <specific summary of what was produced>

### Review findings
- Critical: <count>
- Suggestions: <count>
- Nitpicks: <count>

### Cost so far
<spent> of <budget>. Next stage estimate: <sample/full when known>.

### Action
Approve to continue, revise with notes, or abort.
```

Be honest. Include real reviewer concerns and projected downstream cost.

### Step 6: Resume

At the start of any build or resume:

1. Load `projects/<show>/<episode>/state.json` if present.
2. Scan checkpoints for the highest completed pipeline stage.
3. If the latest checkpoint is `completed`, advance to the next manifest stage.
4. If `awaiting_human`, present the approval block and stop in non-interactive mode.
5. If `failed`, surface the failure and ask whether to revise or abort.
6. If `in_progress` appears orphaned, report a crash/recovery state and resume from the last valid completed checkpoint.

## Sample Sub-Checkpoint

For sample-first productions, write sample checkpoints after a representative sample render and before full batch approval:

```text
projects/<show>/<episode>/checkpoints/sample_v1.json
projects/<show>/<episode>/checkpoints/sample_v2.json
```

Sample checkpoints are always `awaiting_human`. They include sample clip path, sample cost, projected full cost, and revision notes. Track the latest sample version in `state.json` instead of guessing from filenames.

## Key Principles

1. Always checkpoint completed work.
2. Never skip required approval on creative stages.
3. Include cost snapshots.
4. Resume from the latest valid checkpoint, not from scratch.
5. Surface reviewer findings instead of hiding them.
