---
"show-sidekick": minor
---

Fix the cuesheet audio step: whisper-cli no longer gets a bogus `--print-progress false` argument, `WHISPER_MODEL` (with `~`/`$HOME`) reaches whisper-cli as a model file path, bare model names resolve to `ggml-<name>.bin` in the whisper cache, and `whisper-cpp` / `WHISPER_CLI` are probed besides `whisper-cli`. Local whisper.cpp stays the default transcriber even when `ELEVENLABS_API_KEY` is set; a new `TRANSCRIPTION_PROVIDER` setting pins whisper-cpp or ElevenLabs Scribe, and Scribe only ever receives `scribe_*` model ids. `showkick doctor` now checks the whisper binary and model. Relative `inputs.*` paths resolve from the episode YAML's folder first (then the project root), an audio `inputs.narration` works as the cuesheet input, `showkick build` creates the episode from a matching `ingest.watch` drop when its YAML is missing, and `showkick watch --import` writes episodes for new drops.
