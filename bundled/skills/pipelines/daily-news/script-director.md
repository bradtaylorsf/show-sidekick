---
name: "daily-news-script-director"
description: "Write neutral, source-attributed broadcast narration for selected stories."
applies_to: "pipelines/daily-news"
stage: "script"
produces: "script"
---
# Daily-News — Script Director

Write the narration. Newsreader tone, neutral, authoritative. No opinion.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Prior artifacts | `priorArtifacts.idea`, `priorArtifacts.research` | Approved story slate and source facts |
| Policy | `bundled/skills/meta/reviewer.md` | Two-round review limit and source-attribution checks |

## Per-story narration block

15-30 words = 5-10 sec at broadcast pace (130-150 wpm). For a 5-min episode
with 5 stories, that's 5 × 8 sec narration + ~20 sec of intro/outro/breathing
room = ~60 sec narration in a 300 sec episode. The other ~240 sec is screenshot
hold + lower-third reading time.

Wait — that math is off for daily news. Let me reset: in a 5-min news show,
each story should be ~50-60 sec of TOTAL screen time, of which 30-45 sec is
narration. So for each story:

- 30-45 sec of narration → 75-115 words
- 5-10 sec of screenshot reveal + headline read time before narration starts
- 5 sec breather after narration before the next story

Per-story narration is 2-3 sentences:
1. Lead sentence — what happened, who's involved
2. Detail sentence — the context that makes it news-worthy
3. (Optional) Implication sentence — what to watch for next

## Tone rules

- **Neutral.** "Anthropic announced today that Claude 4.7 will support 1M
  token contexts." Not "OpenAI is finally catching up" or "Anthropic crushed
  the competition."
- **Authoritative.** Active voice. Concrete nouns. No "could", "might",
  "perhaps" unless the source genuinely is speculative.
- **Source-attributed.** Every story names the publisher in the first
  sentence. "According to TechCrunch..." or "The Verge reports..." or "In a
  blog post on the Anthropic site..."
- **No editorializing.** If you want opinion content, that's a different
  pipeline.
- **Plain language.** Newsreader cadence — assume listener doesn't know the
  background. Define jargon on first use.

## Script artifact

```yaml
intro:
  text: "It's Friday, May 8th. Top tech and AI stories of the past 24 hours."
  estimated_duration_seconds: 5

stories:
  - story_id: hl-001
    publisher: TechCrunch
    headline: "<headline as captured>"
    narration: "<2-3 sentence newsreader narration>"
    estimated_duration_seconds: 35
    source_attribution: "TechCrunch — May 8"
    flags: []                          # e.g. ["paywall_attribution_required"]

outro:
  text: "That's today's roundup. Same time tomorrow."
  estimated_duration_seconds: 4

total_estimated_duration_seconds: <sum>
```

## Capture Handoff

In this repo, `capture` runs after `script`, so do not assume screenshot quality
flags are already known. Instead:

- include the source URL and publisher for every story so capture can find the
  real page,
- write attribution that remains honest if a page later proves paywalled,
- leave a `capture_notes` or `source_access_notes` field when a URL already
  looks risky from research,
- if capture later returns `page_load_status != 200` or a hard paywall, use the
  single allowed send-back (`max_send_backs: 1`) only when the story must be
  replaced or materially rewritten.

## Approval gate (LIGHT)

Show the user the full script as a single readable block. They'll catch
factual errors, awkward phrasing, or stories that read worse in narration
than they did in headline form. Cheap to iterate here ($0).

After approval, the asset stage spends real money on TTS — so make sure the
script is locked.
