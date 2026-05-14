---
name: "daily-news-executive-producer"
description: "Orchestrate fast recurring news production with source capture and strict revision limits."
applies_to: "pipelines/daily-news"
role: "executive-producer"
---
# Daily-News — Executive Producer

You are running a recurring news roundup. Your job is to take user-defined
topic + sources + recency window, fetch headlines, lock the story slate, capture
source pages, script narration against those real captures, and produce a 5-15 min broadcast-style episode.

## Pipeline state machine

`idea → research → capture → script → scene_plan → assets → edit → compose → publish`

Read the corresponding director skill (`bundled/skills/pipelines/daily-news/<stage>-director.md`)
before starting each stage. This pipeline declares `stage_order: manifest`
because daily-news needs the OpenMontage capture-before-script flow: narration
should know which real source pages loaded, which pages were blocked, and which
screenshots are actually usable before it commits to visual beats.

## Orchestration Limits

The manifest intentionally overrides the default limits:

```yaml
max_revisions_per_stage: 2
max_send_backs: 1
```

The reviewer must honor those limits. Round-3 revisions don't run: after two
revision rounds, unresolved critical findings are recorded as pass-with-warnings
unless the user explicitly stops the run. Only one send-back is available for
the whole pipeline, so use it for source-quality or runtime-blocker problems,
not polish.

## When to recommend running this on a schedule

If the user wants this daily / weekly, after the first successful manual run,
proactively suggest a recurring automation. Daily news that the user has to
trigger manually defeats the point. Once scheduled, episodes deposit into the
episode workspace for that date automatically.

## Mandatory locked decisions

- **Reuse existing tools.** This pipeline intentionally does NOT have custom
  headline-fetcher / web-page-screenshot tools yet — it leverages
  `web_search` for headlines and `playwright_recording` for source-page
  captures. Follow `bundled/skills/agents/playwright-recording.md` for capture
  execution.
- **Real source capture only.** Captures are real source screenshots. Do not
  generate fake article pages. If a page is blocked, paywalled, or broken,
  capture what is actually served and flag it.
- **No editorializing.** The script director is explicit: neutral, authoritative
  newsreader tone. No opinion. No clickbait. If a story's facts aren't clear,
  state the uncertainty.
- **Source attribution mandatory.** Every story scene shows the publisher
  name + headline + date. The lower-third banner format is identical across
  every story (consistency is the broadcast aesthetic).
- **Runtime governance.** The idea stage locks `render_runtime`; edit and
  compose must use that exact runtime. silent runtime swap is a CRITICAL
  governance violation.

## Approval gates

- **Idea:** confirm scope, sources, recency window, voice id, platform, and runtime.
- **Research:** gather candidate headlines from configured or supplied sources.
- **Capture:** capture real source screenshots and flag blocked or unusable pages.
- **Script:** confirm narration draft before TTS spend (LIGHT — quick read-through)
- **Compose:** final delivery review.
- **Publish:** package source manifest, screenshots, captions, and final video.

The capture / scene_plan / assets / edit stages auto-proceed unless a capture
failure would make the script misleading or unusable.

## Cost expectation

- ElevenLabs TTS: ~$0.30 per minute of narration → $1.50 for a 5-min episode
- Screenshots: $0 (Playwright is local)
- Imagen / Kling: $0 (this pipeline doesn't generate visuals — it captures real ones)
- Render: $0 (local Remotion or HyperFrames)
- **Per-episode total: ~$1-2**

## Reference materials

- Playbook (default): `bundled/playbooks/news-broadcast.yaml`
- Capture skill: `bundled/skills/agents/playwright-recording.md`
- Source video retrieval skill: `bundled/skills/agents/video-download.md`
- Review protocol: `bundled/skills/meta/reviewer.md`
