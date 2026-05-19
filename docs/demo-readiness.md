# Demo Readiness

This guide is for reviewers and coding agents validating Show Sidekick as a CLI-first harness. Default to the CLI/user-project model unless you are deliberately maintaining the harness internals.

For the final human-owned npm and website launch steps, use the [release checklist](release-checklist.md).

## Operating Models

The legacy in-repo model runs from the harness checkout. Maintainers use it for source edits, schema tests, and matrix automation:

```bash
pnpm dev <args>
pnpm demo-matrix --zero-key --keep-workdir
pnpm demo-matrix --paid-demo --keep-workdir
```

This model is allowed for harness development, but it is not how reviewers should judge the product experience.

The CLI/user-project model runs Show Sidekick from a separate folder owned by the show operator. The harness provides the CLI and the `.show-sidekick/` bundled cache; the user project owns `shows/`, `projects/`, renders, exports, and local overrides. Reviewers and agents should use this model for demos:

```bash
showkick init --starter animated-explainer
showkick build animated-explainer/sample-episode --sample
showkick export animated-explainer/sample-episode --target premiere
```

Do not require operators to work inside the harness repo. Do not edit `.show-sidekick/` inside the user project; refresh it with `showkick update` or override resources in project-local `pipelines/`, `playbooks/`, or `skills/`.

## Local Development Without Publishing

Use this path when validating local harness changes before publishing a package. The CLI is built once in the harness repo, then invoked by absolute `dist` path from a separate user project.

```bash
HARNESS=/absolute/path/to/show-sidekick            # your harness checkout
DEMO_ROOT=/tmp/show-sidekick-demo

cd "$HARNESS"
pnpm install
pnpm build
pnpm show-types:check
pnpm show-types:matrix -- --zero-key

mkdir -p "$DEMO_ROOT"
cd "$DEMO_ROOT"

node "$HARNESS/dist/cli/index.js" init --starter animated-explainer
node "$HARNESS/dist/cli/index.js" build animated-explainer/sample-episode --sample
node "$HARNESS/dist/cli/index.js" export animated-explainer/sample-episode --target premiere --overwrite
node "$HARNESS/dist/cli/index.js" export animated-explainer/sample-episode --format edl --overwrite
```

Expected local outputs:

- Runtime workspace: `projects/animated-explainer/sample-episode/`
- Render: `projects/animated-explainer/sample-episode/renders/sample-preview.mp4`
- Premiere package: `exports/animated-explainer__sample-episode.premiere/`
- EDL package: `exports/animated-explainer__sample-episode.edl/`
- Show-type reports: `show-types-matrix-report.json` and `show-types-matrix-report.md` in the matrix work directory.

## Provider Setup Without Storing Credentials In The Repo

The zero-key `animated-explainer` sample can run without provider credentials. Its renderer turns the starter script lines into narrated procedural Remotion motion-graphics scenes and writes the voiceover cuesheet needed for export, so agent-guided onboarding can personalize the first artifact before any paid calls. Paid demo lanes use the `paid-demo` provider profile described in [Provider Profiles](provider-profiles.md).

Use environment variables and provider CLIs. Do not store credentials in `show.yaml`, `episode.yaml`, `.show-sidekick/`, starter files, committed docs, or generated artifacts.

```bash
export OPENAI_API_KEY="sk-..."
export ELEVENLABS_API_KEY="..."

higgsfield auth login
higgsfield account status --json

node "$HARNESS/dist/cli/index.js" doctor --profile paid-demo
node "$HARNESS/dist/cli/index.js" build news-song/sample-episode --sample --provider-profile paid-demo
```

In user projects, the same keys can live in the generated, gitignored `.env`; `.env.example` is the committed blank setup map. Show Sidekick loads `.env`, `.env.<command>`, and `.env.local` before `doctor`, `build`, and other commands, while preserving any values already exported in the shell.

Provider expectations for `paid-demo`:

- OpenAI: GPT Image 2 still generation and fallback TTS through `OPENAI_API_KEY`.
- Higgsfield: image-to-video through the `higgsfield` CLI, optional GPT Image 2 still generation through the same CLI, and an authenticated `higgsfield account status --json`.
- ElevenLabs: primary TTS through `ELEVENLABS_API_KEY`.
- Local media: `ffmpeg` and `ffprobe` on `PATH`.

## Green Paths And Known Blockers

The demo matrix is starter-driven. It reads `bundled/starters/*/show.yaml`, selects starters whose `sample_support` matches the chosen mode, initializes each in a fresh user project, builds `sample-episode`, verifies artifacts/media/exports, and writes `demo-matrix-verification.json`.

The paid-demo sample dispatcher now honors the configured runtime when it is installed in the user project. If Remotion or HyperFrames is unavailable, it logs the unavailable runtime and uses ffmpeg as an explicit rough-cut fallback. Local source/reference images are preflighted before paid asset generation; expired URL JSON or other non-image payloads stop the run before OpenAI/Higgsfield calls. Use [Full Demo Benchmark Plan](full-demo-benchmark.md) for agent-led Remotion and HyperFrames demos that inspect runtime-specific composition quality.

Current expected green paths:

- `pnpm demo-matrix --zero-key --only animated-explainer --keep-workdir`
- `pnpm demo-matrix --paid-demo --keep-workdir` after `showkick doctor --profile paid-demo` is green for Higgsfield, OpenAI, ElevenLabs, ffmpeg, and ffprobe.

| Starter | Default Pipeline | sample_support | Expected Status | Notes |
|---|---|---|---|---|
| `animated-explainer` | `animated-explainer` | `both` | Green for zero-key; included in paid-demo | Zero-key narrated Remotion first-video explainer and export path are the first validation lane. |
| `music-video` | `music-video` | `both` | Green for zero-key; included in paid-demo | Audio-led multi-card idea reel remains available for track-oriented smoke tests. |
| `ai-workflow-demo` | `screen-demo` | `paid` | Paid-demo only | Requires paid-demo provider setup; synthetic terminal fixture. |
| `cinematic-trailer` | `cinematic` | `paid` | Paid-demo only | Requires paid-demo provider setup. |
| `last-rev` | `screen-demo` | `paid` | Paid-demo only | Default lane is `screen-demo`; `talking-head` is also declared for follow-ups. |
| `news-song` | `news-song` | `paid` | Paid-demo only | Requires paid-demo provider setup. |
| `rave-queen` | `cinematic` | `paid` | Paid-demo only | Show starter on `cinematic`, not an `animation` default. |
| `thechaosfm` | `news-song` | `paid` | Paid-demo only | Ain't No Crowns is a show benchmark, not a default-pipeline benchmark. |
| `documentary` | `documentary-montage` | `unsupported` | Blocked | Needs sample-support metadata and a verified sample provider path. |
| `product-demo` | `screen-demo` | `unsupported` | Blocked | Needs sample-support metadata and a verified sample provider path. |
| `ww2-diary` | `cinematic` | `unsupported` | Blocked | Show starter only; not a bundled pipeline type. |

## Demo Readiness Inventory

`src/pipelines/demo-inventory.ts` is the canonical inventory for bundled pipeline demo readiness. [Show Types](show-types.md) is the public catalog and validation-lane source of truth that maps this pipeline inventory to starter lanes. Update both in the same change as any bundled manifest or starter binding change.

### Classifications

- `core_default`: primary bundled lanes that default starters may target directly.
- `seeded_extension`: shipped extension lanes that are valid starter targets but are not the first demo path.
- `test_only`: harness test fixtures. These may ship as manifests but must never be used by a default starter.
- `show_starter_only`: show concepts that may exist as starters/playbooks but must not be added as bundled pipeline manifest types.

### Current Bundled Manifest Slugs

Approved bundled manifest slugs:

- `animated-explainer`
- `animation`
- `avatar-spokesperson`
- `character-animation`
- `cinematic`
- `clip-factory`
- `daily-news`
- `documentary-montage`
- `hybrid`
- `localization-dub`
- `music-video`
- `news-song`
- `podcast-repurpose`
- `screen-demo`
- `talking-head`

Test-only lane:

- `framework-smoke`

Show-starter-only concepts are denylisted in `SHOW_ONLY_DENYLIST`. Examples include `ww2-diary`, `thechaosfm`, `last-rev`, `rave-queen`, `gta-political`, and `aint-no-crowns`. These slugs may appear under `bundled/starters/`, playbooks, or demo briefs, but they must never appear as `bundled/pipelines/<slug>.yaml`.

### Runnable Demo Matrix

The maintainer demo matrix is starter-driven, not manifest-driven. It reads `bundled/starters/*/show.yaml`, keeps only fixture-backed starters whose declared `sample_support` matches the selected mode, initializes each starter in a fresh user project, and runs `build --sample` there. Seeded extension manifests with `sample_support: unsupported` remain approved bundled manifests, but they are not runnable demo lanes until a starter brief and sample provider path are added.

### Show Starter Examples

- `ww2-diary` is a starter on `cinematic` with the `news-broadcast` playbook.
- `thechaosfm` is a branded starter on `news-song` with the `thechaosfm-gta-political` playbook; the show-level Ain't No Crowns benchmark metadata lives in the starter README.
- `last-rev` is a starter that declares `screen-demo` for synthetic terminal walkthroughs and `talking-head` for hosted follow-ups.
- `rave-queen` is a starter on `cinematic`; its README records why `animation` was rejected as the default binding.

## Baseline Comparison

Use [Baseline Comparison Report](baseline-comparison.md) when comparing Show Sidekick demo outputs against a reference baseline from equivalent inputs. The template is filled from `demo-matrix-verification.json`, the demo matrix NDJSON events, generated stage artifacts, and manual notes from the baseline run.

The Ain't No Crowns reference is a [TheChaosFM](../bundled/starters/thechaosfm/README.md) show benchmark. It is not a default-pipeline benchmark and must not be used to judge every `news-song` or bundled default lane.

## Adding A Bundled Pipeline

1. Add `bundled/pipelines/<slug>.yaml`.
2. Add the referenced director skills under `bundled/skills/pipelines/<slug>/`, including `executive-producer.md` when the manifest uses executive-producer orchestration.
3. Add `bundled/skills/pipelines/<slug>/__fixtures__/required-strings.yaml` so content-fidelity tests can lock the critical director instructions.
4. Add the slug to `DEMO_READINESS_INVENTORY` with the correct classification.
5. If a default starter targets the pipeline, keep the classification at `core_default` or `seeded_extension`.
6. Update starter README files so they name both the starter slug and the real pipeline slug. Default bundled starters may not use `pending_pipelines` as an escape hatch.
7. Run the bundled pipeline and starter tests before committing.
