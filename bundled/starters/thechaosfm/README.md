# The Chaos FM Starter

Audio-led The Chaos FM starter for PS2-era political news songs.

- Starter: `thechaosfm`
- Pipeline slug: `news-song`
- Playbook: `thechaosfm-gta-political`
- Fixture size: generated from `inputs/sample-episode/`
- Expected sample duration: 15 seconds
- Sample inputs: synthesized `track.wav` and `lyrics.txt`

The sample episode is pre-filled for `predit init --starter thechaosfm` and uses project-relative input paths under `shows/thechaosfm/inputs/sample-episode/`.

## Benchmark Metadata

TheChaosFM/Ain't No Crowns is tracked as a show-level benchmark reference, not as a bundled pipeline type.

- Aspect: `16:9`
- Captions: none
- Source policy: source-free
- Image generation: Higgsfield GPT Image 2 still generation through the `higgsfield` CLI, with direct OpenAI image generation as fallback
- Clip generation: Higgsfield Seedance image-to-video clips
- Render target: HyperFrames

Use the [baseline comparison template](../../../docs/baseline-comparison.md) when comparing this show benchmark against a predit demo run. Record it as `show=thechaosfm`, `pipeline=news-song`, and `playbook=thechaosfm-gta-political`.
