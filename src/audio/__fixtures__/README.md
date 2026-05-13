These MP3 fixtures are deterministic synthetic sine-wave files used by the audio subsystem tests.

Regenerate from the repository root with ffmpeg:

```bash
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" -filter_complex "[0:a]volume=0.8[a0];[1:a]volume=0.2[a1];[a0][a1]concat=n=2:v=0:a=1[out]" -map "[out]" -ac 1 -ar 44100 -b:a 32k src/audio/__fixtures__/clear-break.mp3
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" -f lavfi -i "sine=frequency=440:duration=2:sample_rate=44100" -filter_complex "[0:a]volume=0.6[a0];[1:a]volume=0.45[a1];[a0][a1]concat=n=2:v=0:a=1[out]" -map "[out]" -ac 1 -ar 44100 -b:a 32k src/audio/__fixtures__/subtle-break.mp3
ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=330:duration=3:sample_rate=44100" -filter_complex "[0:a]volume=0.6[out]" -map "[out]" -ac 1 -ar 44100 -b:a 32k src/audio/__fixtures__/instrumental-break.mp3
```
