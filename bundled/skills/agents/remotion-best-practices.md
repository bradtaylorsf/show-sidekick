---
name: "remotion-best-practices"
description: "Best practices for Remotion - Video creation in React"
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 80
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for Show Sidekick paths and terminology while preserving the original operational details.

# Remotion Best Practices

## When to use

Use this skills whenever you are dealing with Remotion code to obtain the domain-specific knowledge.

## Captions

When dealing with captions or subtitles, load the [./rules/subtitles.md](./rules/subtitles.md) file for more information.

## Using FFmpeg

For some video operations, such as trimming videos or detecting silence, FFmpeg should be used. Load the [./rules/ffmpeg.md](./rules/ffmpeg.md) file for more information.

## Audio visualization

When needing to visualize audio (spectrum bars, waveforms, bass-reactive effects), load the [./rules/audio-visualization.md](./rules/audio-visualization.md) file for more information.

## Sound effects

When needing to use sound effects, load the [./rules/sound-effects.md](./rules/sound-effects.md) file for more information.

## How to use

Read individual rule files for detailed explanations and code examples:

- [remotion-best-practices/rules/3d.md](remotion-best-practices/rules/3d.md) - 3D content in Remotion using Three.js and React Three Fiber
- [remotion-best-practices/rules/animations.md](remotion-best-practices/rules/animations.md) - Fundamental animation skills for Remotion
- [remotion-best-practices/rules/assets.md](remotion-best-practices/rules/assets.md) - Importing images, videos, audio, and fonts into Remotion
- [remotion-best-practices/rules/audio.md](remotion-best-practices/rules/audio.md) - Using audio and sound in Remotion - importing, trimming, volume, speed, pitch
- [remotion-best-practices/rules/calculate-metadata.md](remotion-best-practices/rules/calculate-metadata.md) - Dynamically set composition duration, dimensions, and props
- [remotion-best-practices/rules/can-decode.md](remotion-best-practices/rules/can-decode.md) - Check if a video can be decoded by the browser using Mediabunny
- [remotion-best-practices/rules/charts.md](remotion-best-practices/rules/charts.md) - Chart and data visualization patterns for Remotion (bar, pie, line, stock charts)
- [remotion-best-practices/rules/compositions.md](remotion-best-practices/rules/compositions.md) - Defining compositions, stills, folders, default props and dynamic metadata
- [remotion-best-practices/rules/extract-frames.md](remotion-best-practices/rules/extract-frames.md) - Extract frames from videos at specific timestamps using Mediabunny
- [remotion-best-practices/rules/fonts.md](remotion-best-practices/rules/fonts.md) - Loading Google Fonts and local fonts in Remotion
- [remotion-best-practices/rules/get-audio-duration.md](remotion-best-practices/rules/get-audio-duration.md) - Getting the duration of an audio file in seconds with Mediabunny
- [remotion-best-practices/rules/get-video-dimensions.md](remotion-best-practices/rules/get-video-dimensions.md) - Getting the width and height of a video file with Mediabunny
- [remotion-best-practices/rules/get-video-duration.md](remotion-best-practices/rules/get-video-duration.md) - Getting the duration of a video file in seconds with Mediabunny
- [remotion-best-practices/rules/gifs.md](remotion-best-practices/rules/gifs.md) - Displaying GIFs synchronized with Remotion's timeline
- [remotion-best-practices/rules/images.md](remotion-best-practices/rules/images.md) - Embedding images in Remotion using the Img component
- [remotion-best-practices/rules/light-leaks.md](remotion-best-practices/rules/light-leaks.md) - Light leak overlay effects using @remotion/light-leaks
- [remotion-best-practices/rules/lottie.md](remotion-best-practices/rules/lottie.md) - Embedding Lottie animations in Remotion
- [remotion-best-practices/rules/measuring-dom-nodes.md](remotion-best-practices/rules/measuring-dom-nodes.md) - Measuring DOM element dimensions in Remotion
- [remotion-best-practices/rules/measuring-text.md](remotion-best-practices/rules/measuring-text.md) - Measuring text dimensions, fitting text to containers, and checking overflow
- [remotion-best-practices/rules/sequencing.md](remotion-best-practices/rules/sequencing.md) - Sequencing patterns for Remotion - delay, trim, limit duration of items
- [remotion-best-practices/rules/tailwind.md](remotion-best-practices/rules/tailwind.md) - Using TailwindCSS in Remotion
- [remotion-best-practices/rules/text-animations.md](remotion-best-practices/rules/text-animations.md) - Typography and text animation patterns for Remotion
- [remotion-best-practices/rules/timing.md](remotion-best-practices/rules/timing.md) - Interpolation curves in Remotion - linear, easing, spring animations
- [remotion-best-practices/rules/transitions.md](remotion-best-practices/rules/transitions.md) - Scene transition patterns for Remotion
- [remotion-best-practices/rules/transparent-videos.md](remotion-best-practices/rules/transparent-videos.md) - Rendering out a video with transparency
- [remotion-best-practices/rules/trimming.md](remotion-best-practices/rules/trimming.md) - Trimming patterns for Remotion - cut the beginning or end of animations
- [remotion-best-practices/rules/videos.md](remotion-best-practices/rules/videos.md) - Embedding videos in Remotion - trimming, volume, speed, looping, pitch
- [remotion-best-practices/rules/parameters.md](remotion-best-practices/rules/parameters.md) - Make a video parametrizable by adding a Zod schema
- [remotion-best-practices/rules/maps.md](remotion-best-practices/rules/maps.md) - Add a map using Mapbox and animate it
- [remotion-best-practices/rules/voiceover.md](remotion-best-practices/rules/voiceover.md) - Adding AI-generated voiceover to Remotion compositions using ElevenLabs TTS
