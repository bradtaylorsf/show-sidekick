---
description: "Package presentation-demo rough cuts with deck-specific editor handoff assets."
stage: publish
produces: publish_log
---

# Presentation Demo Publish Director

## Deck Handoff Package

The export package must include the rendered video, original/source deck reference, slide screenshots, narration audio when present, captions or word timings when present, deck manifest, edit decisions, render report, and README notes for the editor.

## Supported Targets

Use only the targets declared by the pipeline: premiere, davinci, capcut, and edl. Fail clearly for unsupported targets rather than producing a partial package.

## Asset Link Modes

Record whether deck assets were copied, symlinked, or referenced in place. `publish_log.json` must include exported outputs, target, asset linkage mode, deck asset paths, captions path when present, and export timestamp.

## Known Limitations

Surface authenticated online slide links, missing speaker notes, missing word timings, and paid-provider narration dependencies as handoff notes instead of hiding them.
