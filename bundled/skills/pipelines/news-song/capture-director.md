---
name: "news-song-capture-director"
description: "Capture real publisher/source screenshots for sourced news-song scenes and no-op source-free protest videos."
applies_to: "pipelines/news-song"
stage: "capture"
produces: "capture_manifest"
---
# Capture Director - News Song Pipeline

## When To Use

Use this stage after the scene plan identifies `scene_kind: news-screenshot` beats. It captures real source screenshots for sourced-political-news-song mode and records a no-op for source-free mode.

## Content Mode Gate

For `sourced-political-news-song`, call `playwright_recording` for each approved source beat and save real above-the-fold screenshots. For `source-free-protest-music-video`, skip browser capture and write a skipped/no-op capture manifest that states no news screenshots are used.

News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.

## Real Capture Rule

Use `.predit/skills/agents/playwright-recording.md` before capture. Never synthesize or redesign an article page with image generation, HTML mocks, generated screenshots, or fake publisher layouts. If the real page is blocked, ugly, paywalled, partially loaded, or behind an interstitial, capture what is served or flag it for replacement.

## How to capture source screenshots

For each sourced `scene_kind: news-screenshot` beat:

1. Call `playwright_recording` with:
   - `url: <source.url>`
   - `duration_seconds: 1`
   - `viewport_width: 1920`
   - `viewport_height: 1080`
   - `wait_for: networkidle`
   - `output_path: projects/<show>/<episode>/assets/screenshots/<source_id>.mp4`
2. Extract the first usable frame with ffmpeg and save it as a screenshot image.
3. Store provider metadata as `provider = playwright_recording` in the asset_manifest when the screenshot is referenced by a scene.
4. Record story/source id, publisher, URL, captured_at, viewport, file path, page status, and quality flags.

## Browser-Blocked Sources

BLS/FRED browser-block note: if BLS, FRED, or another official page blocks browser automation, do not generate a substitute screenshot. Record `quality_flags`, use an alternate deep URL only when source review permits it, or send the stage back for source substitution.

## capture_manifest artifact

```yaml
screenshots:
  - story_id: src-001
    image_path: assets/screenshots/src-001.jpg
    captured_at: "2026-05-15T14:30:00Z"
    viewport: "1920x1080"
    url: "https://example.com/exact-article"
    publisher: "Example News"
    page_load_status: 200
    quality_flags: []
failures: []
```

For source-free mode:

```yaml
screenshots: []
failures: []
```

## Quality Gate

- capture_manifest validates,
- every sourced screenshot is a real captured file or has a documented blocker,
- source-free mode produces no screenshot capture tasks,
- no generated asset is labeled as a news screenshot.
