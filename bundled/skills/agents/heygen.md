---
name: "heygen"
description: "[DEPRECATED] Use `create-video` for prompt-based video generation or `avatar-video` for precise avatar/scene control. This legacy skill combines both workflows — the newer focused skills provide clearer guidance."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 75
---

## predit Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for predit paths and terminology while preserving the original operational details.

# HeyGen API (Deprecated)

> **This skill is deprecated.** Use the focused skills instead:
> - **`create-video`** — Generate videos from a text prompt (Video Agent API)
> - **`avatar-video`** — Build videos with specific avatars, voices, scripts, and scenes (v2 API)

This skill remains for backward compatibility but will be removed in a future release.

---

AI avatar video creation API for generating talking-head videos, explainers, and presentations.

## Tool Selection

If HeyGen MCP tools are available (`mcp__heygen__*`), **prefer them** over direct HTTP API calls — they handle authentication and request formatting automatically.

| Task | MCP Tool | Fallback (Direct API) |
|------|----------|----------------------|
| Generate video from prompt | `mcp__heygen__generate_video_agent` | `POST /v1/video_agent/generate` |
| Check video status / get URL | `mcp__heygen__get_video` | `GET /v2/videos/{video_id}` |
| List account videos | `mcp__heygen__list_videos` | `GET /v2/videos` |
| Delete a video | `mcp__heygen__delete_video` | `DELETE /v2/videos/{video_id}` |

If no HeyGen MCP tools are available, use direct HTTP API calls with `X-Api-Key: $HEYGEN_API_KEY` header as documented in the reference files.

## Default Workflow

**Prefer Video Agent** for most video requests.
Always use [prompt-optimizer.md](heygen/references/prompt-optimizer.md) guidelines to structure prompts with scenes, timing, and visual styles.

**With MCP tools:**
1. Write an optimized prompt using [prompt-optimizer.md](heygen/references/prompt-optimizer.md) → [heygen/visual-styles.md](heygen/references/visual-styles.md)
2. Call `mcp__heygen__generate_video_agent` with prompt and config (duration_sec, orientation, avatar_id)
3. Call `mcp__heygen__get_video` with the returned video_id to poll status and get the download URL

**Without MCP tools (direct API):**
1. Write an optimized prompt using [prompt-optimizer.md](heygen/references/prompt-optimizer.md) → [heygen/visual-styles.md](heygen/references/visual-styles.md)
2. `POST /v1/video_agent/generate` — see [video-agent.md](heygen/references/video-agent.md)
3. `GET /v2/videos/<id>` — see [video-status.md](heygen/references/video-status.md)

Only use v2/video/generate when user explicitly needs:
- Exact script without AI modification
- Specific voice_id selection
- Different avatars/backgrounds per scene
- Precise per-scene timing control
- Programmatic/batch generation with exact specs

## Quick Reference

| Task | MCP Tool | Read |
|------|----------|------|
| Generate video from prompt (easy) | `mcp__heygen__generate_video_agent` | [prompt-optimizer.md](heygen/references/prompt-optimizer.md) → [heygen/visual-styles.md](heygen/references/visual-styles.md) → [video-agent.md](heygen/references/video-agent.md) |
| Generate video with precise control | — | [video-generation.md](heygen/references/video-generation.md), [avatars.md](heygen/references/avatars.md), [voices.md](heygen/references/voices.md) |
| Check video status / get download URL | `mcp__heygen__get_video` | [video-status.md](heygen/references/video-status.md) |
| Add captions or text overlays | — | [captions.md](heygen/references/captions.md), [text-overlays.md](heygen/references/text-overlays.md) |
| Transparent video for compositing | — | [video-generation.md](heygen/references/video-generation.md) (WebM section) |
| Use with Remotion | — | [remotion-integration.md](heygen/references/remotion-integration.md) |

## Reference Files

### Foundation
- [heygen/references/authentication.md](heygen/references/authentication.md) - API key setup and X-Api-Key header
- [heygen/references/quota.md](heygen/references/quota.md) - Credit system and usage limits
- [heygen/references/video-status.md](heygen/references/video-status.md) - Polling patterns and download URLs
- [heygen/references/assets.md](heygen/references/assets.md) - Uploading images, videos, audio

### Core Video Creation
- [heygen/references/avatars.md](heygen/references/avatars.md) - Listing avatars, styles, avatar_id selection
- [heygen/references/voices.md](heygen/references/voices.md) - Listing voices, locales, speed/pitch
- [heygen/references/scripts.md](heygen/references/scripts.md) - Writing scripts, pauses, pacing
- [heygen/references/video-generation.md](heygen/references/video-generation.md) - POST /v2/video/generate and multi-scene videos
- [heygen/references/video-agent.md](heygen/references/video-agent.md) - One-shot prompt video generation
- [heygen/references/prompt-optimizer.md](heygen/references/prompt-optimizer.md) - Writing effective Video Agent prompts (core workflow + rules)
- [heygen/references/visual-styles.md](heygen/references/visual-styles.md) - 20 named visual styles with full specs
- [heygen/references/prompt-examples.md](heygen/references/prompt-examples.md) - Full production prompt example + ready-to-use templates
- [heygen/references/dimensions.md](heygen/references/dimensions.md) - Resolution and aspect ratios

### Video Customization
- [heygen/references/backgrounds.md](heygen/references/backgrounds.md) - Solid colors, images, video backgrounds
- [heygen/references/text-overlays.md](heygen/references/text-overlays.md) - Adding text with fonts and positioning
- [heygen/references/captions.md](heygen/references/captions.md) - Auto-generated captions and subtitles

### Advanced Features
- [heygen/references/templates.md](heygen/references/templates.md) - Template listing and variable replacement
- [heygen/references/photo-avatars.md](heygen/references/photo-avatars.md) - Creating avatars from photos
- [heygen/references/webhooks.md](heygen/references/webhooks.md) - Webhook endpoints and events

### Integration
- [heygen/references/remotion-integration.md](heygen/references/remotion-integration.md) - Using HeyGen in Remotion compositions
