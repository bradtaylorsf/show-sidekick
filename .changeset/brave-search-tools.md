---
"show-sidekick": minor
---

Add Brave Search API tools for web research and image asset download (#300)

- New `brave_search` tool (`web_search` capability): API-backed web search for episode research with titled, linked, snippeted results, freshness/country/safesearch controls, and $0.005/call cost metadata. Auth via `BRAVE_SEARCH_API_KEY`.
- New `brave_image_search` tool (`stock_image` capability): searches the whole web for topical imagery alongside the stock providers and participates in `stock_cross_search`. Results carry dimensions and an attribution block (source page URL, source domain, and an "Unknown license — verify before publication" flag); `download_top` fetches the top result and returns its `image_path`.
- New `headline-slideshow` test-only bundled pipeline with four director skills — research (brave_search) → assets (brave_image_search) → edit → compose — proving both tools end to end with a silent, ffprobe-validated 1080p slideshow.
- Asset manifest entries now accept optional `width`, `height`, and `attribution` metadata so search-sourced imagery keeps its provenance and license flag through the editor handoff.
- Fixed the external-agent build protocol so stdin stage events survive revision rounds and later stages instead of aborting the build after the first wait.
- Fixed Remotion composition to render truly silent mp4s (no muxed silent AAC track) when the composition has no audio source, and raised the generic scene title cap to 160 characters so full-length headlines render untruncated.
