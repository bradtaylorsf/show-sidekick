---
name: "avatar-video"
description: "Create AI avatar videos with precise control over avatars, voices, scripts, scenes, and backgrounds using HeyGen's v2 API. Use when: (1) Choosing a specific avatar and voice for a video, (2) Writing exact scripts for an avatar to speak, (3) Building multi-scene videos with different backgrounds per scene, (4) Creating transparent WebM videos for compositing, (5) Using talking photos as video presenters, (6) Integrating HeyGen avatars with Remotion, (7) Batch video generation with exact specs, (8) Brand-consistent production videos with precise control."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 75
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for Show Sidekick paths and terminology while preserving the original operational details.

# Avatar Video

Create AI avatar videos with full control over avatars, voices, scripts, scenes, and backgrounds. Build single or multi-scene videos with exact configuration using HeyGen's `/v2/video/generate` API.

## Authentication

All requests require the `X-Api-Key` header. Set the `HEYGEN_API_KEY` environment variable.

```bash
curl -X GET "https://api.heygen.com/v2/avatars" \
  -H "X-Api-Key: $HEYGEN_API_KEY"
```

## Tool Selection

If HeyGen MCP tools are available (`mcp__heygen__*`), **prefer them** over direct HTTP API calls — they handle authentication and request formatting automatically.

| Task | MCP Tool | Fallback (Direct API) |
|------|----------|----------------------|
| Check video status / get URL | `mcp__heygen__get_video` | `GET /v2/videos/{video_id}` |
| List account videos | `mcp__heygen__list_videos` | `GET /v2/videos` |
| Delete a video | `mcp__heygen__delete_video` | `DELETE /v2/videos/{video_id}` |

Video generation (`POST /v2/video/generate`) and avatar/voice listing are done via direct API calls — see reference files below.

## Default Workflow

1. **List avatars** — `GET /v2/avatars` → pick an avatar, preview it, note `avatar_id` and `default_voice_id`. See [avatars.md](avatar-video/references/avatars.md)
2. **List voices** (if needed) — `GET /v2/voices` → pick a voice matching the avatar's gender/language. See [voices.md](avatar-video/references/voices.md)
3. **Write the script** — Structure scenes with one concept each. See [scripts.md](avatar-video/references/scripts.md)
4. **Generate the video** — `POST /v2/video/generate` with avatar, voice, script, and background per scene. See [video-generation.md](avatar-video/references/video-generation.md)
5. **Poll for completion** — `GET /v2/videos/{video_id}` until status is `completed`. See [video-status.md](avatar-video/references/video-status.md)

## Quick Reference

| Task | Read |
|------|------|
| List and preview avatars | [avatars.md](avatar-video/references/avatars.md) |
| List and select voices | [voices.md](avatar-video/references/voices.md) |
| Write and structure scripts | [scripts.md](avatar-video/references/scripts.md) |
| Generate video (single or multi-scene) | [video-generation.md](avatar-video/references/video-generation.md) |
| Add custom backgrounds | [backgrounds.md](avatar-video/references/backgrounds.md) |
| Add captions / subtitles | [captions.md](avatar-video/references/captions.md) |
| Add text overlays | [text-overlays.md](avatar-video/references/text-overlays.md) |
| Create transparent WebM video | [video-generation.md](avatar-video/references/video-generation.md) (WebM section) |
| Use templates | [templates.md](avatar-video/references/templates.md) |
| Create avatar from photo | [photo-avatars.md](avatar-video/references/photo-avatars.md) |
| Check video status / download | [video-status.md](avatar-video/references/video-status.md) |
| Upload assets (images, audio) | [assets.md](avatar-video/references/assets.md) |
| Use with Remotion | [remotion-integration.md](avatar-video/references/remotion-integration.md) |
| Set up webhooks | [webhooks.md](avatar-video/references/webhooks.md) |

## When to Use This Skill vs Create Video

This skill is for **precise control** — you choose the avatar, write the exact script, configure each scene.

If the user just wants to **describe a video idea** and let AI handle the rest (script, avatar, visuals), use the **create-video** skill instead.

| User Says | Create Video Skill | This Skill |
|-----------|:------------------:|:----------:|
| "Make me a video about X" | ✓ | |
| "Create a product demo" | ✓ | |
| "I want avatar Y to say exactly Z" | | ✓ |
| "Multi-scene video with different backgrounds" | | ✓ |
| "Transparent WebM for compositing" | | ✓ |
| "Use this specific voice for my script" | | ✓ |
| "Batch generate videos with exact specs" | | ✓ |

## Reference Files

### Core Video Creation
- [avatar-video/references/avatars.md](avatar-video/references/avatars.md) - Listing avatars, styles, avatar_id selection
- [avatar-video/references/voices.md](avatar-video/references/voices.md) - Listing voices, locales, speed/pitch
- [avatar-video/references/scripts.md](avatar-video/references/scripts.md) - Writing scripts, pauses, pacing
- [avatar-video/references/video-generation.md](avatar-video/references/video-generation.md) - POST /v2/video/generate and multi-scene videos

### Video Customization
- [avatar-video/references/backgrounds.md](avatar-video/references/backgrounds.md) - Solid colors, images, video backgrounds
- [avatar-video/references/text-overlays.md](avatar-video/references/text-overlays.md) - Adding text with fonts and positioning
- [avatar-video/references/captions.md](avatar-video/references/captions.md) - Auto-generated captions and subtitles

### Advanced Features
- [avatar-video/references/templates.md](avatar-video/references/templates.md) - Template listing and variable replacement
- [avatar-video/references/photo-avatars.md](avatar-video/references/photo-avatars.md) - Creating avatars from photos
- [avatar-video/references/webhooks.md](avatar-video/references/webhooks.md) - Webhook endpoints and events

### Integration
- [avatar-video/references/remotion-integration.md](avatar-video/references/remotion-integration.md) - Using HeyGen in Remotion compositions

### Foundation
- [avatar-video/references/video-status.md](avatar-video/references/video-status.md) - Polling patterns and download URLs
- [avatar-video/references/assets.md](avatar-video/references/assets.md) - Uploading images, videos, audio
- [avatar-video/references/dimensions.md](avatar-video/references/dimensions.md) - Resolution and aspect ratios
- [avatar-video/references/quota.md](avatar-video/references/quota.md) - Credit system and usage limits

## Best Practices

1. **Preview avatars before generating** — Download `preview_image_url` so the user can see the avatar before committing
2. **Use avatar's default voice** — Most avatars have a `default_voice_id` pre-matched for natural results
3. **Fallback: match gender manually** — If no default voice, ensure avatar and voice genders match
4. **Use test mode for development** — Set `test: true` to avoid consuming credits (output will be watermarked)
5. **Set generous timeouts** — Video generation often takes 5-15 minutes, sometimes longer
6. **Validate inputs** — Check avatar and voice IDs exist before generating
