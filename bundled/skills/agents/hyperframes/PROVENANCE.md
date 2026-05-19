# Provenance — HyperFrames Layer 3 Skills

These skills are **vendored** from the upstream HyperFrames monorepo. Do not
edit them expecting the changes to survive a re-sync — changes need to go
upstream, or be recorded in the local-edit log below.

## Source

- Repo: https://github.com/heygen-com/hyperframes
- Local clone: `<hyperframes-clone>`
- Vendored commit: `d291358`
- Vendored date: `2026-04-17`

## Mirrored directories

| Show Sidekick path                               | Upstream path                             |
| ---------------------------------------------- | ----------------------------------------- |
| `.show-sidekick/skills/agents/hyperframes/`                  | `skills/hyperframes/`                     |
| `.show-sidekick/skills/agents/hyperframes-cli/`              | `skills/hyperframes-cli/`                 |
| `.show-sidekick/skills/agents/hyperframes-registry/`         | `skills/hyperframes-registry/`            |
| `.show-sidekick/skills/agents/website-to-hyperframes/`       | `skills/website-to-hyperframes/`          |

The `gsap` upstream skill is NOT re-vendored — Show Sidekick already ships its
own GSAP skill family under `.show-sidekick/skills/agents/gsap*/`.

## Local edits

Any divergence from upstream is noted at the top of the edited file as an
HTML comment starting with `Show Sidekick-local`. Current edits:

- `hyperframes-cli.md` — added `validate` to the command list and a
  dedicated Validation section. Upstream omits it, but the CLI ships it and
  Show Sidekick's HyperFrames runtime path relies on `hyperframes validate` as
  a real browser-based contract check before render.

## Re-sync procedure

```bash
# From the hyperframes clone
cd <hyperframes-clone>
git pull

# From Show Sidekick
cd <Show Sidekick-repo>
rm -rf .show-sidekick/skills/agents/hyperframes .show-sidekick/skills/agents/hyperframes-cli \
       .show-sidekick/skills/agents/hyperframes-registry .show-sidekick/skills/agents/website-to-hyperframes
cp -r <hyperframes-clone>/skills/hyperframes          .show-sidekick/skills/agents/
cp -r <hyperframes-clone>/skills/hyperframes-cli      .show-sidekick/skills/agents/
cp -r <hyperframes-clone>/skills/hyperframes-registry .show-sidekick/skills/agents/
cp -r <hyperframes-clone>/skills/website-to-hyperframes .show-sidekick/skills/agents/
# Then re-apply the local edits listed above and bump the vendored commit SHA.
```

## Why we vendor instead of referencing the upstream clone directly

1. Show Sidekick contributors may not have the HyperFrames monorepo on disk.
2. Skills must be readable from the Show Sidekick tree for agent discovery.
3. We want deterministic knowledge — upstream moves; we control when we pick
   up changes.
