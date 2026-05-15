# Full Demo Benchmark Plan

This is the long-form benchmark for agent-led validation after large harness updates. It complements `pnpm demo-matrix`, which is intentionally starter-backed and fast.

## What This Tests

Layer A: product confidence

- A fresh user project can be initialized, inspected, and operated by Codex or Claude from `AGENTS.md`.
- Paid provider setup is clear before any credits are spent.
- The harness can produce representative samples across source-free, audio-led, voiceover-led, screen-demo, talking-head, and mixed-source workflows.
- Remotion and HyperFrames decisions are made explicitly instead of hidden behind ffmpeg sample assembly.

Layer B: technical coverage

- CLI lifecycle: `init`, `doctor`, `new show`, `new episode`, `new pipeline`, `build`, `resume`, `export`.
- Providers: OpenAI image/TTS fallback, ElevenLabs narration, Higgsfield image-to-video, ffmpeg/ffprobe.
- Runtimes: ffmpeg rough cuts, Remotion composition validation, HyperFrames lint/validate/render checks where available.
- Artifacts: checkpoints, render reports, final review, decision log, cost log, Premiere XML, EDL, contact sheet.

## Prerequisites

```bash
export OPENAI_API_KEY="sk-..."
export ELEVENLABS_API_KEY="..."
higgsfield auth login
higgsfield account status --json
ffmpeg -version
ffprobe -version
```

For repeatable agent runs, prefer copying `.env.example` to `.env` in the benchmark project and filling the same keys there. The CLI loads project `.env` files before `doctor` and each benchmark command, and `.env` remains gitignored.

From a fresh user project:

```bash
predit init
predit doctor --profile paid-demo --json
```

The benchmark can continue only when doctor reports `ok` for OpenAI, ElevenLabs, Higgsfield binary, Higgsfield login, ffmpeg, and ffprobe.

## Suites

### Suite 1: Maintainer Smoke Matrix

Run this first after code changes:

```bash
pnpm demo-matrix --zero-key --json --keep-workdir
pnpm demo-matrix --paid-demo --json --keep-workdir
```

This covers starter-backed lanes only. It is the fastest signal for install, sample build, render verification, and editor handoff.

### Suite 2: Agent-Led Product Demos

Run these one at a time in a user project so failures are easy to inspect and provider spend stays bounded.

| Demo | Pipeline | Starter / setup | Primary coverage |
|---|---|---|---|
| Provider scratch explainer | `animated-explainer` | `predit new show explainer --from animated-explainer` | OpenAI image, ElevenLabs narration, Higgsfield clip, ffmpeg sample assembly |
| Audio-led supplied-track video | `music-video` or `news-song` | `predit new show audio-demo --from music-video` or `--from news-song` | Audio master clock, cuesheet, beat-synced edit, exports |
| Hosted / talking-head follow-up | `talking-head` | `predit new show host-demo --pipelines talking-head` | Voiceover master clock, captions, support cards, Remotion-oriented runtime choice |
| Screen / workflow walkthrough | `screen-demo` | `predit new show workflow --from ai-workflow-demo` | Synthetic terminal, UI demo structure, Remotion or HyperFrames proposal discussion |
| Mixed source + generated support | `hybrid` | `predit new show hybrid-demo --pipelines hybrid` plus a local source clip | Source media review, generated inserts, overlay density, runtime selection |
| Cinematic image-to-video trailer | `cinematic` | `predit new show trailer --from cinematic-trailer` | Reference image, motion-led promise, Higgsfield clip generation |

### Suite 3: Manifest Coverage Sweep

Use this after Suite 2 is stable. Create a short manual brief for each bundled manifest and run a sample or dry proposal pass:

- `animation`
- `avatar-spokesperson`
- `character-animation`
- `clip-factory`
- `daily-news`
- `documentary-montage`
- `hybrid`
- `localization-dub`
- `podcast-repurpose`
- `talking-head`
- `framework-smoke` (test-only; do not present as a product demo)

Some manifests are not demo-matrix lanes yet. Treat failures here as product-readiness findings, not regressions in the starter smoke matrix.

## Runtime-Specific Plan

Paid-demo samples currently assemble through ffmpeg for cost and consistency. That is fine for provider smoke, but it does not prove Remotion or HyperFrames production quality.

For Remotion:

1. Choose a brief that needs captions, charts, support cards, presenter/avatar, or typed React scenes.
2. Read `.predit/skills/meta/animation-runtime-selector.md` and `.predit/skills/core/remotion.md`.
3. Confirm `remotion` availability through `predit doctor --json` or registry availability.
4. Require the agent to log a `render_runtime_selection` decision with Remotion selected.
5. Verify the resulting render report has `runtime_used: remotion` and caption/style validation steps when applicable.

For HyperFrames:

1. Choose a brief that needs kinetic typography, product-promo HTML/CSS motion, website-to-video, or GSAP-heavy sequences.
2. Read `.predit/skills/meta/animation-runtime-selector.md` and `.predit/skills/core/hyperframes.md`.
3. Confirm `npx --no-install hyperframes --version` and `npx hyperframes doctor`.
4. Require lint and validate before render.
5. Verify the render report includes HyperFrames validation steps and `runtime_used: hyperframes`.

If both runtimes are available, the agent must present both options and wait for approval before locking one.

## Agent Prompt Template

Give this to Codex or Claude inside the fresh user project:

```text
Read AGENTS.md, then read .predit/skills/meta/onboarding.md and .predit/skills/meta/animation-runtime-selector.md.

Run `predit doctor --profile paid-demo --json` and summarize provider readiness. Do not spend credits until I approve.

Create one benchmark sample for: <demo name>. Use pipeline <pipeline>. Keep it to sample scope. Log every issue, confusing message, failed tool call, output path, and workaround in projects/<show>/<episode>/notes.md.

Before generation, present:
- pipeline and runtime recommendation
- providers/tools that will be used
- estimated cost
- output paths I should inspect

After the run, export Premiere and EDL packages, then summarize pass/fail with exact paths to render, contact sheet, render_report.json, decisions.json, cost_log.json, and export packages.
```

## Issue Log Template

Create `projects/<show>/<episode>/notes.md` with:

```markdown
# Benchmark Notes

## Setup
- Agent:
- Pipeline:
- Runtime:
- Provider profile:
- Date:

## Commands

## Outputs
- Render:
- Contact sheet:
- Premiere:
- EDL:

## Issues
- [ ] Severity:
  - Command:
  - Error:
  - Expected:
  - Actual:
  - Workaround:

## Follow-up Requests For Coding Agent
```

## First Three Recommended Demos

1. `animated-explainer`: best first paid provider smoke because it exercises OpenAI image, ElevenLabs narration, Higgsfield motion, and ffmpeg composition from a simple source-free brief.
2. `music-video` or `news-song`: best audio-led test because the track is the master clock and the output is easy to inspect for timing.
3. `screen-demo` plus a manual `hybrid` follow-up: best route to test recorded/source media plus generated support assets and runtime selection. Use the screen demo for the first Remotion/HyperFrames conversation, then use `hybrid` once source-media review is stable.
