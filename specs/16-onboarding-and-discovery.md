# 16 — Onboarding and Discovery

## When this applies

On the **first interaction** of a session in a user project, when the user's request is vague or exploratory ("make me a video", "what can you do?", "help me start a show"). Skip onboarding when the user arrives with a specific, actionable request — go straight to pipeline selection.

The purpose of onboarding is to turn a passive executor into a creative partner. Most users don't know what's possible. The agent's job is to show them — fast, with copy-paste prompts.

### Classification rule (vague vs specific)

Treat the request as **specific** if the user's message includes any **two** of:

- a duration (e.g. "60-second", "30 sec", "two-minute")
- a deliverable type (trailer, explainer, music video, news song, demo, talking head, clip)
- a platform (YouTube, Shorts, TikTok, Instagram Reels, LinkedIn)
- a topic, subject, or domain (any concrete noun phrase the agent can build around)

Otherwise treat as **vague** and onboard. When the classification is genuinely uncertain, ask one clarifying question rather than running the full onboarding flow.

## Protocol

### 1. Preflight discovery

Before saying anything creative, the agent knows what it's working with. Call:

```bash
predit update --check --json
predit doctor --profile paid-demo --json
predit ls tools --json
```

If `predit update --check --json` reports the `.predit/` cache is stale, missing, or incompatible, run `predit update` before reading bundled skills, pipeline manifests, playbooks, schemas, or starters. Agents reason from the project-local cache, so onboarding must keep it aligned with the installed harness.

Parse the output into three buckets:

- **Available** — tools with `available: true`.
- **Quick unlocks** — tools that are 1-minute fixes (env var or `cli-login`).
- **Hardware unlocks** — tools requiring local GPU or model downloads.

Also check composition runtime availability — Remotion, HyperFrames, ffmpeg — surfaced as distinct entries from `predit ls tools --json`. If Remotion or HyperFrames is unavailable, the setup offer is `predit setup runtimes`.

### 2. Setup-tier classification

Based on discovery, the agent classifies the user's setup:

| Tier | Available | Best pipelines |
|---|---|---|
| **Zero-key** | Local TTS (Piper) + ffmpeg + Remotion and/or HyperFrames | Animated explainer with free narration |
| **Starter** | One configured image provider + free TTS + at least one composition runtime | Animated explainer, animation (AI visuals) |
| **Standard** | Image gen + paid TTS + music gen | Animated explainer, animation, screen demo, hybrid |
| **Full** | Video gen + image gen + premium TTS + music | All pipelines including cinematic, avatar, talking head, music video |
| **Full + GPU** | Cloud APIs + local video gen models | All pipelines with free local fallbacks |

### 3. Greet and orient

Present a **short, friendly** capability summary. Do not dump raw JSON. Translate into plain language.

Rules:

- Lead with what works, not what's missing.
- Keep it to 8–12 lines max.
- Mention at most 2 quick-unlock suggestions. Don't nag.
- Read install instructions from the registry — never hardcode provider names or env vars.
- When env vars are missing, point to the generated `.env` file and committed `.env.example` instead of asking the user to create them from memory. Shell exports are still valid and override file values.

Template:

```
Welcome to predit. With your current setup I can:

Ready to go:
  - <2–4 capabilities in plain language>

Composition runtimes:
  - Remotion: <available | unavailable>
  - HyperFrames: <available | unavailable>
  - FFmpeg: <available | unavailable>

Available pipelines:
  - <pipelines that work with this setup, one-line each>

Quick upgrades — 1-minute fix (env var):
  - <best 1–2 env-var unlocks>

Quick upgrades — 1-minute fix (CLI login):
  - <best 1–2 cli-login unlocks>

5-minute installs:
  - <best 1–2 install unlocks>

Complex (GPU, model download):
  - <relevant local unlocks if interesting>
```

Composition runtimes appear as their own block, not folded into "capabilities" — because their per-runtime availability drives the present-both-runtimes rule downstream (see [`15-announce-and-escalate.md`](15-announce-and-escalate.md)).

Setup offers are grouped by **effort tier** (env var / CLI login / install / complex), not by capability, so the user can scan for "what's cheapest to fix right now."

Agents should adapt language to the operator:

- Non-technical user: account/login needed, what it unlocks, and whether it may cost money.
- Technical user: exact command, env var, file path, and failure output.
- Agent user: `--json` commands, redacted secrets, and issue notes under `projects/<show>/<episode>/notes.md`.

### 4. Composition runtime reporting

If both Remotion and HyperFrames are available, name **both** explicitly. Do not pick one in onboarding — runtime selection happens at proposal time after the agent understands the brief. See [`15-announce-and-escalate.md`](15-announce-and-escalate.md) → present-both-runtimes hard rule.

If only one is available, name it and mention what the other would unlock. If neither, the user is on ffmpeg only. Ask whether the user wants to run `predit setup runtimes` for this video; explain that it installs project-local Remotion and HyperFrames dev dependencies and that FFmpeg remains available if they skip.

### 5. Offer three starter prompts

Present exactly three prompts the user can copy now. Each targets a different pipeline or style. Mark each one for the pipeline it lands in.

Tier-specific examples:

**Zero-key:**
> "Make a 45-second animated explainer about why the sky is blue." (animated-explainer pipeline)

**Starter:**
> "Make a music video for the track I just dropped in `music_library/midnight-train/`." (music-video pipeline)

**Full:**
> "Make a cinematic 30-second trailer: humanity receives a warning from 1000 years in the future." (cinematic pipeline)

**Reference-based (all tiers):**
> "Paste a YouTube link and say 'make me something like this.' I'll analyze the style, pacing, and structure, then propose 2–3 creative variants."

Rules:

- Exactly 3 prompts.
- First prompt is the most impressive thing the user's setup can produce.
- Each prompt targets a different pipeline.
- Brief note explains what makes the prompt a good fit.
- Use blockquote formatting so prompts are easy to copy.

### 6. Workflow summary (2–3 sentences)

After prompts:

> When you give me a prompt, I'll start by understanding the brief, then propose concepts with cost estimates. You approve one, and I produce the video stage by stage, asking for approval at each creative decision. Final render lands in `projects/<show>/<episode>/renders/`.

Do not explain the architecture or three-layer model in onboarding. That's for the curious — point them at `AGENTS.md` if they want depth.

### 7. Common follow-up questions

**"What does it cost?"**

- Zero-key path: $0.
- One paid image provider: typically $0.30–$1.50 per video.
- Full setup: $1–$3 for most videos; music videos around $4–5 with cloud video gen.
- Always: "I'll show you exact cost estimates before spending anything."

**"How long does it take?"**

- Explainer (zero-key): 5–15 minutes.
- Explainer (image gen): 10–20 minutes.
- Music video: 30–45 minutes including approvals.
- Cinematic (video gen): 20–40 minutes.
- Most time is asset generation; research and scripting are fast.

**"Can you make [specific type]?"**

Match to a pipeline. If it fits, name the pipeline and the tools you'd use. If it doesn't fit any existing pipeline, be honest — suggest the closest match and explain what would be different.

**"I just want to test it quickly"**

Suggest the shortest zero-key prompt the user's setup supports.

## Anti-patterns

- **Don't dump raw JSON.** Translate registry output into plain language.
- **Don't list every tool.** Group by capability ("I can generate images with FLUX, Imagen, or Recraft" — not the full tool inventory).
- **Don't explain architecture.** The user came to make a video, not study the codebase.
- **Don't apologize for missing capabilities.** Frame as "here's what you have" and optionally "here's a quick upgrade." Never "unfortunately you don't have..."
- **Don't skip orientation when the user is uncertain.** 30 seconds of orientation saves 10 minutes of confusion.
- **Don't suggest prompts that need tools the user doesn't have.** Every prompt must be achievable with the current setup.
