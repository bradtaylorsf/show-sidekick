---
name: "daily-news-research-director"
description: "Find timely, attributed story candidates for a recurring news roundup."
applies_to: "pipelines/daily-news"
stage: "research"
produces: "research_brief"
---
# Daily-News — Research Director

Fetch 8-12 candidate headlines via `web_search`. This stage produces a
candidate pool, not the final slate. The idea stage chooses and orders the
5-10 stories that become the episode.

## Input Resolution

Read `priorArtifacts.idea` first. The idea stage should already have locked
`topic_scope`, `sources`, `recency_window`, `episode_date`, target platform,
voice, and runtime. If anything is missing, fall back to episode inputs, show
defaults, or a saved recurring-run config in the project workspace.

If none of those provide enough scope, produce a blocking `research_brief`
that asks the idea stage to collect sources and recency before retrying.

## Search strategy

For each configured source, run a `web_search` query with:

- Site filter: `site:<source>`
- Recency filter: results from the last `recency_window` (24h default)
- Topic relevance: include `topic_scope` keywords
- Order: by recency (newest first)

Example query: `site:techcrunch.com AI news` with `recency: 24h`.

Run searches in parallel across sources to keep this stage fast (~30 sec total
for 5 sources).

## Per-headline data to capture

```yaml
headlines:
  - id: hl-001
    publisher: TechCrunch
    title: "<the actual headline>"
    url: <full url>
    date: "2026-05-08T14:23:00Z"
    summary: "<1-2 sentence summary from the search snippet>"
    relevance_score: 0.85   # heuristic: keyword match + recency
    deduplication_key: "<normalized topic — used to group dupes>"
```

## Deduplication

Multiple publishers often cover the same story. Group by topic similarity:

- Same headline ±3 words → keep the most authoritative source
- Same key entities (company names, product names) within 24h → likely same story
- Pick the source with the highest editorial standard (publisher rank) when
  collapsing duplicates

## Categorization (optional)

If the brief topic_scope is broad (e.g. "tech news"), categorize headlines
into 2-4 buckets so the user can pick from each (e.g. AI / startup /
regulation / hardware). For narrow scopes (e.g. "Anthropic news only"), skip
categorization.

## Handoff To Idea

Present the 8-12 candidates as a numbered list with publisher + headline +
1-line summary. Suggest a 5-10 story slate and editorial order, but do not lock
it here; the idea stage records `brief.selected_stories` after user approval.

## Failure handling

- If `web_search` returns <3 candidates total across all sources, surface this
  as a blocker — the day might be too quiet or the sources are misconfigured.
- If a specific source returns 0 results, note it but don't fail — other
  sources cover the deficit.
- If the recency window has zero coverage (e.g. weekend dead zone), suggest
  widening to `48h` or `72h`.
