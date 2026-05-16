---
name: "news-song-scene-director"
description: "Build beat-aligned news-song scenes with source-vs-lyric-art separation and PS2 visual treatment."
applies_to: "pipelines/news-song"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - News Song Pipeline

## When To Use

Use this stage after the script names lyric sections, claim beats, source flyouts, and timing anchors. Audio remains the master clock, and `lyrics_aligned` phrase windows are the lyric timing source when present.

## Scene Kinds

- `scene_kind: news-screenshot` means the visual must be a real captured publisher/source screenshot.
- `scene_kind: lyric-art` means the visual is generated PS2 lyric, metaphor, protest, or mood art.
- Do not blend the two into a fake evidence plate.

## Source Flyout HUD Timing

Use source flyout HUD timing rules: enter after the lyric or claim lands, hold for 1.2-2.0 seconds when the beat allows, and exit before the next major vocal phrase or cut. Source flyouts must not obscure the article headline, publisher masthead, or central evidence.

## Scene Duration

No scene may exceed `5.0 seconds`. Long holds over 5.0 seconds must split into quick cuts, alternate crops, or a new beat.

## Timing Anchors

Every music-led scene must carry `timing_anchor`, `timing_source`, and `timing_ref`. For lyric-art scenes, set `timing_source: lyric`, copy the exact `lyrics_aligned` `start_ms` and `end_ms`, and set `timing_ref.lyric_line_id` to the source line id. If a lyric phrase window is longer than `5.0 seconds`, split it into multiple adjacent scenes inside the same phrase window and keep each child scene tied to the same `lyric_line_id`.

## PS2 Visual Treatment

For lyric-art scenes, specify low-poly geometry, compressed textures, visible polygon edges, vertex lighting, baked shadows, foggy render distance, CRT/VHS artifacts, and camera language such as low-angle, Dutch angle, handheld push-in, or tracking shot.

Do not overdescribe faces. The PS2 look works through silhouette, mood, lighting, camera movement, and nostalgia.

## Process

1. Build scenes from `lyrics_aligned` phrase windows, cuesheet sections, downbeats, word timestamps, and climax points.
2. Assign `scene_kind` to every scene.
3. Assign per-section accent color and carry it into HUD, prompt, and transition notes.
4. Mark source flyout timing for sourced evidence beats.
5. Mark which lyric-art scenes deserve image-to-video motion.
6. Preserve the 15-20 sec no-caption PS2 sample window when sample mode is active.

## Quality Gate

- scene_plan validates,
- every scene stays within 5.0 seconds,
- every scene has `timing_anchor`, `timing_source`, and `timing_ref`,
- every lyric-art scene cites `lyrics_aligned` phrase windows when lyrics are supplied,
- no lyric timing is guessed when phrase windows are available,
- every scene has a valid content-mode-compatible scene_kind,
- news-screenshot scenes cite source refs,
- lyric-art scenes include PS2 treatment notes.
