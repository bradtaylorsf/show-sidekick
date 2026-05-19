---
name: "music"
description: "Generate music using ElevenLabs Music API. Use when creating instrumental tracks, songs with lyrics, background music, jingles, or any AI-generated music composition. Supports prompt-based generation, composition plans for granular control, and detailed output with metadata."
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

Capability-level music generation across ElevenLabs Music (`music_gen`), Suno (`suno_music`), ACE-Step/MusicGen-style open generation (`acestep`), and stock/library fallbacks.

## Prompt Structure

State genre, mood, instruments, tempo, production feel, and use case. For songs, separate lyrics/sections from the style prompt.

## Parameter Defaults

Use explicit duration. For ElevenLabs `music_gen`, set `duration_seconds` and `force_instrumental`; for Suno, choose `model` from `V4`, `V4_5`, `V5`, set `instrumental`, and use `custom_mode` only when exact lyrics/style/title are provided.

## Quality Keywords

genre, mood, instruments, tempo, cinematic, instrumental, build, climax, loopable, polished production.

## Anti-Patterns

Referencing specific artists or copyrighted lyrics, using vague prompts like `cool music`, omitting duration, or adding vocals when the scene needs bed music.

## Show Sidekick Music Provider Notes

The original music skill body below focuses on ElevenLabs Music. In Show Sidekick, the `music` Layer 3 skill also covers the provider selector shape that routes across generated music providers:

| Provider/tool | Best for | Key parameters |
|---|---|---|
| `music_gen` / ElevenLabs | Background music and sound effects matched to video duration | `prompt`, required `duration_seconds` (3-600), `force_instrumental: true`, `output_path` |
| `suno_music` / Suno | Full songs, vocals, custom lyrics, instrumentals, longer tracks | `prompt`, `style`, `title`, `instrumental: true`, `custom_mode: false`, `model: V4`, `track_index: 0` |
| `acestep` | Open music generation, covers/style transfer, stem extraction | `prompt`, `duration`, optional `bpm`, `key`, presets, lyrics, cover/reference, or extract target |

Do not let a generator silently default duration. Derive music length from the approved script, cuesheet, or target scene runtime. For songs with lyrics, keep lyrics/structure separate from production style and verify that the provider supports vocals before submitting.

# ElevenLabs Music Generation

Generate music from text prompts - supports instrumental tracks, songs with lyrics, and fine-grained control via composition plans.

> **Setup:** See [Installation Guide](music/references/installation.md). For JavaScript, use `@elevenlabs/*` packages only.

## Quick Start

### Python

```python
from elevenlabs import ElevenLabs

client = ElevenLabs()

audio = client.music.compose(
    prompt="A chill lo-fi hip hop beat with jazzy piano chords",
    music_length_ms=30000
)

with open("output.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)
```

### JavaScript

```javascript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream } from "fs";

const client = new ElevenLabsClient();
const audio = await client.music.compose({
  prompt: "A chill lo-fi hip hop beat with jazzy piano chords",
  musicLengthMs: 30000,
});
audio.pipe(createWriteStream("output.mp3"));
```

### cURL

```bash
curl -X POST "https://api.elevenlabs.io/v1/music" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" -H "Content-Type: application/json" \
  -d '{"prompt": "A chill lo-fi beat", "music_length_ms": 30000}' --output output.mp3
```

## Methods

| Method | Description |
|--------|-------------|
| `music.compose` | Generate audio from a prompt or composition plan |
| `music.composition_plan.create` | Generate a structured plan for fine-grained control |
| `music.compose_detailed` | Generate audio + composition plan + metadata |
| `music.upload` | Upload an audio file for later inpainting workflows and optionally extract its composition plan |

See [API Reference](music/references/api_music/reference.md) for full parameter details.

`music.upload` is available to enterprise clients with access to the inpainting feature.

## Composition Plans

For granular control, generate a composition plan first, modify it, then compose:

```python
plan = client.music.composition_plan.create(
    prompt="An epic orchestral piece building to a climax",
    music_length_ms=60000
)

# Inspect/modify styles and sections
print(plan.positiveGlobalStyles)  # e.g. ["orchestral", "epic", "cinematic"]

audio = client.music.compose(
    composition_plan=plan,
    music_length_ms=60000
)
```

## Content Restrictions

- Cannot reference specific artists, bands, or copyrighted lyrics
- `bad_prompt` errors include a `prompt_suggestion` with alternative phrasing
- `bad_composition_plan` errors include a `composition_plan_suggestion`

## Error Handling

```python
try:
    audio = client.music.compose(prompt="...", music_length_ms=30000)
except Exception as e:
    print(f"API error: {e}")
```

Common errors: 401 (invalid key), 422 (invalid params), 429 (rate limit).

## References

- [Installation Guide](music/references/installation.md)
- [API Reference](music/references/api_music/reference.md)
