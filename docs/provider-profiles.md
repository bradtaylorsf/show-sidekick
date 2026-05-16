# Provider Profiles

Provider profiles are named setup lanes for demos and repeatable validation runs.

## paid-demo

`paid-demo` validates the first paid-provider lane:

- Primary still generation: `openai_image` using the OpenAI Image API `gpt-image-2` model
- Alternate Higgsfield still generation: `higgsfield_image` using the Higgsfield CLI `gpt_image_2` model
- TTS primary: `elevenlabs_tts` using `ELEVENLABS_API_KEY`
- TTS fallback: `openai_tts` using `OPENAI_API_KEY`
- Image-to-video: `higgsfield` with the `higgsfield` binary and `higgsfield account status --json`
- Local assembly and probing: `ffmpeg` and `ffprobe`

`gpt-image-2` is the OpenAI Image API model id. `gpt_image_2` is the Higgsfield CLI model id. The paid-demo sample path uses OpenAI for primary stills and Higgsfield for image-to-video motion.

Run `predit doctor --profile paid-demo` before a paid sample. To record the selected lane for an episode, run `predit build <show>/<episode> --sample --provider-profile paid-demo`.

Provider keys can be exported in the shell or placed in the user project's gitignored `.env`. Project commands load `.env`, `.env.<command>`, and `.env.local` before checking availability or running tools; exported shell variables override file values.

Provider profiles can also be declared in `episode.provider_profile`, `show.pipelines.<pipeline>.provider_profile`, or `show.defaults.provider_profile`. The CLI flag wins over episode config, then per-pipeline show config, then show defaults. Pipelines with `sample_support: paid` require one of these provider profile selections for `--sample`; pipelines with `sample_support: unsupported` refuse sample mode with a `sample_unsupported` event.

Rejected alternatives are recorded in `decision_log` when the profile is selected: `free-zero-cost`, `mixed`, and provider-specific substitutions such as direct Kling, Runway, Piper, and Google TTS.
