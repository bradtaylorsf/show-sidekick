# 02 — Build Stack

## Locked choices

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Node 22 LTS** | First-class native TypeScript support; broad ecosystem; matches the Remotion / HyperFrames host runtime |
| Package manager | **pnpm** | Fast, disk-efficient, strict by default, good monorepo story if we ever split |
| Language | **TypeScript** (strict) | Single language across orchestration, scene composition, and tools |
| Build | **tsc** | Library output for `dist/`; no bundler needed for a Node-only CLI |
| Test | **Vitest** | Fast, ESM-native, good TS DX, snapshot tests |
| CLI library | **Commander** | Stable, well-documented, supports subcommands cleanly |
| Validation | **Zod** | Runtime + static types from one schema; used for tool input/output and YAML config validation |
| YAML | **`yaml`** (eemeli/yaml) | Spec-compliant, preserves comments when round-tripping |
| Terminal color | **picocolors** | Tiny, zero-dep |

## Project conventions

- ESM modules (`"type": "module"` in `package.json`).
- `src/` for source, `dist/` for compiled output (gitignored).
- Tests live next to their subject: `src/foo.ts` ↔ `src/foo.test.ts`.
- One feature per directory under `src/`; barrel `index.ts` files are allowed when they re-export a clean public surface, but never just to flatten paths.
- Comments only for non-obvious *why*. Don't restate what the code does.

## Why not these alternatives

- **Bun**: faster, but Node 22's native TS strip plus the broader maturity on platform APIs (`child_process` edge cases, signal handling) outweighs the speed win for a CLI workload.
- **Deno**: would force npm-compat shims for Commander, Zod, and yaml. Not worth it.
- **tsup / esbuild**: useful when shipping a bundled CLI binary; `tsc` is fine for a Node-only `predit` binary. Revisit if we ever ship single-file binaries.
- **yargs / cac**: Commander has the broadest mindshare; that matters because LLM agents writing subcommands will fall back on common patterns.
