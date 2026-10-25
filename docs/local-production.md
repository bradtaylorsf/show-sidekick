# All-Local Production: Blender, ComfyUI, Voicebox, and Local Sound

How to make detailed animated videos with Show Sidekick where every pixel and every sample is made on your own machine, at $0 per run. This guide is distilled from a series of long-form music videos built this way by an agent (Claude) on an Apple Silicon laptop, plus current research on agent-driven Blender work.

It covers what to run, in what order, and how to prompt the agent so the output is detailed rather than generic.

## The stack

| Layer | Local default | Skill |
|---|---|---|
| Stills, edits, clips, upscale | ComfyUI (Z-Image-Turbo, Qwen-Image-Edit-2511, Wan 2.2, SeedVR2, RIFE) via `comfy_*` tools — see [comfyui.md](comfyui.md) | `comfyui-local` |
| 3D sets, cameras, characters | Blender 5.1+, headless, one script per shot | `blender-animation`, `blender-5-api` |
| 2D/typographic motion | Remotion or HyperFrames | `remotion`, `hyperframes` |
| Narration, cloned voices | Voicebox (Qwen3-TTS, Kokoro) | `voicebox` |
| Word timing | whisper.cpp (`whisper_cpp`) | `whisperx` |
| Beats and energy | `aubio`, `audio_energy` | — |
| Music beds | ACE-Step 1.5 | `acestep`, `local-sound` |
| SFX and ambience | Stable Audio Open, Freesound CC0, Kenney | `local-sound` |

Run `showkick doctor --profile local-comfy` to check the ComfyUI side; `showkick setup comfy` installs it step by step.

## What makes the output detailed

The detail does not come from one model. It comes from four habits, in order of impact:

1. **A critic loop that runs many times.** Render proof stills at every scene and transition midpoint, assemble contact sheets, and make the agent actually look at them. Then a fresh critic (not the builder) scores craft, content, and taste, and the builder fixes only what was named. Up to four rounds before it comes back to you.
2. **Measured QA, not vibes.** Automatic checks for black or frozen stretches, one-frame glitches, transition mix, on-beat percentage, camera clearance and rotation speed, and frame counts. Numbers catch what eyes skip.
3. **Long, specific direction.** A per-episode direction file with a style bible, palette hexes, a timestamped shot list tied to beat numbers, lines that must not be cut, and a renderer choice per shot (2D / Three.js / Blender / generated clip) with a render-time estimate.
4. **Everything procedural and timed from data.** Sets, props, and characters built from code; motion keyed from beat, energy, and word-timing JSON; seeded randomness so every re-render is identical.

## Pipeline

| # | Stage | What happens | Gate |
|---|---|---|---|
| 1 | Brief and script | Idea, script or song; the master clock is the VO or the music | You approve |
| 2 | Audio prep | BPM, beat grid, energy envelopes (kick/low/mid/high), word timing with local whisper.cpp; fix lyric lines by hand where alignment slips | Frame totals equal audio length ±1 frame; tempo double-checked (triplet/half-time aliases are common) |
| 3 | Direction | Style bible, palette, shot list on the beat grid, renderer per shot, render-time budget | You approve the shot list |
| 4 | Assets | Characters as reference sheets (Qwen edit), CC0 HDRIs/textures, footage manifests (approve before download), voice profile | Every file has source + licence in the manifest |
| 5 | Blocking | Blender: one idempotent `build.py` per shot → `.blend` + Workbench thumbnail; generated clips: first frame only | Contact sheet reviewed |
| 6 | Look dev | Materials, lighting, world; preview stills; critique → fix | 2–4 critic rounds per shot |
| 7 | Animation | Keys and drivers from timing JSON; motion contact sheets of first/middle/last/cue frames | Clearance, velocity, foot-slide checks pass |
| 8 | Sample | 10–18 s at final quality; measure seconds per frame | You approve look and ETA |
| 9 | Render | Image sequences in resumable chunks under a global GPU lock; one heavy job at a time | Frame count exact; no zero-byte or outlier frames |
| 10 | Sound | VO from Voicebox; SFX and ambience; music bed if needed; mix and loudness | −16 LUFS for web; licences recorded |
| 11 | Compose and review | Encode, mux, critic pass on the full cut, editor handoff | Final self-review |

## Prompting the agent for Blender

The full patterns live in the `blender-animation` skill. The short version:

- **Spec before code.** Lens, f-stop, move, subject placement, palette, HDRI, light ratios, engine, seed — in YAML, approved before any `bpy`.
- **Pin the version.** Blender 5.x broke most bpy examples online (slotted actions, the compositor, engine ids). The agent reads `blender-5-api` first and probes anything it's unsure of instead of guessing.
- **Idempotent scripts.** Factory start, build by name, seed everything, assert fps/resolution/units/camera, save, render a preview, exit non-zero on error.
- **Detail ladder.** Composition → materials → lighting → micro-detail. No detail before composition is approved.
- **Critique with numbers.** "List the three worst defects against the spec, each with a numeric fix. Apply only those."
- **Data, not literals.** Every frame number comes from the timing JSON.

## Operational lessons

These cost real hours; build them in from the start.

- **Render image sequences, never straight to MP4,** and make them resumable (skip existing frames, placeholders on). Reboots and sleep have silently killed multi-hour renders; check render state from the state file, the process, and uptime together.
- **One GPU job at a time.** Wrap Blender and ComfyUI jobs in the same lock, keep a free-disk floor (≥6 GB), and check battery before overnight runs.
- **Cycles on Metal** can put a dark strip on the first frame of a fresh process and on random frames. Render a sacrificial first frame and scan for one-frame outliers.
- **Long-uptime GPU loss.** Headless Chrome (for HTML/Three.js renders) lost the Metal GPU after days of uptime; only a restart fixed it.
- **Pixel format.** Encode TV-range `yuv420p`, not full-range `yuvj420p`.
- **Camera moves expose canvas edges** in 2D layers; overscan or clamp.
- **Painterly AI clips "swim"** (details pop in and out). What worked: hold the painted plate still and composite only the masked moving region; propagate paint along optical flow; RIFE plus deflicker. What didn't: restyling the whole clip again, or upscaling with SeedVR2 (made it worse).
- **Image models take words literally:** "skull" produced a literal skeleton. Describe the visual, not the metaphor.
- **Segment bookkeeping.** When re-rendering a segment, compute it from the timecode and verify the file timestamp changed.

## Licences

Keep the whole chain commercially safe by default. The `local-sound` skill lists the safe picks and the traps (non-commercial weights such as MusicGen, MMAudio, YuE; BBC SFX; redistributing Sonniss). Voicebox is MIT; clone only voices you own or have consent for. Poly Haven assets are CC0. Record every asset's licence in the manifest.
