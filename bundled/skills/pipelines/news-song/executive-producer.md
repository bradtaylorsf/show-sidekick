---
name: "news-song-executive-producer"
description: "Orchestrate Brad's news-song workflow with source-vs-lyric-art governance, PS2 sample-first defaults, and audio-led timing."
applies_to: "pipelines/news-song"
role: "executive-producer"
---
# Executive Producer - News Song Pipeline

## When To Use

You are the EP for audio-led news songs: political rap, protest music videos, and PS2-era source-backed music pieces where the song drives timing and the source policy drives truthfulness.

## Pipeline state machine

```yaml
state:
  pipeline: news-song
  skill_directory: news-song
  master_clock: audio
  canvas: "1920×1080 landscape (16:9) master with 1080×1920 vertical derivative"
  sample_scope: "15-20 sec no-caption PS2 sample"
  max_scene_duration: "5.0 seconds"
  orchestration:
    max_revisions_per_stage: 3
    max_send_backs: 3
  locked_decisions:
    content_mode: null
    track: null
    lyrics: null
    sources_yaml: null
    visual_benchmark: "PS2-era political news-song"
    runtime: hyperframes
    sample_first: null
    caption_mode: none
    section_accent_colors: {}
  stages:
    cuesheet: pending
    source_review: pending
    idea: pending
    script: pending
    scene_plan: pending
    capture: pending
    assets: pending
    edit: pending
    compose: pending
```

## Mandatory locked decisions

- Content mode must be `sourced-political-news-song` or `source-free-protest-music-video`.
- `sourced-political-news-song` requires real source URLs and real source screenshots.
- `source-free-protest-music-video` is allowed to be purely lyrical/protest imagery, but it must not imply source-backed factual evidence.
- Canvas is `1920×1080 landscape (16:9) master with 1080×1920 vertical derivative`.
- Manual smoke scope is a `15-20 sec` no-caption PS2 sample before full production.
- Maximum scene duration is `5.0 seconds`.
- Orchestration is `max_revisions_per_stage: 3` and `max_send_backs: 3`.
- Caption mode defaults to none for the PS2 sample; source flyouts can still appear.
- Do not overdescribe faces. The PS2 look works through silhouette, mood, lighting, camera movement, and nostalgia.
- News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.
- Runtime changes require approval; silent runtime swap is a CRITICAL governance violation.
- Sample-first is mandatory for any production estimated > $1 or > 15 min.

## Validated patterns from named productions

Treat these blocks as production defaults unless the user explicitly changes the workflow.

### Shell's Love Tap learning (deep-URL specificity)

Shell's Love Tap learning (deep-URL specificity): capture succeeds when sources point at exact article, report, chart, transcript, or data-release URLs rather than publisher homepages or search result pages. For sourced news-song work, reject vague source references before capture; deep URLs prevent later evidence ambiguity.

### BLS/FRED browser-block note

BLS/FRED browser-block note: official statistics sites may block browser automation or return interstitials, so a blocked screenshot is not permission to generate a fake chart. Capture what is served, flag the source, and use an attributed source flyout or alternate deep URL only after documenting the substitution.

### Source flyout HUD timing rules

Source flyout HUD timing rules: source flyouts enter after the relevant lyric or claim lands, hold long enough to read publisher, headline, and date, then exit before the next major beat or vocalist phrase. Default timing is 0.18s enter, 1.2-2.0s readable hold, and 0.16s exit unless the cuesheet forces a shorter evidence beat.

### PS2-era visual treatment (low-poly, compressed textures, polygon edges)

PS2-era visual treatment (low-poly, compressed textures, polygon edges): lyric-art scenes should use low-poly geometry, compressed textures, visible polygon edges, vertex lighting, baked shadows, foggy render distance, CRT glow, VHS tape noise, and dramatic PS2 cutscene camera language.

### Per-section accent color (matches music-video pattern)

Per-section accent color (matches music-video pattern): assign one accent color per concept, source cluster, or argument section, then keep that color consistent across lyric-art prompts, source flyouts, HUD borders, and beat-drop tags.

## Content modes

`sourced-political-news-song`:

- Use when the episode makes timely or factual claims tied to news, politics, data, courts, agencies, campaigns, markets, or public officials.
- Requires source review and capture of real publisher/source screenshots with `provider = playwright_recording`.
- Scene kinds may include `scene_kind: news-screenshot` for real evidence and `scene_kind: lyric-art` for generated PS2 metaphor.
- Every source flyout must point back to a real source record.

`source-free-protest-music-video`:

- Use when the song is an evergreen protest, satire, or issue piece without source-backed claims.
- Requires no source screenshots; capture writes a skipped/no-op manifest or is bypassed by the agent.
- Scene kinds should be `scene_kind: lyric-art` only.
- Do not create fake articles, fake news screenshots, fake agency pages, or implied source evidence.

## When to stop and check with the human

Stop when:

- Any production estimate crosses `$1` or `15 min`; Sample-first is mandatory for any production estimated > $1 or > 15 min.
- The human has not approved the `15-20 sec` no-caption PS2 sample.
- The content mode is ambiguous between `sourced-political-news-song` and `source-free-protest-music-video`.
- A sourced claim lacks a deep URL or capture fails in a way that changes the evidence.
- A scene would mix generated imagery with a news screenshot as though both were evidence. News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.
- The scene duration would exceed `5.0 seconds`.
- A runtime, provider, model, canvas, caption mode, or source policy would change.
- The render path changes without logged approval; silent runtime swap is a CRITICAL governance violation.

## Reference materials

- `.show-sidekick/skills/meta/announce-and-escalate.md`
- `.show-sidekick/skills/meta/reviewer.md`
- `.show-sidekick/skills/meta/sample-first.md`
- `.show-sidekick/skills/core/hyperframes.md`
- `.show-sidekick/skills/agents/higgsfield-generate.md`
- `.show-sidekick/skills/agents/playwright-recording.md`

## Output Contract

Maintain a decision log with content mode, track, lyrics, source file, source-review result, capture decisions, sample-first decision, PS2 visual benchmark, prompt modules used, section accent colors, provider/model choices, runtime lock, caption mode, source flyout timing, and any human-approved changes.
