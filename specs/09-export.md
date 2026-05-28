# 09 — Export (NLE Handoff)

## Why this is a first-class feature

Show Sidekick produces a rough cut. The output is good enough to ship as draft but is designed to be finished in a real NLE. Exporting cleanly to Premiere, CapCut, or DaVinci — with timed cuts, linked assets, and caption tracks — is what makes Show Sidekick a real pre-production tool instead of a closed render pipeline.

## CLI surface

```bash
showkick export <show>/<episode> --target premiere     # Premiere XML + linked assets
showkick export <show>/<episode> --target capcut       # CapCut draft format
showkick export <show>/<episode> --target davinci      # DaVinci Resolve XML
showkick export <show>/<episode> --format edl          # raw EDL (CMX 3600)
showkick export <show>/<episode> --target premiere --asset-link-mode copy
showkick export <show>/<episode> --target premiere --out handoffs
showkick export <show>/<episode> --target premiere --overwrite
```

## Source artifacts

Export reads from existing pipeline artifacts — no extra generation. The artifacts that matter:

| Artifact | Provides |
|---|---|
| `edit_decisions` | Cut list, scene order, scene durations, asset references |
| `cuesheet` | Word-level timing for caption tracks, beat grid for audio sync |
| `asset_manifest` | Absolute paths to images, video clips, audio segments, music track |
| `deck_manifest` | Source-deck provenance, slide screenshots, slide IDs, text/notes provenance for deck-led demos |
| `render_report` | Output video path (for embedding in the export package) |

## Output package shape

```
exports/<show>__<episode>.<target>/
├── timeline.xml | draft.json | timeline.edl
├── assets/
│   ├── 01_intro.png
│   ├── 02_hero_clip.mp4
│   ├── track.mp3
│   └── narration_01.wav
├── captions/
│   └── word_timings.json
├── source/
│   └── deck_manifest.json        # present for deck-led presentation-demo exports
└── README.md                    # how to open this in the target NLE
```

`--out <dir>` changes the export root. When omitted, packages are written under `<project>/exports/`.
Exports refuse to replace an existing package unless `--overwrite` is passed.

Every export also writes `projects/<show>/<episode>/publish_log.json`, recording exported outputs, target, asset linkage mode, package path, source `asset_manifest`, captions path, and export timestamp.

## Pipeline declaration

Pipelines declare which export targets they support. Music videos and trailers export cleanly to all targets; abstract animation may only support EDL.

```yaml
# pipelines/music-video.yaml
export:
  supported_targets: [capcut, premiere, davinci, edl]
  default_target: capcut
```

`showkick export --target X` validates against `supported_targets` and refuses if the target is unsupported (with a clear message).

For `presentation-demo`, supported targets are Premiere, DaVinci, CapCut, and EDL. The package must include the rendered animated explainer/demo rough cut, `deck_manifest`, slide screenshots, narration, captions when available, edit decisions, render report, and handoff metadata. Export must not collapse the deliverable into a static slideshow or a folder of slide images; that is a compose failure, not a supported export mode.

## Asset linkage

`--asset-link-mode` (set via `show.export.asset_link_mode`, overrideable per-call):

- `copy` (default) — copy assets into the export package. Portable. Default for handoff.
- `symlink` — symlink assets in place. Faster, but breaks if the export is moved off the original machine.
- `reference` — reference original paths only, no copy. Smallest export; assumes the editor has the same filesystem layout.

## Target-specific notes

- **Premiere XML (Final Cut Pro 7 XML)**: still the broadest interchange format Premiere imports cleanly. Includes clip cuts, audio tracks, and basic markers. Effects and color grades do not round-trip — that's deliberate (handoff is a starting point, not a finishing point).
- **CapCut draft**: CapCut's JSON draft format. Includes cuts, assets, basic captions. Most useful for mobile-first creators editing on iPad or phone.
- **DaVinci XML**: Resolve imports the same FCP7 XML as Premiere, with slightly better metadata handling. Use this target when the downstream colorist works in DaVinci.
- **EDL (CMX 3600)**: Lowest common denominator. Works in every NLE. Loses captions and clip names but keeps timing perfectly.
