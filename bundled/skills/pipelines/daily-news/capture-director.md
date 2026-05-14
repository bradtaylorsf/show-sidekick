---
name: "daily-news-capture-director"
description: "Capture real source-page screenshots for each selected news story."
applies_to: "pipelines/daily-news"
stage: "capture"
produces: "capture_manifest"
---
# Daily-News — Capture Director

For each selected story, screenshot the source page above-the-fold. This is
the visual content of the news scene — real publisher pages, not AI-generated
imagery.

Captures are real source screenshots. Do not generate fake article pages.

## Reference Inputs

- `bundled/skills/agents/playwright-recording.md`
- `bundled/skills/agents/video-download.md`

Use `playwright_recording` for real page capture. Use the video-download skill
only when the selected story's source is an original video that must be
retrieved as evidence or optional B-roll; screenshots remain the default visual
source for daily-news.

## How to use playwright-recording in screenshot mode

The `playwright_recording` tool was designed for video capture, but works for
single-frame screenshots: capture a 1-sec recording, extract the first frame
via ffmpeg.

For each `brief.selected_stories[i]` or `script.stories[i]`:

1. Call `playwright_recording` with:
   - `url: <story.url>`
   - `duration_seconds: 1`
   - `viewport_width: 1080` (vertical) or `1920` (landscape)
   - `viewport_height: 1920` (vertical) or `1080` (landscape)
   - `wait_for: networkidle` (let lazy-loaded images render)
   - `output_path: projects/daily-news/<date>/assets/screenshots/<story_id>.mp4`
2. Extract first frame:
   ```bash
   ffmpeg -y -i <recording.mp4> -vframes 1 -q:v 2 <screenshot.jpg>
   ```
3. Save the screenshot path back to the capture_manifest.

Never synthesize or redesign an article page with image generation, HTML mocks,
or generated screenshots. If the real page is ugly, blocked, paywalled, or
partially loaded, capture what is actually served and record the quality flag.

## Screenshot quality controls

Common issues to handle:

- **Cookie banners / consent modals** — block or auto-accept via Playwright
  page interaction before screenshot. Check the existing playwright_recording
  options for cookie-handling support; if not exposed, the screenshot will
  include the banner and the screenshot quality flag should warn.
- **Paywalls / login walls** — if detected (HTTP 401/403, login form in DOM,
  or "Subscribe to read" text), capture what's visible and flag the story as
  `paywalled: true` so the script can attribute it accordingly.
- **Geo-blocked content** — same: capture what's served, flag.
- **Page errors** — 404 / 5xx pages should be skipped; flag the story for
  manual handling at the script stage.
- **Above-the-fold focus** — viewport height drives this. For 9:16 vertical,
  most desktop news pages will need a viewport of ~1080×2400 with a crop to
  1080×1920 for the story headline + lead image.

## capture_manifest artifact

```yaml
screenshots:
  - story_id: hl-001
    image_path: assets/screenshots/hl-001.jpg
    captured_at: "2026-05-08T14:30:00Z"
    viewport: "1080x1920"
    quality_flags: []                 # e.g. ["paywall_visible", "cookie_banner_visible"]
    page_load_status: 200
  - story_id: hl-002
    ...
```

## When existing tools aren't enough

If `playwright_recording`'s screenshot-mode coverage is poor (no cookie
handling, no paywall detection, slow), the pipeline can be upgraded with a
dedicated `web_page_screenshot` tool that wraps Playwright more tightly. The
manifest can grow that tool later without changing the director contract.

This is auto-proceed (no human checkpoint) — but flag any story that came
back with quality issues. If a blocked source makes the narration misleading,
spend the one allowed send-back on script replacement or story substitution.
