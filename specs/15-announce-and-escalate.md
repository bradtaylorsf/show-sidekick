# 15 — Announce and Escalate

## The decision communication contract

For any meaningful production decision, the agent communicates the decision **before** acting. The user should never have to infer which provider, model, or render path was chosen after the fact.

## Announce before paid execution

Before any paid or consequential generation call, the agent states:

- the exact tool name (as it appears in the registry),
- the provider,
- the model or provider variant,
- the reason the tool was chosen,
- whether the run is a sample or a batch.

Example:

> Generating 8 hero clips via the `higgsfield` tool (provider: higgsfield, model: kling-v2.1-pro). Reason: the brief is image-to-video for music-video hero shots, and this is the only provider configured for it on this machine. This is the full batch run; sample mode was already approved.
> Estimated cost: $2.40. Budget remaining: $3.82.

## Ask before major changes

The agent must ask the human before changing any of the following:

- switching provider,
- switching model family or variant,
- switching from video-led to still-led treatment,
- switching composition runtime (Remotion ↔ HyperFrames ↔ ffmpeg),
- dropping narration, music, or other approved creative elements,
- moving from sample mode to batch mode.

Minor prompt refinements inside an already approved provider / model / runtime path do not require separate approval, unless they materially change the creative direction.

## Present both composition runtimes (hard rule)

When both Remotion and HyperFrames are available on the machine (the registry reports both as `available: true`), the agent **must** present both options to the user before locking `render_runtime` at the proposal stage. The agent may recommend one with rationale — but silently picking a "default" is forbidden, even when the pipeline manifest suggests one.

The presentation must include, for each runtime:

1. A one-sentence plain-language description of what it's best at for *this specific brief*.
2. A one-sentence honest tradeoff (why it might not be the right pick here).
3. The agent's recommendation and reason, tied to the brief's delivery promise and visual approach.

The full shortlist — both runtimes plus ffmpeg when applicable — must be recorded in the `runtime` decision log entry. A decision log entry with only one runtime considered, when both were available, is a `critical` reviewer finding (see [`13-reviewer-protocol.md`](13-reviewer-protocol.md) → runtime swap detection).

**Exception:** if only one runtime is available, proceed with it but say so explicitly. Record the unavailable option in `options_considered` with `rejected_because: "runtime not available on this machine"` — the audit trail preserves the fact that the choice was constrained, not discretionary.

## Escalate blockers explicitly

When the approved path is blocked, the agent uses this structure:

1. **What was attempted.** Exact tool call(s) and parameters.
2. **What failed.** The error or unmet condition.
3. **Issue type.** Auth, provider access, tool bug, or prompt/design quality.
4. **What options exist next.** Concrete alternatives, each with a cost/quality note.
5. **Recommendation.** Which option the agent recommends, and why.

The agent **does not continue with a substitute path until the user approves.** Investigation and preparation are fine; execution is not.

## No unilateral substitutions

If the approved path is blocked, the agent may prepare alternatives but must not execute them without user approval. This applies especially to:

- provider swaps,
- model swaps,
- fallback tools,
- prompt-only substitutes for reference-driven generation,
- still-image animatics in place of true motion,
- silent render-runtime swaps.

Each non-trivial substitution that **does** get user approval generates a new decision log entry that supersedes the original.

## Recommendation style

When asking the user to choose, the agent should:

1. Provide the shortlist (typically 2–4 options).
2. Explain tradeoffs briefly.
3. Recommend one option.
4. Wait for approval before proceeding.

Do not list options without a recommendation. The user came for an opinionated tool, not a multiple-choice quiz. The recommendation can be wrong — the user will correct it — but the agent must take the position.

## Critical-request: motion-required content

For requests where the deliverable inherently depends on motion (sci-fi trailers, hype edits, avatar / agent videos, any brief whose promise depends on moving shots), the agent treats motion as a hard requirement:

- The runtime chosen at proposal must be confirmed available *up front*.
- Still-image fallback is forbidden. Do not quietly convert the job into a Ken Burns animatic, slide-based video, or proof-of-concept.
- Silent runtime swap is forbidden. If the chosen runtime becomes unavailable at compose time, surface a blocker — do not route to a different runtime without an approved decision log entry.
- Bubble critical issues immediately. If clip generation fails in a way that blocks the approved treatment, stop and tell the user.
- Do not spend more tokens or time on downgraded output unless the user explicitly approves the downgrade as an animatic or proof-of-concept.

## Why this matters

The agent's value depends on the user trusting it with paid actions. Trust comes from honest, granular communication: I am about to spend $X on Y because Z, and here is the alternative if you'd prefer it. The contract above is the minimum to keep that trust.
