---
name: "character-animation-qa"
description: "Review local character animation with schema checks, Playwright browser previews, frame sampling, and FFmpeg/ffprobe final output checks."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 79
---

## predit Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for predit paths and terminology while preserving the original operational details.

# Character Animation QA

Use this skill before presenting a character-animation preview or final render.

## Review Layers

1. Schema validation: character design, rig plan, pose library, action timeline.
2. Static asset checks: referenced parts and backgrounds exist.
3. Browser preview: load the preview, capture screenshots, collect console errors.
4. Motion check: compare sampled frames for non-trivial differences.
5. Final MP4 check: ffprobe metadata, duration, resolution, audio, frame samples.
6. Agent visual review: inspect sampled frames for detached limbs, bad layers,
   off-frame characters, unreadable expressions, broken text.

## Playwright Pattern

```ts
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(previewUrl, { waitUntil: "networkidle" });
await page.screenshot({ path: "preview.png" });
```

## Pass/Revise/Fail

- `pass`: technical checks pass, acting is readable.
- `revise`: fixable rig/timeline issue.
- `fail`: missing assets, blank render, runtime failure, or wrong runtime.

## Sources

- Playwright screenshots:
  https://playwright.dev/docs/screenshots
- Playwright page navigation:
  https://playwright.dev/docs/api/class-page#page-goto
- FFmpeg/ffprobe should be used for final media probing:
  https://ffmpeg.org/ffprobe.html
