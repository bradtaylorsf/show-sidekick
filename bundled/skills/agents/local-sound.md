---
name: local-sound
description: Sound effects and ambient/background music that run locally or come from commercially safe libraries — Stable Audio Open and ACE-Step 1.5 via ComfyUI, Freesound CC0, Kenney, incompetech — with the licence traps to avoid. Use when an episode needs SFX, ambience, a music bed, or the user wants an all-local soundtrack.
applies_to: agents
agent_skill: true
critical: false
epic: 8
issue: 0
---

# Local Sound: SFX and Ambient Music

## Show Sidekick Usage Contract

- Every sound in the mix carries a licence in the asset manifest (source, licence id, attribution text, URL). The editor handoff carries it through.
- Default to sources that are safe for monetized output. Anything non-commercial, unclear, or region-restricted needs explicit user approval and is flagged in the manifest.
- Generative audio is local and $0; announce model and duration before running. ACE-Step music generation is covered in detail by `acestep`.
- When the episode is music-led, the song is the master clock; SFX and ambience never shift its timing.

## When To Use

- Ambience beds (room tone, city night, wind, crowd), transitions (whooshes, risers, hits), Foley for on-screen action, and background music under narration.
- Not for the lead song of a music video — use the user's track, `suno_music`, or `acestep`.

## Model Identity

| Need | Default | Licence | Runs on Mac |
|---|---|---|---|
| SFX, generative | **Stable Audio Open 1.0** (ComfyUI native nodes) | Stability AI Community Licence: free commercial use under $1M annual revenue | Yes |
| SFX, library | **Freesound API filtered to CC0**; **Kenney audio** packs | CC0 | n/a |
| Music, generative | **ACE-Step 1.5** (ComfyUI native nodes, or its own API) | MIT | Yes (MPS/MLX; 10 s – 10 min) |
| Music, library | **incompetech (Kevin MacLeod)** | CC BY 4.0 — credit line required | n/a |
| Music, library (secondary) | Pixabay Music | Pixabay licence | n/a — expect Content ID claims on some tracks |

## Prompt Structure

Stable Audio Open / ACE-Step prompts: **source + action + space + perspective + duration**.

- "rain on a tin roof, steady, small wooden room, close perspective, 20 seconds"
- "low cinematic riser into a soft sub hit, 4 seconds"
- Music beds: "ambient, 72 BPM, warm analog pads, sparse piano, no drums, no vocals, slowly evolving, loopable, 90 seconds"

Ask for no vocals on any bed that sits under narration.

## Parameter Defaults

- Ambience: generate 20–47 s, loop with a crossfade in the mix rather than generating minutes.
- SFX: generate 3–4 takes per cue, pick one, trim with `ffmpeg`.
- Mix: narration at −16 LUFS integrated for web; beds 18–24 dB under the voice; duck with `audio_mixer`.

## Quality Keywords

Dry, close, isolated, clean, loopable, stereo, no music (for SFX), no vocals (for beds).

## Anti-Patterns

Do not use these for monetized output without the user's explicit approval:

- **MMAudio**, **MusicGen/AudioCraft**, **AudioLDM2**, **TangoFlux**, **YuE** — non-commercial weight licences.
- **BBC Sound Effects** — personal/educational/research use only.
- **Sonniss GDC bundles** — fine on the user's own disk, but never committed to a repo or redistributed; terms change by year.
- **ThinkSound** (conflicting licence statements), **HunyuanVideo-Foley** (region restrictions; CUDA-first, not a local Mac option).
- Freesound results that aren't CC0 unless the CC-BY credit is recorded; never CC-BY-NC.
- Pixabay tracks on a channel that can't absorb Content ID disputes.

## Workflow

1. List the cues from the cuesheet and direction (ambience per scene, transitions, Foley moments).
2. Search the CC0 libraries first for common sounds; generate only what's missing.
3. Record each file's licence and attribution in the asset manifest.
4. Place cues on the timing grid; mix under the master clock; check loudness.

## References

- `acestep` — music generation in depth.
- `voicebox` — local narration.
- `comfyui-local` — the ComfyUI route these models run through.
- Guide: `docs/local-production.md`.
