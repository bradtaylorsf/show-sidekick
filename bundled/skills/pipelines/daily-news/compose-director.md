---
name: "daily-news-compose-director"
description: "Render and self-review the daily news episode with broadcast chrome intact."
applies_to: "pipelines/daily-news"
stage: "compose"
produces: "render_report"
---
# Daily-News — Compose Director

Render the episode via the chosen runtime. Output: render_report + final_review.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Prior artifacts | `priorArtifacts.edit`, `priorArtifacts.assets`, `priorArtifacts.capture`, `priorArtifacts.idea` | Runtime lock, media, real screenshots, and show settings |
| Tools | `video_compose`, `audio_mixer`, `video_stitch` | Render and optional assembly |

Read `edit_decisions.render_runtime` before composing. silent runtime swap is a
CRITICAL governance violation; do not render with a different runtime unless the
user approved a new `render_runtime_selection` decision.

## Workflow

1. Materialize the composition workspace at `projects/daily-news/<date>/composition/`
2. Copy all assets (screenshots, narration mp3s, music bed) into the workspace
3. Generate the composition source (Remotion: a TSX entry that maps the
   scene_plan to React components; HyperFrames: an index.html similar to the
   music-video pattern but with broadcast chrome)
4. Lint + validate
5. Render to `projects/daily-news/<date>/renders/episode_<date>.mp4`

## Render specs

- Aspect: matches `brief.canvas` (1080×1920 vertical or 1920×1080 landscape)
- 30fps, H.264 + AAC
- Loudness target: -16 LUFS integrated, -1 dBTP true-peak (broadcast standard)
- Duration matches edit_decisions.canvas.duration_seconds within 1 sec

## Post-render self-review (mandatory)

Extract spot-check frames at:
- `0.5` (intro card visible)
- `<intro_end + 1>` (first story screenshot + lower-third)
- Every story's mid-point (lower-third still visible, narration playing)
- Every story-to-story transition
- `<duration - 2>` (outro card visible)

Verify:
- Lower-third banner format identical across all stories (no font drift, no
  positioning drift)
- Publisher attribution correct on every story (matches research_brief)
- Episode date visible on intro card and matches brief
- No screenshot has visible browser chrome (URL bar, scrollbar, cookie banner)
  unless intentional
- Captures are real source screenshots, not generated article pages or mocked
  browser content
- Narration audio is clear; music bed is ducked appropriately

## render_report artifact

```yaml
output_path: renders/episode_<date>.mp4
file_size_bytes: <stat>
duration_seconds: <ffprobe>
codec_video: h264
codec_audio: aac
resolution: <as canvas>
fps: 30
loudness_lufs: <integrated_lufs>
true_peak_dbtp: <max_true_peak>
render_runtime: <remotion or hyperframes>
render_time_seconds: <wall-clock>
self_review_completed: true
spot_frames_inspected: [...]
issues_flagged: []
```

## Final delivery

Present the file path to the user. For scheduled runs, this is the artifact
that gets uploaded to YouTube/social (future automation). For manual runs,
the user reviews and decides whether to publish.

If the show config has auto-publish hooks (future feature), trigger them here
after the user's optional approval.
