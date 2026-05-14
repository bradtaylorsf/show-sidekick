---
name: "whisperx"
description: "Layer 3 agent skill for whisperx."
applies_to: "agents"
agent_skill: true
critical: true
epic: 8
issue: 71
---

## predit Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for predit paths and terminology while preserving the original operational details.

## Model Identity

WhisperX/faster-whisper transcription with word timestamps, language detection, VAD, optional alignment, and pyannote diarization.

## Prompt Structure

Provide source audio/video, model size, language or auto-detect, diarization choice, and expected transcript/caption output needs.

## Parameter Defaults

Default `base` for speed and `large-v3` for production. Enable diarization only for multi-speaker material and only when `HF_TOKEN`/pyannote support is available.

## Quality Keywords

word-level timestamps, VAD, language detection, diarization, speaker labels, confidence, spot-check segments, subtitle alignment.

## Anti-Patterns

Using diarization for a single speaker, accepting large transcript gaps, ignoring timestamp drift, or using tiny/base for final production without spot-checking quality.

# WhisperX / Transcription Skill

## When to Use

Use the `transcriber` tool whenever you need to convert speech to text from
audio or video files. This is the entry point for all transcript-dependent
workflows: subtitle generation, edit decisions based on spoken content, and
scene analysis from dialogue.

## Tool

| Tool | Capability |
|------|-----------|
| `transcriber` | Speech-to-text with word timestamps, language detection, optional diarization |

## How It Works

1. **Model loading:** faster-whisper loads the specified model size (tiny through large-v3). Defaults to `base` for speed. Use `large-v3` for production quality.
2. **Transcription:** VAD filter removes silence. Word-level timestamps are always enabled.
3. **Diarization (optional):** WhisperX alignment + pyannote speaker diarization assigns speaker labels. Requires `HF_TOKEN` environment variable.

## Model Size Guide

| Model | RAM | Speed (CPU) | Quality | When to Use |
|-------|-----|-------------|---------|-------------|
| `tiny` | ~1 GB | ~10x real-time | Low | Quick drafts, iteration |
| `base` | ~1 GB | ~5x real-time | Good | Default for development |
| `small` | ~2 GB | ~3x real-time | Better | Short content |
| `medium` | ~5 GB | ~1.5x real-time | High | Important content |
| `large-v3` | ~10 GB | ~0.5x real-time | Best | Final production |

## Key Patterns

### Choosing When to Diarize

- **Single speaker (talking head):** Skip diarization — it adds latency with no benefit.
- **Multiple speakers (interview, podcast):** Enable diarization to label who said what.
- **Diarization requires** `whisperx` and `HF_TOKEN`. If unavailable, the tool proceeds without speaker labels.

### Word Timestamps for Subtitles

The transcriber produces word-level timestamps with confidence scores. The `subtitle_gen` tool consumes these directly:

```
word_timestamps: [
  {"word": "Hello", "start": 0.5, "end": 0.8, "probability": 0.95},
  {"word": "world", "start": 0.9, "end": 1.2, "probability": 0.92},
  ...
]
```

### Language Detection

- Pass `language: null` to auto-detect (adds ~1s overhead).
- Pass an explicit ISO 639-1 code (`en`, `es`, `ja`, etc.) when you know the language.

## Quality Checklist

- [ ] Transcript text is accurate (spot-check 3-5 segments)
- [ ] Word timestamps align with actual speech when played back
- [ ] No missing segments or large gaps in the transcript
- [ ] Language was correctly detected (if auto)
- [ ] Speaker labels are correct (if diarization was used)
