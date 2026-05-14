---
name: "whisperx"
description: "WhisperX transcription model selection, diarization, long audio, and word-level timestamp practices."
applies_to: "core"
---
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

1. **Model loading:** faster-whisper loads the specified model size (tiny through large-v3). For music-vocal and production subtitle work, use the model selection rules below instead of blindly accepting the fastest default.
2. **Transcription:** VAD filter removes silence. Word-level timestamps are always enabled.
3. **Diarization (optional):** WhisperX alignment + pyannote speaker diarization assigns speaker labels. Requires `HF_TOKEN` environment variable.

## Model Size Guide

| Model | RAM | Speed (CPU) | Quality | When to Use |
|-------|-----|-------------|---------|-------------|
| `tiny` | ~1 GB | ~10x real-time | Low | Quick drafts, iteration |
| `base` | ~1 GB | ~5x real-time | Good | Fast development draft |
| `small` | ~2 GB | ~3x real-time | Better | Short content |
| `medium` | ~5 GB | ~1.5x real-time | High | Important content |
| `medium.en` | ~5 GB | ~1.5x real-time | High | Default for English music-vocal subtitles |
| `large-v3` | ~10 GB | ~0.5x real-time | Best | Final production |

## Music-Vocal Model Selection

- Use `medium.en` by default for English lyrics, music-led captions, and noisy vocal stems.
- Use `medium` for non-English or mixed-language audio.
- Retry with `large-v3` when `medium.en` or `medium` misses repeated phrases, chorus hooks, proper nouns, or low-confidence sections.
- Use `base` or `small` only for rough timing drafts where accuracy is not yet important.

## Key Patterns

### Choosing When to Diarize

- **Single speaker (talking head):** Skip diarization — it adds latency with no benefit.
- **Multiple speakers (interview, podcast):** Enable diarization to label who said what.
- **Diarization requires** `whisperx` and `HF_TOKEN`. If unavailable, the tool proceeds without speaker labels.

### Long Audio

- Chunk long recordings by silence or section boundaries before transcription when practical.
- Preserve absolute timestamps when stitching chunk transcripts back together.
- Spot-check boundaries because VAD can drop breaths, applause, or low-volume words at cuts.
- For podcasts/interviews, diarize after the first accurate transcription pass rather than before.

### Retry Pattern

1. Run the default model for the content class.
2. Inspect 3-5 representative segments and any low-confidence spans.
3. If proper nouns, lyrics, or timestamps are wrong, retry only the bad spans with `large-v3`.
4. Keep the transcript artifact tied to the model/version used so subtitle sync can be audited.

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
