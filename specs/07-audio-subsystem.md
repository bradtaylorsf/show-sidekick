# 07 — Audio Subsystem

## Why this is a first-class subsystem

For music-led content (music videos, trailers, news-songs), the precision of audio-to-visual alignment is `predit`'s most important creative quality. The audio subsystem owns this. Pipelines compose its primitives; they never reimplement detection or alignment logic.

For narration-led content, the same primitives align scenes to VO structure (word timestamps, segment boundaries, deliberate pauses).

## Master clock

Each episode runs with exactly one master clock:

- `audio` — music is the time grid. Scenes snap to sections, beats, climax.
- `voiceover` — narration is the time grid. Scenes snap to VO segments and word groups.
- `action_timeline` — for the character-animation pipeline, the per-character action timeline is the time grid. Scenes snap to action milestones (pose holds, beat-aligned action peaks). The audio subsystem still runs (transcription for any narration, beat detection on the music bed) but does not own scene timing.
- `none` — no time grid; the pipeline is not audio-led (e.g. documentary-montage in "tone poem" mode).

The pipeline declares the master clock (`master_clock: audio | voiceover | action_timeline | none`). Single master clock per episode in v1. Hybrid content (music underscore + narration) uses VO as master and treats music as accompaniment that adapts to VO structure.

## The Cuesheet

The canonical artifact of the audio subsystem. Lives at `projects/<show>/<episode>/cuesheet.json`.

```ts
export interface Cuesheet {
  audio: AudioTrack;
  master_clock: 'audio' | 'voiceover';
  bpm?: number;
  segments: Segment[];     // word-level transcript
  sections: Section[];     // structural sections (verse/chorus/bridge/...)
  beats: Beat[];           // rhythmic grid
  climax: ClimaxPoint[];   // moments of arrival
  scene_anchors: SceneAnchor[];  // populated by alignScenes()
}

export interface Word {
  text: string;
  start_s: number;
  end_s: number;
  confidence: number;
}

export interface Segment {
  start_s: number;
  end_s: number;
  text: string;
  words: Word[];
}

export interface Section {
  label: string;                          // "intro" | "verse 1" | "chorus" | ...
  start_s: number;
  end_s: number;
  kind: 'vocal' | 'instrumental' | 'silence';
  energy: number;                         // 0-1 normalized
}

export interface Beat {
  time_s: number;
  strength: number;                       // 0-1
  is_downbeat: boolean;
}

export interface ClimaxPoint {
  time_s: number;
  type: 'peak' | 'drop' | 'arrival' | 'release';
  intensity: number;                      // 0-1
  source: 'algorithm' | 'agent' | 'manual';
}

export interface SceneAnchor {
  scene_id: string;
  start_s: number;
  end_s: number;
  snapped_to: 'section_start' | 'beat' | 'downbeat' | 'word' | 'climax' | 'manual';
  source: { section?: string; beat_index?: number; word_id?: string; climax_index?: number };
}
```

## Primitives

Pure functions over the data model. Each is independently usable; pipelines compose them.

```ts
import * as audio from 'predit/audio';

const track = await audio.load('music_library/midnight-train/track.mp3');

const transcript  = await audio.transcribe(track, { language: 'en' });
const sections    = await audio.detectSections(track, { min_section_s: 8, transcript_hint: transcript.segments });
const { bpm, beats } = await audio.detectBeats(track, { expect_bpm: [60, 200] });
const climax      = await audio.detectClimax(track, { sections });

const cuesheet = await audio.buildCuesheet(track, {
  transcribe: true, detect_sections: true, detect_beats: true, detect_climax: true,
});

const anchors = await audio.alignScenes(scenePlan, cuesheet, {
  master: 'audio',
  snap_to: ['section_start', 'downbeat'],
  align_climax_scene_to: 'chorus-1-hero',
  max_scene_duration_s: 5,
});
```

## Backends

| Primitive | Default backend | Integration kind |
|---|---|---|
| `load` | `ffmpeg` (probe) | binary |
| `transcribe` | `whisper.cpp` local | binary |
| `detectSections` | DIY TS — `ffmpeg silencedetect` + transcript gaps + RMS energy | binary + pure TS |
| `detectBeats` | `aubio` CLI | binary |
| `detectClimax` | DIY TS — RMS peaks weighted by section length; agent can confirm | pure TS |
| `alignScenes` | Pure TS | none |

Alternate backends are available via the registry (e.g. ElevenLabs Scribe for transcription, librosa for beats) and selectable via `registry.select(cap, { prefer: ['elevenlabs-scribe'] })`.

## Alignment defaults

| Pipeline style | `snap_to` defaults |
|---|---|
| Music video | `['section_start', 'downbeat']` — every scene starts on a downbeat at or after its section |
| Trailer | `['beat', 'climax']` — scene durations ramp shorter approaching the climax |
| News-song | `['section_start', 'beat']` — evidence scenes pinned to vocal phrases; b-roll on beats |
| WWII diary / documentary / explainer | `['word']` — visuals change at meaningful word boundaries in the VO |

These are defaults; any pipeline can override.

## Cuesheet as a stage

For audio-led pipelines, building the cuesheet is its own stage (`cuesheet` in the canonical stage list). Reasons:

- Inspectable and reviewable independently of scene planning.
- Reusable artifact — re-running scene planning doesn't re-transcribe or re-detect beats.
- Cacheable — `projects/<show>/<episode>/cuesheet.json` persists across runs.

**`cuesheet` stage vs `audio_sync: build` attribute.** The `cuesheet` stage is one *implementation* of `audio_sync: build`. A pipeline may instead build the cuesheet inside its `script` or `scene_plan` stage by setting that stage's `audio_sync: build`. Only one stage per pipeline may declare `audio_sync: build` (see `specs/05-pipelines.md` → validation rules). The canonical `cuesheet` stage is the recommended pattern; embedding the build into another stage is a workflow optimization that some pipelines may choose.

## Constraints

- `max_scene_duration_s` defaults to 5 across music-led pipelines (validated rule — no scene holds longer than 5s without intentional override).
- Climax alignment is best-effort. If algorithmic detection conflicts with agent intent, the pipeline can mark climax `source: 'manual'` and the harness honors it.
