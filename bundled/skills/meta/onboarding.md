---
name: onboarding
description: Orient new predit users, classify vague requests, and offer setup-aware starter prompts.
applies_to: meta
cross_refs:
  - specs/16-onboarding-and-discovery.md
  - specs/15-announce-and-escalate.md
---
# Onboarding

Use this on the first interaction in a user project when the request is vague or exploratory: "make me a video", "what can you do?", "help me start a show". Skip onboarding when the user gives a specific, actionable request and go straight to pipeline selection.

The goal is to turn uncertainty into a concrete, exciting next prompt without overwhelming the user.

## Vague vs Specific Classifier

Treat the request as specific if it includes any two of these four signals:

- A duration: "60-second", "30 sec", "two-minute".
- A deliverable type: trailer, explainer, music video, news song, demo, talking head, clip.
- A platform: YouTube, Shorts, TikTok, Instagram Reels, LinkedIn.
- A concrete topic, subject, or domain.

If fewer than two signals are present, treat it as vague and onboard. If classification is genuinely uncertain, ask one clarifying question instead of running the full flow.

## Six-Step Protocol

### Step 1: Run Preflight Discovery

Before saying anything creative, inspect the local setup:

```bash
predit doctor --json
```

Parse the result into:

- **Available**: tools and runtimes that can run now.
- **Quick unlocks - env var**: one-minute API key fixes.
- **Quick unlocks - CLI login**: one-minute auth fixes.
- **5-minute installs**: local package/binary installs.
- **Complex unlocks**: GPU, model downloads, or provider account setup.

Composition runtimes are their own discovery block: Remotion, HyperFrames, and FFmpeg. Do not bury them inside a generic "video tools" list.

### Step 2: Determine Setup Tier

| Tier | Available | Best pipelines |
|---|---|---|
| **Zero-key** | Local TTS, ffmpeg, and Remotion and/or HyperFrames | animated-explainer with free narration |
| **Starter** | One image provider, free TTS, and at least one composition runtime | animated-explainer, animation |
| **Standard** | Image generation, paid TTS, and music generation | animated-explainer, animation, screen-demo, hybrid |
| **Full** | Video generation, image generation, premium TTS, and music | cinematic, avatar, talking-head, music-video |
| **Full + GPU** | Cloud APIs plus local video/image models | all pipelines with local fallbacks |

If both Remotion and HyperFrames are available, name both. Runtime selection happens later at proposal time after the brief is understood.

### Step 3: Greet And Orient

Give a short, friendly capability summary. Do not dump raw JSON.

Template:

```text
Welcome to predit. With your current setup I can:

Ready to go:
- <2-4 plain-language capabilities>

Composition runtimes:
- Remotion: <available | unavailable>
- HyperFrames: <available | unavailable>
- FFmpeg: <available | unavailable>

Available pipelines:
- <pipeline>: <one-line fit>

Quick upgrades - env var:
- <best 1-2 unlocks>

Quick upgrades - CLI login:
- <best 1-2 unlocks>

5-minute installs:
- <best 1-2 unlocks>

Complex:
- <GPU/model/provider unlocks only if relevant>
```

Rules:

- Lead with what works.
- Keep it to 8-12 useful lines when possible.
- Mention at most two suggestions per effort tier.
- Read install instructions from the registry; do not hardcode provider names or environment variables.
- When env vars are missing, tell the user they can either export them in the current shell/agent session or copy `.env.example` to `.env` and fill the values. The CLI loads project `.env`, `.env.<command>`, and `.env.local`; shell values win.

### Step 4: Report Composition Runtimes Separately

When both Remotion and HyperFrames are available, say so explicitly. Do not choose one during onboarding.

When only one is available, name it and briefly say what the other would unlock. When neither is available, explain that the user is currently on ffmpeg-only composition and what install would unlock HTML/React composition.

This primes the later "present both runtimes" hard rule in `bundled/skills/meta/announce-and-escalate.md`.

### Step 5: Offer Three Starter Prompts

Offer exactly three prompts. Each should target a different pipeline or style and be achievable with the current setup.

Examples:

> "Make a 45-second animated explainer about why the sky is blue." (animated-explainer pipeline)

> "Turn this interview recording into 3 short clips for TikTok and YouTube Shorts." (clip-factory pipeline)

> "Paste a YouTube link and say: make me something like this. Analyze the style, pacing, and structure, then propose 2-3 creative variants." (reference-driven workflow)

Rules:

- The first prompt should be the most impressive thing the setup can produce now.
- Use blockquote formatting so prompts are easy to copy.
- Add one brief note explaining why each prompt fits.
- Do not suggest prompts that require unavailable tools.

### Step 6: Summarize The Workflow

Close with 2-3 sentences:

```text
When you give me a prompt, I will understand the brief, propose concepts with cost estimates, and ask you to approve one. Then I produce the video stage by stage, checkpointing work and asking for approval at the creative gates. Final render and editor handoff land under projects/<show>/<episode>/.
```

## Follow-Up Answers

**How do I use the CLI?**

Use this sequence for a first video:

```bash
predit doctor --profile paid-demo
predit ls starters
predit new show <show> --from <starter>
predit new episode <show> <episode>
predit build <show>/<episode> --sample --provider-profile paid-demo
predit export <show>/<episode> --target premiere
```

For a zero-key starter, use `predit init --starter music-video`, then run
`predit build music-video/sample-episode --sample`. For custom workflows, use
`predit new pipeline <slug>` to create a local manifest and first director skill,
then bind a show to it with `predit new show <show> --pipelines <slug>`.

**What does it cost?**

- Zero-key path: $0.
- One paid image provider: usually around $0.30-$1.50 per short video.
- Full setup: often $1-$3; cloud-video-heavy music videos can be around $4-$5.
- Always show exact estimates before spending.

**How long does it take?**

- Zero-key explainer: 5-15 minutes.
- Image-generation explainer: 10-20 minutes.
- Music video: 30-45 minutes including approvals.
- Cinematic video-generation path: 20-40 minutes.

**Can you make <specific type>?**

Match it to the closest pipeline. If no existing pipeline fits, say so and explain the nearest viable route.

## Anti-Patterns

- Do not dump raw JSON.
- Do not list every tool; group by capability.
- Do not explain the harness architecture unless asked.
- Do not apologize for missing capabilities.
- Do not skip onboarding when the user is uncertain.
- Do not suggest prompts that need unavailable tools.
- Do not choose Remotion or HyperFrames during onboarding.
