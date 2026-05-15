# Provider Profiles

Provider profiles are named setup lanes for demos and repeatable validation runs.

## paid-demo

`paid-demo` validates the first paid-provider lane:

- Image generation: `openai_image` using `OPENAI_API_KEY`
- TTS primary: `elevenlabs_tts` using `ELEVENLABS_API_KEY`
- TTS fallback: `openai_tts` using `OPENAI_API_KEY`
- Image-to-video: `higgsfield` with the `higgsfield` binary and `higgsfield whoami`
- Local assembly and probing: `ffmpeg` and `ffprobe`

Run `predit doctor --profile paid-demo` before a paid sample. To record the selected lane for an episode, run `predit build <show>/<episode> --sample --provider-profile paid-demo`.

Provider profiles can also be declared in `episode.provider_profile`, `show.pipelines.<pipeline>.provider_profile`, or `show.defaults.provider_profile`. The CLI flag wins over episode config, then per-pipeline show config, then show defaults. Pipelines with `sample_support: paid` require one of these provider profile selections for `--sample`; pipelines with `sample_support: unsupported` refuse sample mode with a `sample_unsupported` event.

Rejected alternatives are recorded in `decision_log` when the profile is selected: `free-zero-cost`, `mixed`, and provider-specific substitutions such as direct Kling, Runway, Piper, and Google TTS.
