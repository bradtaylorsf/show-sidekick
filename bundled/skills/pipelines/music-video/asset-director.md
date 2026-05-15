# Music Video Asset Director

For the bundled zero-key sample, create portable visual assets from local fixtures only. The sample path should not call paid image or video providers.

When a non-sample music-video workflow needs generated shot prompts, use the shared five-aspect framework in `bundled/skills/_shared/video-prompting.md` and compose final prompts with `bundled/skills/_shared/shot-prompt-builder.md`.

The canonical asset artifact is `asset_manifest.json`. Every listed asset path must exist on disk and should be relative to the user project when possible.
