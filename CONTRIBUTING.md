# Contributing

Read [AGENTS.md](AGENTS.md) first. It is the harness contributor contract and takes precedence for agent work in this repository.

## Setup

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev --help
```

Useful checks:

```bash
pnpm lint
pnpm run test:smoke
pnpm run docs:providers:check
pnpm run audit:coverage-drift
```

## Repo Layout

| Path | Purpose |
|---|---|
| `specs/` | Source-of-truth design docs. Update specs when behavior changes. |
| `src/` | CLI, schemas, runner, registry, concrete tools, and library code. |
| `bundled/` | Shipped pipelines, playbooks, skills, schemas, starters, and user-project templates. |
| `scripts/` | Maintenance scripts and generated-doc tooling. |
| `tests/` | Smoke, schema, and integration-style Vitest coverage outside `src/`. |

Do not create, edit, or reference `.migration/` content unless explicitly asked. It is private reference material and must not leak into public docs or committed files.

## Authoring a Pipeline

Pipelines stay declarative:

1. Add or update a manifest in `bundled/pipelines/*.yaml`.
2. Add stage director skills under `bundled/skills/pipelines/<pipeline>/`.
3. Keep stage `skill` paths, produced artifacts, review focus, approval gates, and tool capabilities aligned with the manifest.
4. Add or update starter content only when the pipeline is meant to be user-facing.
5. Update the relevant spec in `specs/` if the pipeline contract changes.

Adding a new show type should usually be YAML plus Markdown. New TypeScript orchestration is the last resort.

## Authoring a Tool

Concrete integrations live in `src/tools/` and default-export `defineTool(...)` from `src/registry`.

Each tool definition needs:

- `name`, `capability`, `provider`, `status`, and `best_for`
- `integration` with kind `cli`, `api`, `binary`, or `library`
- Zod `input` and `output` schemas
- `isAvailable` when the default probe is not enough
- `cost` for paid or metered calls
- `agent_skills` when provider-specific prompting or operation guidance exists

Tests should exercise schema behavior, availability/probe behavior, and any cost or approval-sensitive paths.

After changing a tool definition, regenerate and check the provider catalog:

```bash
pnpm run docs:providers
pnpm run docs:providers:check
```

## Authoring a Skill

Layer 3 provider skills live under `bundled/skills/agents/`. Pipeline director skills live under `bundled/skills/pipelines/`.

Use Markdown with clear frontmatter when the surrounding skill family uses it. Keep skills operational: what to inspect, what decisions to make, which tool capabilities to call through the registry, and what artifact to produce. Do not put project-specific secrets, local machine paths, or private reference names into skills.

Alpha Loop agent assets are sourced from `.alpha-loop/templates/` and synced into `.claude/`, `.codex/`, and `.agents/`. Edit the template source when changing loop assets.

## Tests

Tests use Vitest in Node mode:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Conventions:

- Unit tests live next to source as `*.test.ts`.
- Broader smoke and integration checks live under `tests/`.
- Framework smoke coverage is in `tests/smoke/`.
- Avoid brittle sleeps, network dependencies, and order-dependent fixtures.
- Keep generated docs and schemas checked in when CI expects a clean diff.

## Pull Requests

Before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm run test:smoke
pnpm run docs:providers:check
```

Reference the GitHub issue, explain user-visible behavior, list test results, and call out any spec changes. Breaking changes to `show.yaml`, `episode.yaml`, pipeline manifests, tool registry shape, or checkpoint schemas need a migration note.

## Releasing

Maintainers should use the [public release checklist](docs/release-checklist.md) for ownership setup, launch verification, support triage, and rollback steps before publishing.
