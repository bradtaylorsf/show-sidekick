---
name: "daily-news-idea-director"
description: "Lock the daily news angle, story slate, voice, platform, and runtime."
applies_to: "pipelines/daily-news"
stage: "idea"
produces: "brief"
---
# Daily-News — Idea Director

Capture the show parameters that define this episode. Most stay constant
across episodes (topic, sources, voice) — only the date and story slate change
day-to-day. This stage also turns the research candidate pool into an approved
episode slate.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Prior artifact | `priorArtifacts.research` | Candidate headlines and source metadata |
| Playbook | `bundled/playbooks/news-broadcast.yaml` | Broadcast lower-third and pacing defaults |
| Runtime contract | `specs/15-announce-and-escalate.md` | Present both viable composition runtimes before locking |

## Required inputs

1. **Topic scope** — e.g. "AI / startup / tech news", "world news",
   "crypto markets", "climate science"
2. **Source list** — minimum 3 publishers or RSS feeds. Examples:
   - For tech: `techcrunch.com`, `theverge.com`, `arstechnica.com`,
     `news.ycombinator.com`
   - For world: `reuters.com`, `apnews.com`, `bbc.co.uk/news`
   - For AI specifically: `huggingface.co/blog`, `anthropic.com/news`,
     `openai.com/blog`, `arxiv.org` (cs.AI new submissions)
3. **Recency window** — `24h` for daily, `7d` for weekly. Anything outside
   gets dropped at the research stage.
4. **Episode date** — defaults to today (UTC). For scheduled runs, use the
   schedule fire time.
5. **Episode length target** — 5-15 min typical. Determines how many stories
   to include (5-10 stories at 60-90 sec each).
6. **Target platform / aspect ratio** — `9:16` for TikTok/Reels/Shorts (3-5
   stories at 60s each = 5min vertical short), `16:9` for YouTube (full-length
   roundup).
7. **TTS voice id** — ElevenLabs voice id. Should be a polished newsreader.
   Save once in the brief; reuse across all episodes for the show's identity.
   If the user doesn't have a voice id, recommend one from the ElevenLabs
   library (e.g. "Antoni" for warm authoritative male, "Rachel" for clear
   professional female).
8. **Selected story slate** — choose 5-10 items from `research_brief.headlines`.
   Record story ids in final episode order; top/breaking story first, lighter
   or reflective story last.

## Runtime selection

This pipeline has no proposal stage, so the idea checkpoint must carry the
render-runtime conversation. Present both Remotion and HyperFrames when both
are available:

- Remotion: best for the repeated lower-third chrome, screenshots, stat cards,
  and React scene stack.
- HyperFrames: viable for HTML/CSS/GSAP broadcast packaging, but usually more
  setup for this screenshot-led workflow.

Recommend Remotion for daily-news unless the user specifically wants
HyperFrames-driven kinetic typography. Record the final choice as
`render_runtime` in the brief metadata and as a `render_runtime_selection`
decision when a decision log is present.

Do not let downstream stages choose a different runtime silently. silent runtime
swap is a CRITICAL governance violation.

## What to default for scheduled runs

When this pipeline fires from `/schedule`, it should pull the topic / sources
/ voice from a saved show config and only recompute the date. Suggest creating
a `projects/daily-news/.show-config.yaml` with the locked params after the
first manual run, so subsequent scheduled runs can skip the idea checkpoint.

## Brief artifact

```yaml
topic_scope: "tech and AI news"
sources:
  - techcrunch.com
  - theverge.com
  - news.ycombinator.com
  - anthropic.com/news
  - openai.com/blog
recency_window: "24h"
episode_date: "2026-05-08"           # ISO date
target_runtime_seconds: 300          # 5 min
target_platform: shorts
canvas: "1080x1920"
tts_voice_id: "<elevenlabs voice id>"
playbook: news-broadcast
include_music_bed: true              # subtle newsroom bed at -28dB during narration
render_runtime: remotion             # after presenting both Remotion and HyperFrames
selected_stories:
  - hl-001
  - hl-004
  - hl-007
```

## Approval gate

For first-ever run: full idea checkpoint, user confirms each input.
For scheduled runs: skip if `.show-config.yaml` exists; just confirm episode_date.
