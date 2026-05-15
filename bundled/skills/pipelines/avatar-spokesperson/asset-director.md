---
name: "avatar-spokesperson-asset-director"
description: "Generate or assemble avatar, lip-sync, TTS, graphics, and caption assets."
applies_to: "pipelines/avatar-spokesperson"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Avatar Spokesperson Pipeline

## When To Use

Use this stage after the scene plan is approved. Asset work must follow the G1 Pivot Decision without silently changing paths.

## Avatar Path References

Read `bundled/skills/agents/avatar-video.md` for controlled avatar video, `bundled/skills/agents/heygen.md` when the selected provider path uses HeyGen, and `bundled/skills/agents/faceswap.md` only when the user has explicit rights and the approved path requires it.

## Process

1. For standard path, use `talking_head` or `heygen_video` according to the approved provider decision.
2. For lip-sync path, use `lip_sync` only with an approved presenter plate and script-aligned audio.
3. Use `tts_selector` for generated voice when required by the approved path.
4. Use `image_selector` for support graphics and `subtitle_gen` for captions.
5. Record provider, voice, avatar id, presenter plate id, rights notes, and failed/retried generations in asset metadata.

## Quality Gate

- assets follow the G1 Pivot Decision,
- every avatar or lip-sync asset has provider and rights metadata,
- captions and support graphics do not obscure the presenter,
- no unsupported tool path is introduced at assets.
