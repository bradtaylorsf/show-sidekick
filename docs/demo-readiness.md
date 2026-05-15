# Demo Readiness Inventory

`src/pipelines/demo-inventory.ts` is the canonical inventory for bundled pipeline demo readiness. Update it in the same change as any bundled manifest or starter binding change.

## Classifications

- `core_default`: primary bundled lanes that default starters may target directly.
- `seeded_extension`: shipped extension lanes that are valid starter targets but are not the first demo path.
- `test_only`: harness test fixtures. These may ship as manifests but must never be used by a default starter.
- `show_starter_only`: show concepts that may exist as starters/playbooks but must not be added as bundled pipeline manifest types.

## Current Bundled Manifest Slugs

Approved demo lanes:

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

## Show Starter Examples

- `ww2-diary` is a starter on `cinematic` with the `news-broadcast` playbook.
- `thechaosfm` is a branded starter on `news-song` with the `thechaosfm-gta-political` playbook; the show-level Ain't No Crowns benchmark metadata lives in the starter README.
- `last-rev` is a starter that declares `screen-demo` for synthetic terminal walkthroughs and `talking-head` for hosted follow-ups.
- `rave-queen` is a starter on `cinematic`; its README records why `animation` was rejected as the default binding.

## Adding A Bundled Pipeline

1. Add `bundled/pipelines/<slug>.yaml`.
2. Add the referenced director skills under `bundled/skills/pipelines/<slug>/`, including `executive-producer.md` when the manifest uses executive-producer orchestration.
3. Add `bundled/skills/pipelines/<slug>/__fixtures__/required-strings.yaml` so content-fidelity tests can lock the critical director instructions.
4. Add the slug to `DEMO_READINESS_INVENTORY` with the correct classification.
5. If a default starter targets the pipeline, keep the classification at `core_default` or `seeded_extension`.
6. Update starter README files so they name both the starter slug and the real pipeline slug. Default bundled starters may not use `pending_pipelines` as an escape hatch.
7. Run the bundled pipeline and starter tests before committing.
