---
name: "podcast-repurpose-scene-director"
description: "Build scene_plan entries from chapter-based segmentation and transcript anchors."
applies_to: "pipelines/podcast-repurpose"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Podcast Repurpose Pipeline

## When To Use

Use this stage after the brief selects the podcast clip strategy. There is no script stage: the source transcript, chapter markers, and reviewed podcast media drive the plan.

## Chapter-Based Segmentation

chapter-based segmentation turns the reviewed podcast into clip windows by starting with chapter markers, refining with transcript topic boundaries, and checking transcript-summary anchors before any scene is approved. Use `transcriber` to generate the transcript and topic-boundary evidence, `scene_detect` to identify visual cut and camera-angle boundaries, and `video_understand` to summarize long sections when chapter titles are missing or too vague.

Apply the segmentation in this order:

1. Prefer explicit chapter markers from the podcast file, platform metadata, or user notes.
2. If chapter markers are absent or too broad, derive provisional windows from transcript topic boundaries such as host questions, guest pivots, recap phrases, and sponsor-break exits.
3. Use transcript-summary anchors to name each segment in plain language and to verify that the selected window contains the promised idea.
4. Snap visual start and end points to `scene_detect` boundaries when the adjustment preserves the transcript meaning.
5. Record why each segment starts and ends where it does, including the chapter marker, transcript phrase, or summary anchor that justified it.

## Process

1. Convert approved candidate segments into planned clips.
2. For each clip, define hook, context line, payoff, source start/end, target aspects, caption needs, and speaker-continuity risk.
3. Use transcript evidence for speech-led clips and frame samples for visual continuity.
4. Mark where cuts can tighten a window without changing the source meaning.
5. Avoid generated support unless the clip needs a title card, context card, or simple visual bridge.

## Quality Gate

- every scene_plan entry references chapter, transcript, or scene_detect evidence,
- every clip has a reason to exist,
- source meaning is preserved,
- chapter-based segmentation is visible in the artifact.
