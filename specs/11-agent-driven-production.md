# 11 — Agent-Driven Production

## Philosophy

Show Sidekick is instruction-driven. The agent (Claude Code, Codex, or any harness reading the same skill markdown) **is** the production intelligence — it reads instructions, makes decisions, calls tools, checks its own work, revises, and presents to the human for approval. The code is the orchestration shell; the markdown skills are the brain.

This means the agent's behavior can be improved by editing prose — without rebuilds, without releases, without code review. Adding a new pipeline is a YAML manifest plus a handful of Markdown director skills, not a Python or TypeScript refactor.

## What the agent does

For each episode, the agent works through the pipeline's stages. At every stage:

1. **Reads the stage director skill** in full before doing any work in that stage.
2. **Reads Layer 3 vendor skills** before calling any generation tool (image, video, TTS, music). Vendor skills carry provider-specific prompt structure, parameter sweet spots, quality keywords.
3. **Announces decisions before paid actions.** Tool name, provider, model, reason, sample-or-batch. The human is never surprised by a charge.
4. **Calls tools through the registry**, never directly. The registry handles availability, fallback, cost tracking.
5. **Produces the canonical artifact** declared by the stage in the pipeline manifest.
6. **Self-reviews** the artifact against the stage's `review_focus` and `success_criteria` (see [`13-reviewer-protocol.md`](13-reviewer-protocol.md)).
7. **Revises if review finds critical issues** — up to two rounds, then passes with warnings.
8. **Checkpoints the artifact** with status `completed` or `awaiting_human` (see [`12-checkpoint-protocol.md`](12-checkpoint-protocol.md)).
9. **Records material choices in the decision log** with rationale and rejected alternatives (see [`14-decision-log.md`](14-decision-log.md)).
10. **Presents to the human for approval** when the stage's `human_approval` is `required` (or `optional` and interactive mode).

## Adaptation to show types

Pipelines + playbooks + show defaults compose to express any show type. The agent reads the resolved configuration and adapts:

- A **music video** pipeline tells the agent to build a cuesheet, snap scenes to downbeats, and align the climax shot to the chorus.
- A **WWII diary** pipeline tells the agent to use VO as master clock, pace scenes to 4-8 second sepia stills, and call into the cinematic asset library.
- A **product demo** pipeline tells the agent to drive Remotion scenes around captured screen recordings, with a talking-head avatar overlay.
- A **news-song** pipeline tells the agent to interleave PS2-era generated visuals with real source screenshots from a `sources.yaml` file.

None of these require new code. They require a manifest, director skills per stage, and (optionally) a playbook for the look.

## The agent checks its own work

This is the load-bearing pattern. Every stage runs a reviewer pass before checkpointing, and major productions run additional self-reviews on the rendered output. The agent uses concrete criteria (loaded from the manifest, the playbook, and meta skills) to evaluate its own output, finds issues, proposes fixes, and revises. The CHAI rules (see [`13-reviewer-protocol.md`](13-reviewer-protocol.md)) require findings to be **accurate, complete, and constructive** — a critical finding without a concrete proposed fix is downgraded.

This self-review loop is why instruction-driven agents produce coherent video at all: the agent is allowed to make mistakes, but it is required to notice them and fix them before showing the human.

## Character sheets, brand assets, and the asset stage

Recurring characters live in `shows/<show>/characters/<name>/` with:

- `character.yaml` — voice ID, visual description, persona, references
- `references/` — optional reference images for image generation

When the asset stage runs, the agent reads the cast declared on the episode (`episode.cast: [rag, agent, graph]`), resolves each to its character directory, and includes the character sheet's visual description in image generation prompts. Consistency across episodes comes from the persisted character sheet — the agent does not re-invent the character per episode.

Brand assets (`shows/<show>/brand/`) work the same way: palette, logo, typography are read once and threaded through every stage that needs them.

## The orchestration layer is thin

The harness runner is a small state machine. It loads context, plans stages, loops over them, and dispatches each one to the agent with the right inputs. It does not make creative decisions, choose providers, write prompts, or evaluate quality. Those are all the agent's responsibility, guided by the skills.

If you can express a creative decision in prose, it belongs in a skill. If it requires conditional logic over filesystem state, schemas, or tool registry data, it belongs in the harness.

## Why this works

- **Agents pick up context from prose.** Modern LLM agents read markdown skills extremely well. Telling them "the chorus scene snaps to the first downbeat after the section start" is more reliable than encoding that logic in TypeScript and exposing a `getChorusAnchor()` function.
- **Revisability is in writing.** A bad scene-director skill is fixable by editing the markdown. A bad orchestration step in TypeScript needs a rebuild and a release.
- **Skills compose with show overrides.** A show can shadow any director skill (see [`08-skills.md`](08-skills.md)) without forking the pipeline. New show types emerge from new manifests + new skills, not new code.
- **Self-review keeps quality consistent.** The agent is reliable at applying explicit criteria (review focus, success criteria, playbook rules). Letting it review its own work catches the same mistakes a human reviewer would catch — at agent speed.
