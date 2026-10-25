---
name: blender-animation
description: Direct Blender (5.1+) from code to build detailed, audio-synced animated shots that render fully locally — spec first, one idempotent bpy script per shot, render a still and critique it before adding detail, then chunked resumable renders. Use for any shot the direction assigns to Blender, for procedural sets and characters, or when the user wants 3D animation without a paid video model.
applies_to: agents
agent_skill: true
critical: false
epic: 8
issue: 0
---

# Blender Animation (headless, agent-driven)

## Show Sidekick Usage Contract

- Read this skill and `blender-5-api` before writing any `bpy` code. Most bpy examples online (and in model memory) target Blender 3.x/4.x and break on 5.x.
- Blender runs **headless and scripted**. The script on disk is the source of truth; a live Blender MCP session is an optional review window, never the build. Do not attach to a Blender the user has open.
- Rendering is local and $0, but it is slow and holds the GPU: announce the shot, engine, resolution, frame count, and measured seconds-per-frame ETA before any full render (spec 15). One GPU render process at a time.
- Record every fetched asset (HDRI, texture, model) with source URL, licence, and hash in the asset manifest. No non-CC0 asset without approval.

## When To Use

- The direction assigns a shot to Blender: 3D sets, camera moves through space, crowds, product or object hero shots, procedural environments, rigged characters.
- The user wants detailed animation that runs entirely on their machine.
- As a layout/blocking pass for a later ComfyUI restyle (`comfyui-local`, Wan 2.2 Fun Control with depth or pose). Treat that route as experimental and gate it behind an A/B review.

Prefer 2D canvas/Remotion/HyperFrames when the shot is typography, flat graphics, or UI. Blender earns its cost on depth, light, and camera.

## Model Identity

- Blender **5.1+** with bundled Python 3.13. Engines: `BLENDER_EEVEE` (default: stylized and motion design, seconds per 1080p frame), `CYCLES` with the `METAL` device on Apple Silicon (photoreal hero shots), `BLENDER_WORKBENCH` (grey-box previews).
- Invocation: `blender -b --factory-startup --python build_shot.py --python-exit-code 1 -- <args>`. `--factory-startup` keeps user prefs and add-ons out of the build; `--python-exit-code 1` makes a Python error fail the process.
- The model doing the work is the agent itself (Claude). Its weaknesses in this domain are stale API knowledge and spatial guessing; both prompt patterns below exist to counter them.

## Prompt Structure

Use these patterns with the agent (or as the agent's own plan), in this order:

1. **Spec before code.** "Write `shots/<id>/spec.yaml`: duration in frames at project fps, lens (mm), f-stop, camera move (dolly/orbit/crane/push) with ease, subject and its placement (rule of thirds), palette hexes, HDRI + rotation, key/fill/rim ratio, engine, seed. Don't write bpy until the spec is approved."
2. **Pin the version.** "Target Blender 5.1 / Python 3.13. Read `blender-5-api` first. If unsure of an API, probe it with `blender -b --factory-startup --python-expr '...'` and print the result; never guess."
3. **Idempotent script contract.** "The script starts from factory settings, builds everything by name, seeds all randomness from the spec (`random.seed`, or a deterministic hash), asserts fps, resolution, metric units (1 unit = 1 m) and an active camera on every frame, saves `<id>.blend`, renders `preview.png`, and exits non-zero on any error."
4. **Detail ladder.** "Pass 1: silhouettes and composition in Workbench. Pass 2: materials. Pass 3: lighting. Pass 4: micro-detail (bevels, wear, scatter, atmosphere). Don't add detail until the previous pass is approved."
5. **Critique, then edit.** "Read `preview.png`. List the three most important defects against the spec, each with a numeric fix (move X by 0.4 m, lens 35→50 mm, rim +1 stop). Apply only those and re-render." Minimum two rounds per shot, maximum four before escalating to the user.
6. **Data, not literals.** "All timing comes from `timing.json` (beats, onsets, lyric words, VO words) converted to frames. Never type frame numbers."

## Parameter Defaults

| Setting | Default | Notes |
|---|---|---|
| Preview | Workbench or EEVEE, 960×540, 1 frame per shot | ~1 s each; render the first, middle, last frame and every cue frame for motion review |
| Final stylized | EEVEE, 1920×1080 | Measured 0.13–1.4 s/frame on an M-series Max for dense procedural night-city sets |
| Final photoreal | Cycles, Metal, 24–64 spp + OIDN denoise | 3–5 s/frame at 24 spp; measure in the sample stage, don't assume |
| Output | PNG (or EXR for grading) image sequence | Never render straight to MP4; encode with the `ffmpeg` tool |
| Resume | `render.use_overwrite = False`, `render.use_placeholder = True`, `-s/-e` frame chunks | A killed render resumes where it stopped |
| Color | View transform pinned explicitly (AgX default; Standard for graphics that must hit exact hexes) | Unpinned color management drifts between machines |
| Timeouts | 120 s per preview; per-frame budget × frames for a render | Kill and report, don't hang |

## Quality Keywords

What actually produced detailed results in long-form agent-built music videos:

- **Procedural everything, from code:** geometry nodes and shader nodes for sets; signed-distance-field sculpts meshed and decimated to LODs for characters; armatures with keyed actions authored from numeric curves.
- **CC0 assets for realism:** Poly Haven HDRIs and PBR textures (send a unique User-Agent to its API), Quaternius CC0 animation libraries, Rigify for rigs.
- **Light like a cinematographer:** light-linked key/top/rim on the hero, separate emission materials for practicals (lamps, tail lights), HDR environment strength capped (~2.2) so it doesn't flatten the key, grade in the compositor.
- **Camera grammar named explicitly:** lens, f-stop, move, ease curve, target. Check camera clearance and rotation speed per frame (no clipping through geometry, no whip faster than intended).
- **Audio-driven motion:** kick and energy envelopes drive scale, light intensity, and camera shake; beats drive cuts and key poses.
- **Many critique rounds.** Detail came from the critic loop run repeatedly with measured QA and very long, specific briefs — not from one tool.

## Anti-Patterns

- Building in a live GUI session and never codifying it into a script; the shot can't be rebuilt.
- Using `action.fcurves`, `BLENDER_EEVEE_NEXT`, `scene.node_tree`, `use_bloom`, or `SoundSequence` (all gone in 5.x — see `blender-5-api`).
- Typing frame numbers instead of deriving them from `timing.json`.
- Adding detail before composition is approved; polishing a shot that will be cut.
- Rendering to MP4, rendering without resume, or running two GPU renders at once.
- Trusting the first Cycles Metal frame of a fresh process: it can carry a dark strip. Render one sacrificial frame first, and scan finished sequences for one-frame outliers.
- Assuming headless runs inherit GUI preferences. Enable the Metal devices inside the script.
- Silently swapping Blender for a paid video model when a render is slow. Report the measured ETA and ask.

## Workflow

1. **Read** the episode direction, the timing source (VO or music cuesheet), and the show look. Read `blender-5-api`.
2. **Spec** each Blender shot (`spec.yaml`) and get approval on the shot list.
3. **Timing**: convert beats/onsets/words to `timing.json` in frames; assert the frame totals equal the audio length ±1 frame.
4. **Assets**: fetch CC0 HDRIs/textures; record licence and hash.
5. **Layout**: write `shots/<id>/build.py`, run headless, render a Workbench thumbnail per shot, check object and triangle budgets, assemble a contact sheet.
6. **Look dev**: materials, lights, world; EEVEE preview stills; critique → fix loop (2–4 rounds). Check the histogram for pure-black or blown-out frames.
7. **Animation**: keyframes/drivers/NLA from `timing.json`; render the first/middle/last and every cue frame to a motion contact sheet; check for intersections, NaN transforms, foot slide, and velocity snaps.
8. **Sample**: render 10–18 s at final quality, measure seconds per frame, show the user the sample and the full-render ETA, and wait for approval.
9. **Render**: chunked, resumable, one shot per process. Verify the frame count equals the expected count and no frame is zero bytes.
10. **Compose**: encode with `ffmpeg`, mix audio, hand off to the compose and review stages.

## References

- `blender-5-api` — the 5.x API pitfalls cheat sheet (read first).
- `comfyui-local` — optional restyle/finish of Blender blocking with Wan 2.2.
- `local-sound` and `voicebox` — the local audio side of an all-local episode.
- Guide: `docs/local-production.md`.
- Research: SceneCraft (arXiv 2403.01248), BlenderAlchemy (2404.17672), BlenderGym (2504.01786), LL3M (2508.08228) — all depend on the render → look → fix loop and on version-specific API examples.
