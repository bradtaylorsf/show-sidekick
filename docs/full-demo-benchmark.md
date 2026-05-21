# Full Demo Benchmark Plan

This is the long-form benchmark for agent-led validation after large harness updates. It complements `pnpm demo-matrix`, which is intentionally starter-backed and fast.

## What This Tests

Layer A: product confidence

- A fresh user project can be initialized, inspected, and operated by Codex or Claude from `AGENTS.md`.
- Paid provider setup is clear before any credits are spent.
- The first no-key artifact is a personalized narrated animated explainer derived from safe project/session context, not a generic smoke sample.
- The harness can produce representative samples across source-free, audio-led, voiceover-led, screen-demo, talking-head, and mixed-source workflows.
- Remotion and HyperFrames decisions are made explicitly, and paid samples use the configured runtime when it is installed.

Layer B: technical coverage

- CLI lifecycle: `init`, `doctor`, `new show`, `new episode`, `new pipeline`, `build`, `resume`, `export`.
- Providers: OpenAI GPT Image 2 stills, ElevenLabs narration, OpenAI TTS fallback, Higgsfield image-to-video, ffmpeg/ffprobe.
- Runtimes: ffmpeg rough cuts, Remotion renders, HyperFrames lint/validate/render checks where available.
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

For repeatable agent runs, fill the generated `.env` in the benchmark project with the provider keys you want to test. The committed `.env.example` stays as the blank setup map for future agents. The CLI loads project `.env` files before `doctor` and each benchmark command, and `.env` remains gitignored.

From a fresh user project:

```bash
showkick init
showkick doctor --profile paid-demo --json
```

The benchmark can continue only when doctor reports `ok` for Higgsfield binary/login, OpenAI, ElevenLabs, ffmpeg, and ffprobe. `showkick init` installs Remotion and HyperFrames by default when npm is available; rerun `showkick setup runtimes` before Remotion or HyperFrames lanes only if runtime setup was skipped, failed, or needs repair.

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
| Personalized no-key animated explainer | `animated-explainer` | `showkick new show first-video --from animated-explainer`; ask what the user does; rewrite `script.txt` into four safe context-aware narrated scene lines | Agent onboarding, local TTS, zero-key procedural Remotion renderer, script personalization, cuesheet, export path |
| Provider scratch explainer | `animated-explainer` | `showkick new show explainer --from animated-explainer` | OpenAI GPT Image 2 still frames, ElevenLabs narration, Higgsfield Seedance clips, configured runtime render when available |
| Audio-led supplied-track video | `music-video` or `news-song` | `showkick new show audio-demo --from music-video` or `--from news-song` | Audio master clock, lyric-first sample planning, GPT Image 2 prompt packet, beat-synced edit, exports |
| Hosted / talking-head follow-up | `talking-head` | `showkick new show host-demo --pipelines talking-head` | Voiceover master clock, captions, support cards, Remotion-oriented runtime choice |
| Screen / workflow walkthrough | `screen-demo` | `showkick new show workflow --from screen-demo` | Synthetic terminal, UI demo structure, Remotion or HyperFrames proposal discussion |
| Mixed source + generated support | `hybrid` | `showkick new show hybrid-demo --pipelines hybrid` plus a local source clip | Source media review, generated inserts, overlay density, runtime selection |
| Cinematic image-to-video trailer | `cinematic` | `showkick new show trailer --from cinematic-trailer` | Reference image, motion-led promise, Higgsfield clip generation |

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

Paid-demo samples create multiple generated motion clips from script beats. They render with the episode/show/pipeline runtime when that runtime is available; otherwise they log the unavailable runtime and use ffmpeg as a rough-cut fallback.

For Remotion:

1. Choose a brief that needs captions, charts, support cards, presenter/avatar, or typed React scenes.
2. Read `.show-sidekick/skills/meta/animation-runtime-selector.md` and `.show-sidekick/skills/core/remotion.md`.
3. Confirm `remotion` availability through `showkick ls tools --json`; if unavailable, ask to run `showkick setup runtimes`.
4. Require the agent to log a `render_runtime_selection` decision with Remotion selected.
5. Verify the resulting render report has `runtime_used: remotion` and caption/style validation steps when applicable.

For HyperFrames:

1. Choose a brief that needs kinetic typography, product-promo HTML/CSS motion, website-to-video, or GSAP-heavy sequences.
2. Read `.show-sidekick/skills/meta/animation-runtime-selector.md` and `.show-sidekick/skills/core/hyperframes.md`.
3. Confirm `npx --no-install hyperframes --version` and `npx hyperframes doctor`; if unavailable, ask to run `showkick setup runtimes`.
4. Require lint and validate before render.
5. Verify the render report includes HyperFrames validation steps and `runtime_used: hyperframes`.

If both runtimes are available, the agent must present both options and wait for approval before locking one.

## Agent Prompt Template

Give this to Codex or Claude inside the fresh user project:

```text
Read AGENTS.md, then read .show-sidekick/skills/meta/onboarding.md and .show-sidekick/skills/meta/animation-runtime-selector.md.

Run `showkick doctor --profile paid-demo --json` and summarize provider readiness. Do not spend credits until I approve.

Create one benchmark sample for: <demo name>. Use pipeline <pipeline>. Keep it to sample scope. If this is the personalized no-key animated explainer, ask what the user does, use only safe context from this project/session, offer three ideas, write four short narrated scene lines to the starter script file, and do not use paid providers. Log every issue, confusing message, failed tool call, output path, and workaround in projects/<show>/<episode>/notes.md.

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

1. Personalized no-key animated explainer: best first UX smoke because it proves a blank project plus an agent can create a useful narrated motion-graphics video without API keys.
2. `animated-explainer`: best first paid provider smoke because it exercises OpenAI GPT Image 2 still generation, ElevenLabs narration, Higgsfield Seedance motion clips, and the configured composition runtime from a simple source-free brief.
3. `screen-demo` plus a manual `hybrid` follow-up: best route to test recorded/source media plus generated support assets and runtime selection. Use the screen demo for the first Remotion/HyperFrames conversation, then use `hybrid` once source-media review is stable.
