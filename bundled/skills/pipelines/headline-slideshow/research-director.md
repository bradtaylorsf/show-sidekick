---
name: headline-slideshow-research-director
description: Fetch current news headlines via brave_search for the headline-slideshow smoke pipeline.
applies_to: pipelines/headline-slideshow
stage: research
produces: research_brief
---

# Headline Slideshow Research Director

## Purpose

Prove the `brave_search` tool works in production by fetching real, current news headlines and shaping them into a schema-valid `research_brief`.

## How to run

1. Call `brave_search` once with a broad news query (e.g. `"top news headlines today"`) and `freshness: "pd"`. Use `count: 10`.
2. Pick 3–7 distinct headlines. Prefer different stories over multiple takes on the same story. Keep each headline as published — do not rewrite.
3. In sample mode, keep 2 headlines and do not make a second call.
4. If the first call fails on auth (`missing env` or 401/403), stop the stage and report; do not retry in a loop.

## Output Contract

Return a `research_brief` artifact where each item records:

- the headline text, verbatim
- the source URL and source domain from the search result
- the result snippet as supporting context

## Quality Bar

- Every headline traces to a real URL returned by `brave_search` — never invent or paraphrase headlines.
- One API call in sample mode; at most two in full mode. This pipeline runs against a rate-limited free plan (1 req/s, shared monthly quota).
