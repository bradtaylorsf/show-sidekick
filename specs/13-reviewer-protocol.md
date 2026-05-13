# 13 — Reviewer Protocol

## When to review

After every pipeline stage produces its artifact, **before** checkpointing. The reviewer is the quality gate between "work done" and "work accepted." No exceptions — every stage gets reviewed.

The agent reviews its own work. The reviewer is advisory, not blocking — it surfaces findings and proposes fixes, but the harness never refuses to advance past the second revision round.

## The CHAI rules

Findings ≠ critiques. A finding identifies a problem; a critique tells the next round *how to fix it*. The CMU/Harvard CHAI research showed that critique quality, measured on three axes, governs downstream output quality.

**Accurate.** Every finding must reference a concrete artifact field, line number, or visible asset frame. Forbid hallucinated criticism — if the reviewer cannot point to *where* the problem is, the finding is downgraded to `investigation`.

**Complete.** A reviewer pass that catches one mistake while missing a second is worse than scoring "needs another pass" and continuing. If the reviewer finds one critical issue, it must scan for the rest of the same class before returning. Pattern-match: where else in this artifact could the same mistake be hiding?

**Constructive.** Every `critical` finding **must** propose a concrete fix, not just identify the problem. "Caption is wrong" → "Caption says 'man on the right'; the man is on the left of the frame. Replace with 'the man on the left.'" If the reviewer cannot propose a fix, the finding is labeled `investigation`, not `critical`.

Removing any of these three properties measurably degrades pipeline output. The reviewer is a choke point — it must be rigorous.

## Protocol

### 1. Load review context

- The pipeline manifest's `review_focus` items for this stage.
- The manifest's `success_criteria` items for this stage.
- The active playbook's `quality_rules` (if a playbook is in effect).
- The produced artifact itself.

### 2. Schema validation

Non-negotiable first check. Validate the artifact against its JSON schema in `schemas/artifacts/<name>.schema.json`. A schema validation failure is `critical` and must be fixed before any further review work.

### 3. Review against focus items

For each `review_focus` item:

1. Evaluate the artifact against the criterion.
2. Assign a severity:
   - `critical` — must fix before proceeding. **Carries a `proposed_fix` with concrete replacement text, exact field value, or specific corrective action.** A critical finding without a proposed fix is downgraded to `investigation`.
   - `suggestion` — should fix. Improves quality but doesn't block. **Carries a `proposed_change`** describing how to improve.
   - `nitpick` — could fix. Minor polish; may stand alone without a proposed change.
   - `investigation` — a real concern but the reviewer cannot pinpoint the fix. Surface it but do not block.
3. Write a specific, actionable finding.

**Good finding:** "Section 3 narration is 180 words over a 10-second window — that's 1080 wpm, unspeakable. Cut to 25 words."

**Bad finding:** "Script might be too long."

### 4. Cross-check against playbook

When a playbook is active, verify color references match the palette, transitions are in the allowed set, pacing rules are respected, and asset descriptions include the playbook's style cues. Each violation is a `suggestion`.

### 5. Evaluate success criteria

For each `success_criteria` predicate in the manifest, check whether the artifact satisfies it. Unmet criteria become `critical` findings.

### 6. Decide

| Findings | Action |
|---|---|
| 0 critical | **Pass** — proceed to checkpoint. Note suggestions on the record. |
| 1+ critical | **Revise** — apply proposed fixes, re-run review (max 2 rounds). |
| After round 2, still critical | **Pass with warnings** — proceed anyway, record unresolved issues. Never block indefinitely. |

### 7. Record the review

```yaml
stage: scene_plan
round: 1
decision: pass | revise | pass_with_warnings
findings:
  - severity: critical
    title: "Hero scene not anchored to climax"
    location: "scene_plan.scenes[10]"
    description: "Scene 11 ('AGENT INTERVENES') ends at 2:06.5 — climax is at 2:08.04."
    proposed_fix: "Move scene 11 to start at 2:08.04 (downbeat at section 2 start). Extend prior scene 10 by 1.54s."
    patch:                       # optional structured patch — see "Proposed fix specificity" below
      artifact_path: "scene_plan.scenes[10].start_s"
      new_value: 128.04
    status: pending | fixed | accepted | deferred
summary:
  critical: 0
  suggestions: 2
  nitpicks: 1
  success_criteria_met: 4
  success_criteria_total: 4
```

The review record is attached to the checkpoint.

### Proposed-fix specificity (CHAI enforcement)

A `proposed_fix` on a `critical` finding must be **specific enough that a fresh agent can apply it without further interpretation**. The harness applies this heuristic at validation time:

A `proposed_fix` is *specific* if **at least one** of the following holds:
- A `patch` object is present with `artifact_path` and `new_value`.
- The text is ≥ 40 characters AND contains at least one specific token (a number, an `ALLCAPS_IDENTIFIER`, a `"quoted string"`, or a file path).

A `critical` finding whose `proposed_fix` fails this heuristic is **automatically downgraded to `investigation`**, with the original critical wording preserved in `description`. The downgrade emits a structured warning so reviewers can see when their fixes weren't specific enough.

This heuristic is the *minimum bar*, not the target. Aim for `patch` objects on every critical finding when the fix is mechanically applicable.

## Specialty review passes

Depending on what artifacts exist, additional review passes run:

### Reference alignment

Triggered when the production references an analyzed source video (a `video_analysis_brief` artifact exists). Checks:

- **Grounding** — does the output cite specific findings from the reference, or invent things? Mismatches are `critical`.
- **Differentiation** — does the output differ from the reference, or copy it? Carbon copies are `critical`.
- **Promise preservation** — are the elements the user specifically loved still present? Missing them is `suggestion`.

### Decision log audit

Runs from the proposal stage onward. Checks:

- A decision log exists; coverage includes every material choice (provider, model, runtime, playbook, music, voice).
- Each decision has ≥ 2 `options_considered` (not just the picked one).
- Reasons aren't boilerplate ("best option" is not a reason).
- Confidence values are realistic (everything at 1.0 is suspicious).

See [`14-decision-log.md`](14-decision-log.md).

### Creative differentiation

Runs at `scene_plan` and `edit`. Six checks distinct from the variation checker (which contributes one of them):

1. **Variation score** (from REV-10's variation checker) — `score ≤ 2` is critical, `≤ 3` is suggestion.
2. **Playbook alignment** — does the active playbook fit this content? (e.g. cinematic trailer against `clean-professional` is a mismatch.)
3. **Shot language completeness** — every scene has `shot_size` and `shot_intent`; hero moments have full shot_language across all 6 fields.
4. **`renderer_family` match at edit** — `edit_decisions.renderer_family` matches the proposal's choice. Unlogged change → critical.
5. **`render_runtime` match at edit and compose** — `render_runtime` in edit_decisions and compose's `render_report` matches proposal's locked runtime. Unlogged change → critical.
6. **Runtime-selection-presented-both-options at proposal** — when both Remotion and HyperFrames are available, the `render_runtime_selection` decision lists both in `options_considered`. Single option considered when both were available → critical.

Implemented as `REV-12` in the implementation guide.

### Delivery promise

Runs at `edit` and `compose`. The proposal stage locks a delivery promise (e.g. "motion-led cinematic trailer"). Subsequent stages must not silently downgrade the deliverable to still-led, slideshow-style, or otherwise off-promise output. Detected downgrades are `critical`.

### Runtime swap detection

Runs at `compose`. The `render_runtime` chosen at proposal must match the runtime that actually rendered the output. A silent swap (e.g. proposal locked HyperFrames; compose ran Remotion because HyperFrames was unavailable, without a logged `runtime_selection` decision) is `critical`.

### Source media understanding

Runs when the user provided source media. The agent must have inspected each file (probe data exists, content summary is grounded in the probe, not in the filename). Plans that assume content the probe doesn't support are `critical`.

### Final self-review of rendered output

After `compose`, before presenting the render to the user. See [`17-self-review-of-output.md`](17-self-review-of-output.md). Includes technical probe, visual spotcheck, audio spotcheck, promise preservation, subtitle check.

## Key principles

1. **Be specific, not vague.** "Weak hook" is useless. "Hook asks a question but doesn't create urgency — try leading with the surprising stat from key_point #2" is actionable.
2. **Severity discipline.** Don't inflate. A missing schema field is `critical`. A wordy paragraph is `suggestion`. A comma splice is `nitpick`.
3. **Two rounds max.** The goal is shipping, not perfection. After two rounds, pass with warnings and move on.
4. **Review the artifact, not the process.** What matters is the output, not whether the agent took an unusual path to get there.
5. **Playbook is law.** If the playbook says "no more than 3 colors on screen," that's a constraint, not a suggestion. Violations are always flagged.
