---
name: headline-slideshow-asset-director
description: Source one still image per headline via brave_image_search for the headline-slideshow smoke pipeline.
applies_to: pipelines/headline-slideshow
stage: assets
produces: asset_manifest
---

# Headline Slideshow Asset Director

## Purpose

Prove the `brave_image_search` tool works in production by downloading one usable still image per headline from the `research_brief`.

## How to run

1. For each headline, derive a concrete image query from the story's subject (people, places, things — not abstract phrasing). Example: headline "Fed holds rates steady" → query "federal reserve building".
2. Call `brave_image_search` once per headline with `per_page: 5` and `download_top: true`. Throttle to at most one call per second.
3. If the top result fails to download or is unusable (tiny, watermarked, wrong subject), pick the next result from the same response and download it — do not issue a new search call for the same headline.
4. In sample mode, source images for the first 2 headlines only.

## Output Contract

Return an `asset_manifest` artifact where each entry records:

- the headline it belongs to
- the local image file path (from `image_path` / the download)
- width and height
- the full attribution block returned by the tool (source page URL, source domain, license flag)

## Quality Bar

- Exactly one image file on disk per headline, at least 640px on the short edge.
- Attribution is preserved verbatim, including the `"Unknown license — verify before publication"` flag — this is a smoke test, not a licensing pass, and the flag must survive into the manifest.
- One search call per headline, maximum.
