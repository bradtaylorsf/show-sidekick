---
name: voicebox
description: Local narration and voice cloning through the user's own Voicebox app (open source, MIT) — Qwen3-TTS cloned voices or Kokoro presets over its localhost REST API, $0, nothing leaves the machine. Use for voiceover when Voicebox is running, or when the user asks for a cloned or local voice.
applies_to: agents
agent_skill: true
critical: false
epic: 8
issue: 0
---

# Voicebox (local TTS and voice cloning)

## Show Sidekick Usage Contract

- Voicebox is a desktop app the user installs and runs (github.com/jamiepine/voicebox). Show Sidekick never installs it and never downloads models into it without asking.
- Local and $0: announce the engine, voice profile, and text length before generating; no approval prompt is needed. Switching to a paid TTS is a provider swap and needs approval (spec 15).
- Clone only voices the user owns or has written consent to use. Never clone a real public figure's voice from scraped audio.
- Route through the registry `voicebox_tts` tool once it exists; until then this skill documents the API that tool wraps. Treat it as the planned local TTS default ahead of `piper_tts`.

## When To Use

- Voiceover, narration, or character dialogue when `GET http://127.0.0.1:17493/health` answers.
- The user wants a consistent cloned narrator across episodes (one profile per show voice, recorded in `show.yaml`).

## Model Identity

| Engine (`engine`) | Model | Use |
|---|---|---|
| `qwen` | Qwen3-TTS 1.7B (`model_size: 1.7B`), MLX on Apple Silicon | Default. Voice cloning from reference samples; accepts `instruct` style direction. |
| `kokoro` | Kokoro-82M | Fast preset voices (`af_heart`, `af_bella`, …); drafts and scratch VO. |
| `qwen_custom_voice`, `chatterbox`, `chatterbox_turbo`, `luxtts`, `tada` | Optional engines | Only if the user has downloaded them; check `GET /models/status`. |

The first generation after launch loads a ~4 GB model; allow for it in timeouts.

## Prompt Structure

- Send the approved script text exactly. Break at sentence boundaries; the server chunks at `max_chunk_chars` (default 800) and crossfades (`crossfade_ms`, default 50).
- Use `instruct` (≤500 chars) for delivery, not content: "warm, unhurried documentary narrator; slight smile on the last line."
- Spell out numbers, acronyms, and names the way they should be spoken.

## Parameter Defaults

| Param | Default |
|---|---|
| Base URL | `VOICEBOX_URL`, default `http://127.0.0.1:17493` (no auth) |
| `engine` | `qwen`, `model_size: 1.7B` |
| `language` | `en` (23 codes supported) |
| `seed` | Fixed per show voice so re-takes match |
| `normalize` | `true` |

API surface (from the app's own `/openapi.json`, v0.5.0):

- `GET /health`, `GET /models/status`
- `GET /profiles` (cloned/designed voices), `GET /profiles/presets/{engine}` (built-in voices), `POST /profiles`, `POST /profiles/{id}/samples`
- `POST /generate` `{profile_id, text, language, engine, model_size, seed, instruct, normalize}` → `{id, status, audio_path, duration}`; poll `GET /generate/{id}/status` until `completed`; fetch `GET /audio/{id}`
- `POST /speak` `{text, profile, engine?, language?}` — simpler one-shot
- MCP: `/mcp` (Streamable HTTP) or the bundled `voicebox-mcp` stdio binary

## Quality Keywords

Reference samples: 10–30 s of clean, dry, single-speaker audio in the target delivery style; several short samples beat one long noisy one.

## Anti-Patterns

- Expecting word timestamps: Voicebox returns none. Run the generated WAV through `whisper_cpp` / `transcriber` for word timing before building a cuesheet.
- Re-generating a line without the fixed seed and getting a different voice colour mid-episode.
- Long single requests with no status polling; the generation is queued.

## Workflow

1. `GET /health`; if it fails, tell the user to open Voicebox — don't fall back to a paid provider silently.
2. Resolve the show's voice profile (`GET /profiles`), or offer a Kokoro preset for drafts.
3. Generate per scene or paragraph, poll status, save to the episode's audio folder.
4. Transcribe the result for word timing; the narration is the master clock for narration-led content.
5. Log engine, profile id, and seed in the decision log.

## References

- `local-sound` — SFX and music for the same all-local episode.
- Guide: `docs/local-production.md`.
