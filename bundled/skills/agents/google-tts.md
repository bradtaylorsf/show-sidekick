---
name: "google-tts"
description: "Google Cloud Text-to-Speech provider guidance for voice selection, SSML, localization, and output parameters."
applies_to: "agents"
agent_skill: true
critical: true
epic: 8
issue: 74
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for Show Sidekick paths and terminology while preserving the original operational details.

## Model Identity

Google Cloud Text-to-Speech with Standard, WaveNet, Neural2, Studio, Journey, and Chirp 3 HD voices. Default to `en-US-Chirp3-HD-Orus` when no voice is specified.

## Prompt Structure

Provide plain narration text or SSML, voice name, language code, speaking rate, pitch, audio encoding, and output path. Use explicit language codes for localization.

## Parameter Defaults

`language_code`: `en-US`; `voice`: `en-US-Chirp3-HD-Orus`; `speaking_rate`: `1.0`; `pitch`: `0.0`; `audio_encoding`: `MP3`. Chirp/Journey voices use the beta endpoint.

## Quality Keywords

localized, SSML-controlled, clear diction, natural pacing, Chirp 3 HD, Neural2, WaveNet, consistent language code.

## Anti-Patterns

Missing `GOOGLE_API_KEY`/`GOOGLE_APPLICATION_CREDENTIALS`, mismatched voice and language code, unsupported encoding, excessive speaking-rate changes, or using Google TTS for voice cloning.

# Google TTS

Google Cloud Text-to-Speech offers 700+ voices across 50+ languages, including Standard, WaveNet, Neural2, Studio, Journey, and Chirp 3 HD voices. Use it for localization, affordable production narration, and SSML-controlled delivery when voice cloning is not required.

## Setup

- Set `GOOGLE_API_KEY` to a Google Cloud API key with Text-to-Speech enabled.
- Alternatively set `GOOGLE_APPLICATION_CREDENTIALS` for service-account auth.
- Enable the API in Google Cloud: `texttospeech.googleapis.com`.

## Tool Contract

The source provider exposed these inputs:

| Parameter | Default | Notes |
|---|---|---|
| `text` | required | Plain text or SSML input. |
| `voice` | `en-US-Chirp3-HD-Orus` | Rich/cinematic male default. Other examples: `en-US-Chirp3-HD-Aoede`, `en-US-Studio-O`, `en-US-Neural2-D`, `en-US-Journey-D`. |
| `language_code` | `en-US` | BCP-47 language code such as `es-ES`, `ja-JP`, `fr-FR`. |
| `speaking_rate` | `1.0` | Range `0.25` to `4.0`. |
| `pitch` | `0.0` | Semitone adjustment, range `-20.0` to `20.0`. |
| `audio_encoding` | `MP3` | One of `MP3`, `LINEAR16`, `OGG_OPUS`, `MULAW`, `ALAW`. |
| `output_path` | generated | Writes the audio artifact. |

## Voice Selection

- Chirp 3 HD and Journey voices require the beta API endpoint.
- Neural2 and WaveNet are strong affordable defaults for multilingual narration.
- Studio voices are higher cost and should be selected only when their quality difference matters.
- Google TTS is not a voice-cloning system; choose ElevenLabs when cloning or identity-specific voice matching is required.

## Prompting And SSML

- Use SSML for deterministic pauses, emphasis, pronunciation, and pacing where supported.
- Keep narration text clean; pronunciation hacks should be intentional and documented in the stage notes.
- Match `voice` and `language_code`; do not run a Spanish script through an English voice unless the accent is intentional.

## Cost Notes

The source tool estimated per-character costs by voice family:

- Chirp 3 HD: about $30 per 1M characters.
- Studio: about $160 per 1M characters.
- Neural2/Journey/WaveNet: about $16 per 1M characters.
- Standard: about $4 per 1M characters.
