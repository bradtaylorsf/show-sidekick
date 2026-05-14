---
name: "ffmpeg"
description: "Practical FFmpeg recipes for probing, trimming, stitching, subtitles, normalization, and delivery checks."
applies_to: "core"
---
# FFmpeg Skill

## When to Use

Use FFmpeg-backed tools for any video/audio processing that does not require AI inference:
cutting, trimming, speed adjustment, concatenation, audio extraction, mixing,
subtitle burn-in, overlay compositing, encoding, face enhancement, color grading,
and audio cleanup.

## Tools That Use FFmpeg

### Core Pipeline

| Tool | Capability |
|------|-----------|
| `video_trimmer` | Cut, trim, speed adjust, concat video segments |
| `video_compose` | Full composition: cuts + subtitles + overlays + encode |
| `audio_mixer` | Mix speech/music/SFX, ducking, fades, extract audio |
| `frame_sampler` | Extract representative frames from video |

### Enhancement Layer

| Tool | Capability | Key Presets |
|------|-----------|-------------|
| `face_enhance` | Skin smoothing, sharpening, warm/cool tones | `talking_head_standard`, `soft_skin`, `sharpen` |
| `color_grade` | Cinematic color grading with intensity control | `cinematic_warm`, `cinematic_cool`, `moody_dark` |
| `audio_enhance` | Noise reduction, loudness normalization, EQ | `clean_speech`, `voice_clarity`, `podcast` |

## Key Patterns

### Enhancement Chain Order

Apply enhancements in this order to avoid filter interactions:

1. **Subtitles first** — burn into the base video
2. **Face enhance** — smoothing/sharpening works best on ungraded footage
3. **Color grade** — applies look after face is already enhanced
4. **Audio enhance** — independent of video, apply last

Each step is optional and gracefully skipped if the tool is unavailable.

### Lossless vs Re-encode

- Use `-c copy` (codec copy) when you only need to cut or concat without altering frames. This is instant and lossless.
- Re-encode (`-c:v libx264`) when applying filters (speed change, subtitles, overlays, scaling).
- Default CRF is 23. Use 18-20 for higher quality when the output is the final deliverable.

### Subtitle Burn-in

- Prefer SRT format for simple word subtitles.
- Use `force_style` with full ASS color format: `&H00FFFFFF` (not `&HFFFFFF`).
- Always escape Windows paths (`C\:` not `C:`) in the subtitles filter.
- Vertical video: `font_size: 18`, `max 3 words/cue`, `margin_v: 50`.
- Horizontal video: `font_size: 22`, `max 6 words/cue`, `margin_v: 40`.

### Audio Enhancement Targets

| Platform | Target LUFS | Loudness Range |
|----------|-------------|----------------|
| Social media (TikTok, Reels) | -14 LUFS | 5-7 LU |
| YouTube | -14 to -16 LUFS | 7-11 LU |
| Podcast | -16 LUFS | 7-11 LU |
| Broadcast | -24 LUFS | 7 LU |

The `clean_speech` preset targets -16 LUFS with 11 LU range — good for YouTube/social media.

### Color Grade Intensity

- `intensity: 0.85` — recommended default for cinematic_warm on talking heads
- `intensity: 0.5` — subtle, barely noticeable
- `intensity: 1.0` — full effect, may look over-processed on some footage

### Audio Ducking

- Use `sidechaincompress` with speech as the key signal to lower music volume during dialogue.
- Typical settings: threshold=0.02, ratio=9, attack=200ms, release=500ms.

### Concatenation

- Use the concat demuxer (`-f concat -safe 0`) for same-codec segments.
- For mixed codecs or different resolutions, re-encode all segments first.

## Practical Recipes

Use these as starting points. Prefer registry tools when they exist; use raw
FFmpeg commands for diagnosis, local validation, or one-off operations.

### 1. Probe Container And Streams

```bash
ffprobe -v error -show_streams -show_format -of json input.mp4
```

### 2. Trim Without Re-Encoding

```bash
ffmpeg -ss 00:00:12.000 -to 00:00:28.000 -i input.mp4 -c copy clip.mp4
```

### 3. Frame-Accurate Trim With Re-Encode

```bash
ffmpeg -ss 12.0 -to 28.0 -i input.mp4 -c:v libx264 -crf 18 -c:a aac clip.mp4
```

### 4. Concatenate Same-Codec Clips

```bash
printf "file '%s'\n" clip1.mp4 clip2.mp4 clip3.mp4 > concat.txt
ffmpeg -f concat -safe 0 -i concat.txt -c copy stitched.mp4
```

### 5. Normalize Mixed Inputs Before Concat

```bash
ffmpeg -i input.mp4 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30" -c:v libx264 -crf 18 -c:a aac normalized.mp4
```

### 6. Detect Silence

```bash
ffmpeg -i input.wav -af silencedetect=noise=-35dB:d=0.5 -f null -
```

### 7. Loudness Analyze

```bash
ffmpeg -i input.wav -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null -
```

### 8. Loudness Normalize

```bash
ffmpeg -i input.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 normalized.wav
```

### 9. Burn Subtitles

```bash
ffmpeg -i input.mp4 -vf "subtitles=captions.srt:force_style='Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'" -c:a copy subtitled.mp4
```

### 10. Extract Audio For Transcription

```bash
ffmpeg -i input.mp4 -vn -ac 1 -ar 16000 transcript.wav
```

### 11. Create A Poster Frame

```bash
ffmpeg -ss 00:00:03.000 -i input.mp4 -frames:v 1 poster.png
```

### 12. Encode Delivery MP4

```bash
ffmpeg -i render.mov -c:v libx264 -pix_fmt yuv420p -profile:v high -crf 18 -c:a aac -b:a 192k final.mp4
```

## Quality Checklist

- [ ] Output plays without artifacts on desktop and mobile
- [ ] Audio and video remain in sync after processing
- [ ] Subtitles are in the bottom 20% of frame, never covering the face
- [ ] Audio loudness is within target range for the platform
- [ ] Enhancement is visible but natural — skin tones look healthy, not orange
- [ ] No audio clipping or silence gaps at cut points
- [ ] File size is reasonable for the target platform
