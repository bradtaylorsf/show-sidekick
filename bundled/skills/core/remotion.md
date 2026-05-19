---
name: "remotion"
description: "Show Sidekick Remotion composition routing, scene catalog, prop patterns, validation, and render verification."
applies_to: "core"
cross_refs:
  - "bundled/skills/meta/animation-runtime-selector.md"
  - "bundled/skills/core/hyperframes.md"
---
# Remotion Skill

## When to Use

Use Remotion for advanced video composition from Phase 3 onward — anywhere that requires
React-based scene assembly, parametric templates, animated overlays, transitions, or
data-driven batch rendering. For simple cuts, burns, and encodes, prefer FFmpeg directly.

## Relationship to Remotion Agent Skills

The **bundled/vendor agent skills** (`.show-sidekick/skills/agents/remotion-best-practices.md`, when installed) teach correct
Remotion API usage — imports, timing, animation constraints, code patterns.
**This file** teaches how Show Sidekick uses Remotion — which compositions map to pipeline
stages, how artifacts flow in, and how renders are triggered.

## Runtime Position

Remotion is a first-class composition runtime, not a silent default. At proposal
time, if both Remotion and HyperFrames are available, present both and log
`render_runtime_selection` before locking the runtime. Use
`bundled/skills/meta/animation-runtime-selector.md` for the full matrix.

Remotion is usually strongest when the video benefits from React scene
components, typed props, captions, charts, presenter/avatar composition, or a
mixed timeline of stills, clips, overlays, and audio.

| Use Case | Backend | Why |
|----------|---------|-----|
| Video clips + animated stills + text cards | **Remotion** | Mixed content in one pass |
| Video-only cuts with transitions | **Remotion** | Native `<OffthreadVideo>` + transitions |
| Animated diagrams/text cards | **Remotion** | Frame-by-frame control |
| Data-driven batch videos | **Remotion** | Zod props + parametric renders |
| Word-level captions (in composition) | **Remotion** | CaptionOverlay with word highlight — superior to SRT |
| Audio embedding (narration + music) | **Remotion** | Native `<Audio>` components with volume/fade |
| Kinetic typography / GSAP-native HTML motion | HyperFrames | Often more natural for HTML/CSS/GSAP authoring |
| Simple trim, concat, standalone subtitle burn | FFmpeg | Instant, deterministic, no React render needed |

Do not swap from Remotion to another runtime without approval and a superseding
decision-log entry.

## Supported Scene Types (Cut Types)

The current Show Sidekick Remotion scene library lives in `src/remotion/scenes/`. Each
scene exports a component function and a Zod props schema.

| Type | Props Required | Best For |
|------|---------------|----------|
| `text_card` | `title`; optional `eyebrow`, `subtitle`, `body`, `align` | Statements, titles, closing messages |
| `stat_card` | `label`, `value`; optional `delta`, `trend`, `footnote` | Big numbers and proof points |
| `hero_title` | `kicker`, `title`; optional `subtitle`, `background_label` | Openers and section resets |
| `callout` | `label`, `text`, `tone` | Warnings, tips, quotes, emphasis |
| `comparison` | `title`, `left`, `right`; each side has `label`, `headline`, `points` | Before/after, A/B, versus |
| `bar_chart` | `title`, `data`; optional `subtitle`, `value_suffix` | Rankings and category comparisons |
| `line_chart` | `title`, `x_labels`, `series` | Trends and trajectories |
| `pie_chart` | `title`, `data`; optional `center_label` | Proportions and breakdowns |
| `kpi_grid` | `title`, `items` | Dashboards and compact metrics |
| `progress_bar` | `label`, `value`; optional `target_label`, `caption` | Readiness, progress, journey beats |
| `terminal_scene` | `title`, `prompt`, `lines`, `cursor` | CLI/product demos and technical beats |
| `anime_scene` | `title`, `character`, `action`, `setting`; optional `mood` | Stylized character/action beat |

Overlays live in `src/remotion/overlays/`: `section_title`, `stat_reveal`,
`hero_title`, and `provider_chip`.

### Anime Scene - Stylized Action Beat

The current `anime_scene` is a typed stylized action card, not a generated
multi-image renderer. Use it when a scene plan needs a character/action/setting
beat that stays inside the local Remotion scene library.

Required props:

- `title`
- `character`
- `action`
- `setting`

Optional prop: `mood`.

**Zero-key video strategy:** When no image or video generation is available, build
entire videos from these component types. A well-composed sequence of hero_title ->
kpi_grid -> bar_chart -> comparison -> stat_card -> text_card produces a polished,
professional video with zero external dependencies.

### The Proven Formula for Zero-Key Videos

These rules were discovered through systematic render testing and produce cinematic results:

**1. Commit to one background family per video.** Use a coherent background treatment derived from the playbook or custom identity instead of forcing every sequence into the same dark dashboard look.
This prevents jarring white↔dark flash transitions and makes chart colors pop dramatically.
The goal is visual cohesion, not a mandatory dark theme.

**2. Match the Zod prop schema.** Use the prop names in `src/remotion/scenes/*`.
For example, `text_card` uses `title`, `subtitle`, and `body`; `bar_chart` uses
`data`, not `chartData`.

**3. KPI Grid data rules:**
- `value` must be a small, human-readable number. The component can format values for display.
  For "8.1 Billion" use `value: 8.1, suffix: " Billion"`. Never use raw huge numbers with a suffix.
- `change` must be a NUMBER (e.g., `3.2`), not a string (e.g., NOT `"+3.2%"`).

**4. Comparison and Callout shape:**
- `comparison.left` and `comparison.right` each require `label`, `headline`, and `points`.
- `callout` uses `label`, `text`, and `tone`.

**5. Overlays add polish.**
- `section_title` overlays group scenes narratively ("THE CRISIS", "THE DATA").
- `stat_reveal` overlays float dramatic numbers over chart scenes (e.g., "10x" in corner).

**6. Scene pacing:** 4-6 seconds per scene, 8-10 scenes for a 45-50s video. Give chart
animations at least 4 seconds to complete. Hero title needs only 4 seconds.

**7. Color palette cohesion.** Pick 4-5 accent colors that relate to the topic and use
them consistently across charts, overlays, and accents. Use the same chartColors array
across bar/pie/line scenes for visual unity.

**Reference fixtures:** See `src/remotion/fixtures/index.ts` and
`src/remotion/__snapshots__/scenes.test.ts.snap` for current prop examples.

### Spring vs Interpolate

Use `interpolate()` for deterministic linear mappings: fades, slides, color
mixes, progress bars, and chart reveals where frame N should always map to a
specific value.

Use `spring()` when the motion needs physical easing: card entrances, character
beats, emphasis pops, and camera moves that should feel organic. Keep spring
configs explicit (`damping`, `stiffness`) so the same scene renders identically
across machines.

Do not use CSS transitions or requestAnimationFrame for rendered motion.
Remotion motion should be frame-derived from `useCurrentFrame()`.

### Pre-Render Validation (mandatory)

**Always run `composition_validator` before rendering.** It catches:
- Missing asset files (images, audio) that would cause render failures
- Narration audio longer than video duration (audio gets cut off)
- Music shorter than video (silence at end)
- Invalid cut timings (out ≤ in)

```ts
import compositionValidator from "../../src/tools/composition-validator.js";

const result = await compositionValidator.execute(
  {
    composition_path: "path/to/composition.json",
    assets_root: "src/remotion/public",
  },
  ctx,
);
// result.valid must be true before rendering
```

**Audio duration alignment:**
- After generating TTS narration, the tool returns `audio_duration_seconds`.
- If narration exceeds video duration: shorten script and regenerate, OR extend the last scene.
- Use `ffprobe` or the duration metadata returned by the Show Sidekick audio tools to check any audio file's duration.
- Music should be ≥ video duration; the player handles fade-out via `fadeOutSeconds`.

## Architecture

```
src/remotion/
├── src/
│   ├── Root.tsx              # Composition registry
│   ├── compositions/         # One file per pipeline type
│   │   ├── Explainer.tsx     # Generated explainer composition
│   │   ├── AnimatedScene.tsx # Individual animated scene
│   │   └── TitleCard.tsx     # Standalone title card
│   ├── components/           # Reusable visual building blocks
│   │   ├── Caption.tsx       # Subtitle/caption renderer
│   │   ├── DiagramOverlay.tsx
│   │   ├── ProgressBar.tsx
│   │   └── TransitionWrapper.tsx
│   └── playbooks/               # Tailwind + playbook-derived styles
├── public/                   # Static assets (fonts, LUTs)
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

## Pipeline Integration

### How Artifacts Map to Remotion Props

| Show Sidekick Artifact | Remotion Prop | Maps To |
|---------------------|---------------|---------|
| `scene_plan.json` → `scenes[]` | `scenes` prop | `<TransitionSeries>` children |
| `scene.type` | Component selector | `talking_head` → `<Video>`, `diagram` → `<DiagramOverlay>`, etc. |
| `scene.start_seconds` / `end_seconds` | `from` / `durationInFrames` | `fps * seconds` conversion |
| `scene.transition_in` / `transition_out` | `<TransitionSeries.Transition>` | `fade`, `slide`, `wipe` |
| `asset_manifest.json` → assets | `assets` prop | `staticFile()` or absolute paths |
| `style_playbook` | `theme` prop | Colors, fonts, animation curves |
| `edit_decisions.json` → cuts | `cuts` prop | `<Series>` with trimmed `<Video>` segments |
| `media_profile` | Composition dimensions | `width`, `height`, `fps` from profile |

### Render Invocation

The orchestrator calls Remotion renders via CLI:

```bash
# Standard render (composition name is "Explainer", no entry point needed)
npx remotion render Explainer \
  --props="public/demo-props/my-video.json" \
  --output=output/final.mp4 \
  --codec=h264 --crf=18

# With specific media profile
npx remotion render Explainer \
  --width=1080 --height=1920 --fps=30 \
  --props="public/demo-props/my-video.json" \
  --output=output.mp4
```

**Note:** Do NOT specify `src/index.ts` as entry point — Remotion auto-discovers compositions. The composition name is `Explainer` (not `ExplainerVideo`).

In Show Sidekick, invoke through the registry-backed `video_compose` or `remotion` tool path; do not shell around the registry for production work.

### Media Profile Mapping

| Show Sidekick Profile | Remotion Config |
|--------------------|-----------------|
| `youtube_landscape` | `width: 1920, height: 1080, fps: 30` |
| `youtube_shorts` | `width: 1080, height: 1920, fps: 30` |
| `tiktok_vertical` | `width: 1080, height: 1920, fps: 30` |
| `instagram_reels` | `width: 1080, height: 1920, fps: 30` |
| `instagram_square` | `width: 1080, height: 1080, fps: 30` |
| `cinematic_wide` | `width: 2560, height: 1080, fps: 24` |

## Key Patterns

### Scene Plan to Composition

Each scene in `scene_plan.json` becomes a child of `<TransitionSeries>`:

```tsx
// Pseudocode — actual component in src/remotion/src/compositions/Explainer.tsx
const Explainer: React.FC<ExplainerProps> = ({ scenes, theme, assets }) => {
  return (
    <TransitionSeries>
      {scenes.map((scene, i) => (
        <React.Fragment key={scene.id}>
          {scene.transition_in && (
            <TransitionSeries.Transition
              presentation={mapTransition(scene.transition_in)}
              timing={timing({ durationInFrames: 15 })}
            />
          )}
          <TransitionSeries.Sequence durationInFrames={secondsToFrames(scene)}>
            <SceneRenderer scene={scene} theme={theme} assets={assets} />
          </TransitionSeries.Sequence>
        </React.Fragment>
      ))}
    </TransitionSeries>
  );
};
```

### Dynamic Duration with calculateMetadata

When TTS audio determines video length (generated explainers), use `calculateMetadata`:

```tsx
export const ExplainerVideo = {
  component: Explainer,
  calculateMetadata: async ({ props }) => {
    const totalDuration = props.scenes.reduce(
      (sum, s) => sum + (s.end_seconds - s.start_seconds), 0
    );
    return {
      durationInFrames: Math.ceil(totalDuration * props.fps),
      fps: props.fps,
      width: props.width,
      height: props.height,
    };
  },
};
```

### Style Playbook to Theme

Style playbooks (`bundled/playbooks/`) define visual parameters. Map them to Remotion themes:

```tsx
// Derived from the style playbook YAML
const cleanProfessional = {
  background: "#FFFFFF",
  text: "#1A1A1A",
  accent: "#2563EB",
  fontFamily: "Inter",
  headingWeight: 600,
  transitionType: "fade",
  transitionDuration: 15, // frames
  animationEasing: "easeInOutCubic",
};
```

### Audio Layering

Narration + background music + SFX as parallel `<Audio>` components.

**Music offset and looping:** The `audio.music` config supports:
- `offsetSeconds` — skip quiet intros, start from the energetic part of the track. Use the audio energy/cuesheet tooling to find the optimal offset automatically.
- `loop` — loop the music if it's shorter than the video. Remotion handles this natively.
- `fadeInSeconds` / `fadeOutSeconds` — smooth volume ramps at start/end.

```json
"audio": {
  "music": {
    "src": "project/music.mp3",
    "volume": 0.15,
    "offsetSeconds": 55,
    "loop": false,
    "fadeInSeconds": 2,
    "fadeOutSeconds": 3
  }
}
```

```tsx
<AbsoluteFill>
  <Audio src={narrationUrl} />
  <Audio src={musicUrl} volume={0.06} startFrom={offsetFrames} loop />
  {sfxCues.map(cue => (
    <Sequence key={cue.id} from={secondsToFrames(cue.time)}>
      <Audio src={cue.url} volume={cue.volume} />
    </Sequence>
  ))}
  {/* Visual layers */}
</AbsoluteFill>
```

### Cost Tracking

Remotion renders are CPU-intensive but $0 API cost. Track via cost tracker:
- `estimate`: based on composition duration × resolution tier
- `reserve`: 0 (no API spend)
- `reconcile`: wall-clock render time for benchmarking

## Critical Constraints

- **No CSS animations or transitions** — they don't render correctly. Use `useCurrentFrame()` + `interpolate()` for all motion.
- **No Tailwind animation classes** — `animate-*` classes break frame-based rendering. Static Tailwind utilities are fine.
- **Always clamp interpolate()** — use `extrapolateLeft: 'clamp', extrapolateRight: 'clamp'` to prevent values shooting past endpoints.
- **`useVideoConfig().durationInFrames` returns COMPOSITION duration, not Sequence duration** — This is the #1 Remotion footgun. If your composition is 31s (930 frames) and a scene's `<Sequence>` is 5s (150 frames), `durationInFrames` still returns 930 inside that scene. Any crossfade, camera motion, or timing logic that uses `durationInFrames` directly will be wildly wrong. **Fix:** Pass `sceneDurationSeconds` as a prop from the parent and compute `effectiveDuration = Math.round(sceneDurationSeconds * fps)` inside the component. The `AnimeScene` component implements this pattern.
- **Node.js 18+ required** — listed as optional in minimum system, required in recommended.
- **Render in series, not parallel** — unless the machine has enough RAM. Each render spawns a Chromium instance.

## Post-Render Verification Protocol (ALL pipelines)

**Every Remotion render MUST be verified before presenting to the user.** This protocol applies
to ALL pipelines, not just explainer. Pipeline-specific compose-directors may extend it but
must not skip any step.

**Step 1: Probe the output file (GATE — blocks all other steps):**
```bash
ffprobe -v quiet -print_format json -show_format -show_streams rendered_video.mp4
```
Verify ALL of:
- [ ] Video stream exists with correct resolution and FPS
- [ ] **Audio stream exists** — if missing, STOP immediately, fix audio config, re-render
- [ ] Duration within ±5% of target
- [ ] File size is reasonable (not 0 bytes, not suspiciously small)

**If audio stream is missing, do NOT proceed.** This means narration/music were not embedded.
The most common cause: audio sources were mixed externally but never passed in the Remotion
`audio` prop. Fix: add `audio.narration` and `audio.music` to composition props and re-render.

**Step 2: Extract review frames** at scene midpoints and visually inspect each one.

**Step 3: Transcribe the rendered video's audio** using WhisperX/transcriber tool.
- If 0 words returned → audio is silent despite stream existing → investigate
- If word count < 80% of script → audio is cut off → investigate
- Compare last transcribed word to last scripted word

**Step 4: Present structured review** to user with file stats, audio verification results,
visual findings, and caption status before declaring the video complete.

## Quality Checklist

- [ ] Composition duration matches sum of scene durations minus transition overlaps
- [ ] All `staticFile()` references resolve to existing assets
- [ ] Transitions don't cut off content (account for overlap in timing)
- [ ] **Audio stream present in rendered output** (ffprobe confirms codec_type: "audio")
- [ ] **Narration words verified via transcription** (not just assumed from props)
- [ ] Audio layers are in sync with visual scenes
- [ ] Captions/subtitles rendering correctly (Remotion CaptionOverlay preferred over FFmpeg SRT)
- [ ] Theme colors match the active style playbook
- [ ] Output resolution and FPS match the target media profile
- [ ] Render completes without Chromium timeout errors
- [ ] Final output plays correctly on target platform
- [ ] Text-bearing scenes (CTA, titles) use Remotion text_card, NOT AI-generated images with text
