# 17 — Self-Review of Rendered Output

## When to run

After `compose` finishes a render, **before** the harness presents the output to the user. This is the agent's final pass to confirm that what was rendered matches what was promised, that the file plays, that audio and visuals are coherent, and that no silent downgrade happened.

The result is a `final_review` artifact attached to the compose checkpoint.

## Required checks

| Check | What it confirms | Severity if it fails |
|---|---|---|
| `technical_probe` | The file plays; container is valid; duration / resolution / framerate match the proposal | critical |
| `visual_spotcheck` | A sampling of frames shows the planned content (right characters, right brand, no missing assets) | critical / suggestion depending on extent |
| `audio_spotcheck` | Narration is present (when expected), music is present (when expected), no clipping or silence-where-there-shouldn't-be | critical / suggestion |
| `promise_preservation` | The delivery promise from proposal is honored. No silent downgrade from motion-led to still-led. No runtime swap unrecorded. No dropped narration or music. | critical |
| `subtitle_check` | Captions / subtitles present if the pipeline declared them; word-level timing accurate if word-sync was requested | suggestion |

## Probe data

`technical_probe` uses ffprobe:

```ts
{
  container: "mp4",
  duration_s: 194.2,
  duration_promised_s: 194.0,
  width: 1080,
  height: 1920,
  framerate: 30,
  video_codec: "h264",
  audio_codec: "aac",
  audio_channels: 2,
  bitrate_kbps: 6200
}
```

Validation rules:

- `duration_s` within ±0.5s of the planned duration.
- Resolution and aspect ratio match the pipeline's declared aspect.
- File is openable by ffprobe without errors.

## Visual spotcheck

Sample at least 4 frames distributed across the timeline (e.g. 10%, 35%, 65%, 90%). For each:

- Confirm the visible content matches the scene at that timestamp in the scene plan / edit decisions.
- Confirm asset paths in the scene reference files that exist and rendered correctly (no black frames, no error overlays, no placeholder text).
- Confirm characters when present match the character sheet (no wrong-character substitutions).

When a hero / climax scene exists, sample one extra frame inside it specifically.

## Audio spotcheck

Use ffprobe to confirm audio stream presence, then sample short windows at the start, middle, and end:

- Narration windows have measurable energy in the expected frequency range.
- Music windows have content (not silence).
- No window shows clipping or runaway gain.
- The mix doesn't bury narration under music in narration windows.

If a cuesheet exists and word-level captions are part of the deliverable, validate that caption timing aligns with whisper transcript timestamps within ±150 ms.

## Promise preservation

Read the delivery promise from the proposal artifact. Check the rendered output against it:

- If the promise was motion-led, verify motion ratio in the cuts is sufficient (typically ≥ 50% motion cuts for motion-led briefs).
- If the promise locked a render runtime, verify the actual runtime that produced the render matches.
- If narration or music was committed at proposal, verify both are present.
- If the brief was reference-driven, verify the elements the user explicitly loved are still present.

Set `silent_downgrade_detected: true` if any of these fail. A `true` value here is **critical** and the pipeline must not present the output to the user without flagging it.

## Outcome

```ts
{
  status: 'pass' | 'revise' | 'fail',
  checks: {
    technical_probe: { /* probe data + verdict */ },
    visual_spotcheck: {
      frames_sampled: number,        // minimum 4
      findings: [...]
    },
    audio_spotcheck: {
      narration_present: boolean,
      music_present: boolean,
      caption_sync_accuracy: number,  // 0..1; (words_within_±150ms / total_words)
      findings: [...]
    },
    promise_preservation: {
      delivery_promise_honored: boolean,
      silent_downgrade_detected: boolean,
      runtime_swap_detected: boolean,
      runtime_swap_check: string,     // human-readable: "ok — proposal=hyperframes, edit=hyperframes, render=hyperframes"
      motion_ratio_actual: number,    // 0..1
      render_runtime_used: 'ffmpeg' | 'remotion' | 'hyperframes',
      findings: [...]
    },
    subtitle_check: {
      present: boolean,
      accuracy_within_150ms: number   // 0..1
    },
    transcript_comparison?: {         // optional, only when script artifact exists
      word_accuracy: number,          // 1.0 = perfect match against script
      missing_words_pct: number       // percent of script words absent from rendered audio
    }
  },
  issues_found: [/* aggregated findings */],
  recommended_action: 'present_to_user' | 're_render' | 'revise_edit' | 'revise_assets' | 'block'
}
```

### Threshold table

| Check | Pass threshold | Suggestion below | Critical below |
|---|---|---|---|
| `visual_spotcheck.frames_sampled` | ≥ 4 | — | < 4 |
| `audio_spotcheck.caption_sync_accuracy` | ≥ 0.95 | < 0.95 | < 0.80 |
| `subtitle_check.accuracy_within_150ms` | ≥ 0.95 | < 0.95 | < 0.80 |
| `promise_preservation.motion_ratio_actual` (motion-led briefs) | ≥ 0.70 | < 0.70 | < 0.50 |
| `transcript_comparison.word_accuracy` (when script exists) | ≥ 0.80 | < 0.80 | — |

Any `silent_downgrade_detected: true` or `runtime_swap_detected: true` (without a logged `render_runtime_selection` decision that supersedes the original) is **critical**, regardless of other thresholds.

## What happens on each outcome

- **pass** → the harness presents the render to the user.
- **revise** → the harness reports the issues to the agent, which decides whether to re-render automatically (e.g. a missing subtitle track is regeneratable cheaply) or surface to the user.
- **fail** → the harness halts. The user is shown the issues and asked how to proceed. The pipeline **must not** advance to publish or hand-off stages on a failing self-review. The rendered output is preserved at `projects/<show>/<episode>/renders/final-failed.mp4` so the user can inspect it before deciding to retry, revise, or `showkick approve --force` (audited).

## Why this is non-negotiable

The compose stage is where every prior decision concretizes. A render that plays but is silently off-promise is the single most damaging failure mode — the user thinks they got what they asked for, but they didn't. The final self-review catches this before the user opens the file.

A pipeline that skips the final self-review is treated as a contract violation by the reviewer (see [`13-reviewer-protocol.md`](13-reviewer-protocol.md) → final-self-review check). The compose checkpoint is incomplete without a `final_review` artifact.
