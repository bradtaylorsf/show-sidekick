---
name: executive-producer
description: Template for pipeline executive-producer skills using accepted state-machine, declarative-rules, or cross-stage-philosophy patterns.
applies_to: meta
cross_refs:
  - specs/11-agent-driven-production.md
  - bundled/skills/meta/reviewer.md
  - bundled/skills/meta/checkpoint-protocol.md
---
# Executive Producer Template

An executive producer (EP) skill is a pipeline-level governance skill. It owns cross-stage judgment that individual stage directors cannot see. Use it when a pipeline needs cumulative state, explicit gates, or a durable philosophy across stages.

The reference pipeline library used three successful EP patterns. Show Sidekick accepts all three.

## Pattern 1: State-Machine EP

Use this for pipelines where stage order, send-backs, approval gates, or budget state must be managed explicitly.

Best fits:

- animated explainer
- animation
- talking head
- screen demo
- avatar spokesperson

Required sections:

- `When To Use`
- `Why This Exists`
- `Prerequisites`
- `Cumulative State`
- `Execution Protocol`
- `EP-Specific Cross-Stage Checks`
- `Quality Gates Summary`
- `Execution Limits`
- `Common Pitfalls`

Core rules:

- Maintain an `EP_STATE` object with prior artifacts, budget, approved plan, revision counts, style anchors, runtime choice, and known risks.
- Execute stages serially when later stages depend on earlier review outcomes.
- Review each stage against schema, manifest review focus, success criteria, playbook constraints, and EP-specific cross-stage checks.
- Allow send-back to an earlier stage when the cheapest correct fix is upstream.
- Cap revision loops. Default: max 3 revisions per stage and max 1 send-back per stage pair unless the pipeline gives a stricter cap.

## Pattern 2: Declarative-Rules EP

Use this for pipelines whose governance is mostly a short set of non-negotiable rules rather than a full state machine.

Best fits:

- daily news
- localization dub
- character animation
- narrow capture/post workflows

Required sections:

- `When To Use`
- `Contract`
- `Stage Order`
- `Governance Rules`
- `Approval Gates`
- `Send-Back Triggers`
- `Common Pitfalls`

Core rules:

- State the pipeline contract in plain language.
- Name what the pipeline must not silently substitute.
- Keep stage order and approval gates explicit.
- List send-back triggers as concrete artifact or runtime failures.
- Prefer short rules over a giant state object when the pipeline does not need one.

## Pattern 3: Cross-Stage-Philosophy EP

Use this when the most important governance is a durable editorial philosophy that must survive many stages.

Best fits:

- documentary montage
- retrieval-first pipelines
- brand-led pipelines with a strong editorial stance

Required sections:

- `When To Use`
- `Philosophy`
- `Stages`
- `Core Tools`
- `Cross-Stage Rules`
- `Common Pitfalls`

Core rules:

- Start with the editorial principle, such as "retrieval-first, not generation-first."
- Carry source constraints, provenance, visual ethics, and pacing principles through every stage.
- Require rejected-source notes when clip candidates are declined for editorial reasons.
- Escalate any source or rights limitation before substituting generated material.

## Shared EP Contract

Every EP skill must:

1. Read the pipeline manifest and all relevant director skills before governing the stage sequence.
2. Preserve the approved proposal decisions unless a superseding decision is logged and approved.
3. Apply `bundled/skills/meta/reviewer.md` standards, including CHAI findings and the two-round review cap.
4. Apply `bundled/skills/meta/checkpoint-protocol.md` after each completed stage.
5. Use `bundled/skills/meta/announce-and-escalate.md` before paid calls, major changes, or substitutes.
6. Never hide fallback, downgrade, source-media, or runtime problems inside downstream stages.

## Starter Skeleton

```markdown
# Executive Producer - <Pipeline Name>

## When To Use
You are the EP for <pipeline>. You maintain cross-stage judgment that stage directors cannot hold alone.

## Contract
This pipeline produces <delivery promise>. It must not silently substitute <forbidden downgrade>.

## Stage Order
<stage-a> -> <stage-b> -> <stage-c>

## Governance Rules
- <rule tied to approval, runtime, source media, motion, budget, or quality>

## Approval Gates
- <stage>: <what the user approves>

## Send-Back Triggers
- <artifact field or rendered-output condition>: send back to <stage>

## Common Pitfalls
- <pipeline-specific failure mode>
```
