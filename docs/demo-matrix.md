# Demo Matrix

`pnpm demo-matrix` is a harness-maintainer check for bundled starter sample builds. It creates fresh user projects under a temp directory outside the harness repo, runs the local or installed Show Sidekick CLI, initializes starter shows, executes `showkick build <show>/sample-episode --sample`, and verifies the completed artifacts before reporting a lane as completed.

It is a starter smoke matrix, not full manifest coverage. Lanes come from `bundled/starters/`, so non-starter bundled manifests such as `hybrid`, `talking-head`, `clip-factory`, and `character-animation` need the agent-led benchmark plan in [Full Demo Benchmark Plan](full-demo-benchmark.md).

`pnpm show-types:matrix` is the public show-type validation matrix. It consumes the stable `lane_id` values from [Show Types](show-types.md), runs each runnable catalog lane through the same demo-matrix build and export verification path, and records unsupported or not-selected catalog lanes in the final operator report.

## Modes

```bash
pnpm demo-matrix --zero-key
pnpm demo-matrix --paid-demo
pnpm demo-matrix --paid-demo --only news-song --keep-workdir
pnpm demo-matrix --paid-demo --json
pnpm show-types:check
pnpm show-types:matrix -- --zero-key
pnpm show-types:matrix -- --paid-demo
```

- `--zero-key` runs starters whose `sample_support` includes `zero-key`. This is the default mode.
- `--paid-demo` runs starters whose `sample_support` includes `paid` and passes `--provider-profile paid-demo` to `showkick build`.
- `--only <slug>` restricts the matrix to one or more starter slugs.
- `--keep-workdir` keeps the temp user projects for inspection.
- `--json` emits NDJSON events: `matrix_started`, `lane_completed`, and `matrix_finished`.
- `--cli-path <path>` overrides the CLI binary or TypeScript entrypoint. By default the script runs the local `src/cli/index.ts` through `tsx`.

`pnpm show-types:check` validates `docs/show-types.md` against bundled pipelines and starters without rendering. `pnpm show-types:matrix` accepts the same mode flags and writes `show-types-matrix-report.json` plus `show-types-matrix-report.md` for GitHub issues or PRs.

## Recorded Fields

The `matrix_started` event records the exact CLI invocation, CLI version, selected provider profile, env availability for `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `higgsfield`, and `ffmpeg`, the harness repo root, and the temp working directory.

Each lane result records the starter slug, pipeline, build target, failed command if any, exit code, last parsed NDJSON event, artifact paths under that lane's user project, verification details, and duration. Exit code is `0` only when every selected lane reports `status: completed`; otherwise it is `2`.

Show-type reports include one row per catalog lane with status `not-run`, `unsupported`, `setup-missing`, `build-failed`, `export-failed`, or `verified`. A verified lane has completed build verification and exported EDL plus Premiere XML when the pipeline supports that richer NLE target.

## Verification Report

Every run writes `demo-matrix-verification.json` at the matrix working directory root. Use `--keep-workdir` when you need the file after the command exits; otherwise the temp working directory is cleaned up after the final event.

The report has event type `demo_matrix_verification` and records:

- `summary`: total, passed, failed, and skipped verification lanes.
- `lanes[].artifact_presence`: presence and schema validity for `render_report`, `asset_manifest`, `edit_decisions`, `cuesheet`, `cost_log`, and `decision_log` when expected.
- `lanes[].ffprobe_probe`: render duration, resolution, aspect, frame rate, and audio-stream validation against the demo brief and render report.
- `lanes[].export_results`: Premiere XML and EDL export status, with unsupported targets recorded as `skipped_unsupported`.
- `lanes[].frame_summary`: four sampled frame paths plus the generated contact sheet and `frame_summary.json`.

Generated outputs are never written into the harness repo. Use `--keep-workdir` when you need to inspect checkpoints, cost logs, decisions, or renders after a failure.
