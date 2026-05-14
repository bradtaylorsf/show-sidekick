---
name: announce-and-escalate
description: Announce consequential tool use before execution, ask before major changes, and escalate blockers without silent substitutions.
applies_to: meta
cross_refs:
  - specs/15-announce-and-escalate.md
  - bundled/skills/meta/decision-log.md
---
# Announce And Escalate

Use this skill before paid calls, consequential generation, provider/model/runtime changes, or any situation where the approved path is blocked.

## Pre-Execution Announce Template

Before a paid or consequential generation call, say:

```text
I am about to run <tool name> (provider: <provider>, model/variant: <model>).
Reason: <brief-specific reason this tool is the right fit>.
Scope: <sample | full batch | single asset>.
Estimated cost: <amount or zero-cost local>. Budget remaining: <amount>.
```

The tool name must match the registry name. Do not announce vague categories like "an image tool" when the registry has a concrete tool.

## Major-Change Gate

Ask for approval before changing any of these:

- Provider.
- Model family or provider variant.
- Composition runtime: Remotion, HyperFrames, or ffmpeg.
- Motion-led treatment to still-led treatment.
- Approved narration, music, character, source media, or visual approach.
- Sample mode to full batch mode.
- Budget ceiling or cost tier.

Minor prompt refinements within an already approved provider/model/runtime path do not need a new approval unless they materially change the creative direction.

## Present Both Composition Runtimes

At proposal time, when both Remotion and HyperFrames are available, present both options before locking `render_runtime`.

For each runtime, include:

1. One sentence describing what it is best at for this brief.
2. One honest tradeoff.
3. Your recommendation tied to the delivery promise.

When ffmpeg is realistic for the brief, present it too. For motion-required briefs, record ffmpeg in the decision log with the rejection reason `still-image-only; brief requires motion-led delivery.`

## Structured Blocker Template

When the approved path is blocked, stop and present:

```text
Blocked: <approved path>

What I attempted:
- <tool call, provider, model, important params>

What failed:
- <error, unmet condition, missing auth, unavailable runtime, quality failure>

Issue type:
- <auth | provider access | missing runtime | tool bug | prompt/design quality | source media problem>

Options:
1. <option> - cost/quality/time tradeoff
2. <option> - cost/quality/time tradeoff
3. <option> - cost/quality/time tradeoff

Recommendation:
<one option and why>

I will wait for approval before executing a substitute path.
```

Do not continue with a substitute path until the user approves it. Investigation and preparation are fine; execution is not.

## Motion-Required Guardrail

For requests whose promise depends on motion, such as sci-fi trailers, hype edits, avatar/spokesperson videos, character animation, music videos, and kinetic typography:

- Confirm the selected runtime and provider path are available up front.
- Do not convert to still-image animation, Ken Burns, or slideshow output unless the user explicitly approves a downgrade.
- Do not silently swap runtimes at compose time.
- If clip generation, rigging, lip-sync, or composition fails in a way that blocks the promise, surface the blocker immediately.
- Log any approved fallback as `fallback_decision` and any approved quality reduction as `downgrade_approval`.

## No Silent Substitutions

Silent substitutions are forbidden for provider swaps, model swaps, render runtime swaps, prompt-only substitutes for reference-driven generation, still-image animatics in place of true motion, and dropping committed narration/music/characters.

If the substitute is approved, write a new decision log entry that supersedes the original.
