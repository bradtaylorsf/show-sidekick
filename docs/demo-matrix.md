# Demo Matrix

`pnpm demo-matrix` is a harness-maintainer check for bundled starter sample builds. It creates fresh user projects under a temp directory outside the harness repo, runs the local or installed `predit` CLI, initializes starter shows, and executes `predit build <show>/sample-episode --sample`.

## Modes

```bash
pnpm demo-matrix --zero-key
pnpm demo-matrix --paid-demo
pnpm demo-matrix --paid-demo --only news-song --keep-workdir
pnpm demo-matrix --paid-demo --json
```

- `--zero-key` runs starters whose `sample_support` includes `zero-key`. This is the default mode.
- `--paid-demo` runs starters whose `sample_support` includes `paid` and passes `--provider-profile paid-demo` to `predit build`.
- `--only <slug>` restricts the matrix to one or more starter slugs.
- `--keep-workdir` keeps the temp user projects for inspection.
- `--json` emits NDJSON events: `matrix_started`, `lane_completed`, and `matrix_finished`.
- `--cli-path <path>` overrides the CLI binary or TypeScript entrypoint. By default the script runs the local `src/cli/index.ts` through `tsx`.

## Recorded Fields

The `matrix_started` event records the exact CLI invocation, CLI version, selected provider profile, env availability for `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `higgsfield`, and `ffmpeg`, the harness repo root, and the temp working directory.

Each lane result records the starter slug, pipeline, build target, failed command if any, exit code, last parsed NDJSON event, artifact paths under that lane's user project, and duration. Exit code is `0` only when every selected lane reports `status: completed`; otherwise it is `2`.

Generated outputs are never written into the harness repo. Use `--keep-workdir` when you need to inspect checkpoints, cost logs, decisions, or renders after a failure.
